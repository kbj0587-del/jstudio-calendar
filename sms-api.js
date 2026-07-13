// ══════════════════════════════════════════════════════════════
//  J.SMS 메시지 발송센터 — 백엔드 API 모듈
//  server.js 에서 registerSmsRoutes(app, { getPool, isAdmin, isSubAdmin }) 로 연결
//  기존 안드로이드 게이트웨이(js_message_logs 큐 폴링)를 그대로 재사용한다.
//  발송 = js_message_logs 에 dir='out', status='queued' INSERT → 게이트웨이가 실제 전송.
// ══════════════════════════════════════════════════════════════

function registerSmsRoutes(app, deps) {
  const { getPool, isAdmin, isSubAdmin } = deps;

  // Supabase Storage (mms 버킷) — anon 키는 공개용(publishable)이라 코드 상수 허용.
  // 게이트웨이가 수신 MMS를 저장하는 것과 동일한 public 버킷을 재사용한다.
  const SUPA_URL  = process.env.SUPABASE_URL || 'https://owoviftkszmicysxgdpa.supabase.co';
  const SUPA_ANON = process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93b3ZpZnRrc3ptaWN5c3hnZHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDgyMTgsImV4cCI6MjA5NTkyNDIxOH0.9e4P3we-mlwXtffte1Zkx45nL5ujcN8dtgsLunAOQ9Y';

  // ── 공통 헬퍼 ────────────────────────────────────────────────
  const q = (sql, params) => {
    const pool = getPool();
    if (!pool) throw new Error('DB 연결 없음 (DATABASE_URL 필요)');
    return pool.query(sql, params);
  };

  // 전화번호 → 숫자만 (로그/발송용). 회원 테이블은 하이픈 포함이라 매칭 시 정규화 필요.
  const digits = (s) => String(s || '').replace(/\D/g, '');
  // 번호→id 매핑 등록 (전체 번호 + 뒤 8자리 키 모두 등록해 형식차 흡수)
  const idmapSet = (map, dphone, id) => {
    if (!dphone) return;
    map.set(dphone, id);
    if (dphone.length >= 8) map.set(dphone.slice(-8), id);
  };

  function requireSmsAccess(req, res, next) {
    if (isAdmin(req) || isSubAdmin(req)) return next();
    return res.status(403).json({ error: 'forbidden', message: '관리자 권한이 필요합니다.' });
  }

  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[SMS API]', req.method, req.path, '→', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'server_error', message: e.message });
  });

  // ── 설정 로드/저장 ───────────────────────────────────────────
  async function loadConfig() {
    const r = await q('SELECT data FROM js_sms_config WHERE id = 1');
    if (r.rows.length) return r.rows[0].data || {};
    const def = { senders: [], quotaTotal: 500, autoreplyLastSeen: new Date(0).toISOString() };
    await q('INSERT INTO js_sms_config (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(def)]);
    return def;
  }
  async function saveConfig(data) {
    await q('INSERT INTO js_sms_config (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [JSON.stringify(data)]);
  }

  // 발송 큐에 넣기 (수신거부 자동 제외). 반환 { queued, excluded }
  async function enqueue(phones, content, imageUrl) {
    const list = [...new Set((phones || []).map(digits).filter((p) => p.length >= 8))];
    if (!list.length) return { queued: 0, excluded: 0, blocked: [] };
    const bl = await q('SELECT phone FROM js_blocked');
    const blocked = new Set(bl.rows.map((r) => digits(r.phone)));
    const targets = list.filter((p) => !blocked.has(p));
    const excluded = list.length - targets.length;
    for (const p of targets) {
      await q(
        "INSERT INTO js_message_logs (phone, content, dir, status, image_url) VALUES ($1, $2, 'out', 'queued', $3)",
        [p, content, imageUrl || null]
      );
    }
    return { queued: targets.length, excluded, blocked: [...blocked] };
  }

  // ── 변수 치환 (뿌리오 호환 [*이름*],[*1*]~[*8*] + 이름 있는 변수 [*프로그램*] 등) ──
  function renderTemplate(tpl, r) {
    let out = String(tpl || '');
    out = out.split('[*이름*]').join(r.name || '');
    for (let i = 1; i <= 8; i++) out = out.split('[*' + i + '*]').join(r['v' + i] || '');
    if (r.vars && typeof r.vars === 'object') {
      for (const k of Object.keys(r.vars)) {
        out = out.split('[*' + k + '*]').join(r.vars[k] == null ? '' : String(r.vars[k]));
      }
    }
    return out;
  }

  // ── 자동응답 규칙 매칭 ──────────────────────────────────────
  // 수신 시각(KST) "HH:MM" 반환
  function kstHM(ts) {
    return new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' });
  }
  // 시간창 판정 — 자정 걸침(예: 22:00~07:00)도 지원
  function inTimeWindow(hm, start, end) {
    const st = String(start).slice(0, 5), en = String(end).slice(0, 5);
    if (st === en) return false;
    return st < en ? (hm >= st && hm < en) : (hm >= st || hm < en);
  }
  // 시간대 규칙 우선(수업 중이면 키워드보다 부재응답이 먼저), 다음 키워드 규칙. 1건만 응답.
  function pickAutoreplyRule(rules, text, ts) {
    const hm = kstHM(ts);
    for (const r of rules) {
      if (r.rule_type === 'time' && r.start_time && r.end_time && inTimeWindow(hm, r.start_time, r.end_time)) return r;
    }
    for (const r of rules) {
      if (r.rule_type === 'time') continue;
      const kw = String(r.keyword || '');
      if (!kw) continue;
      const hit = r.match_type === 'exact' ? text === kw : r.match_type === 'starts' ? text.startsWith(kw) : text.includes(kw);
      if (hit) return r;
    }
    return null;
  }

  // ── 백그라운드 tick: 예약발송 실행 + 수신 자동응답/수신거부 처리 ──
  // 서버리스라 별도 크론이 없으므로 API 요청 시 기회적으로 실행 (15초 스로틀)
  let lastTickAt = 0;
  let ticking = false;
  async function runTick(force) {
    const now = Date.now();
    if (!force && (ticking || now - lastTickAt < 15000)) return;
    if (ticking) return;
    ticking = true;
    lastTickAt = now;
    try {
      // 1) 예약 발송 도래분 처리 (items = 대량·변수 분할 배치, phones = 일반 예약)
      const due = await q("SELECT * FROM js_scheduled WHERE status = 'pending' AND send_at <= now() ORDER BY send_at ASC LIMIT 50");
      if (due.rows.length) {
        const blDue = await q('SELECT phone FROM js_blocked');
        const blockedDue = new Set(blDue.rows.map((r) => digits(r.phone)));
        for (const row of due.rows) {
          if (Array.isArray(row.items) && row.items.length) {
            for (const it of row.items) {
              const ph = digits(it.phone);
              if (ph.length < 8 || blockedDue.has(ph)) continue;
              await q("INSERT INTO js_message_logs (phone, content, dir, status, image_url) VALUES ($1, $2, 'out', 'queued', $3)",
                [ph, it.content || '', row.image_url || null]);
            }
          } else {
            const phones = Array.isArray(row.phones) ? row.phones : [];
            await enqueue(phones, row.content, row.image_url);
          }
          await q("UPDATE js_scheduled SET status = 'sent' WHERE id = $1", [row.id]);
        }
      }

      // 2) 신규 수신 메시지 → 수신거부 자동등록 + 자동응답
      const cfg = await loadConfig();
      const lastSeen = cfg.autoreplyLastSeen || new Date(0).toISOString();
      const inbound = await q(
        "SELECT id, phone, content, created_at FROM js_message_logs WHERE dir = 'in' AND created_at > $1 ORDER BY created_at ASC LIMIT 100",
        [lastSeen]
      );
      if (inbound.rows.length) {
        const rules = await q("SELECT * FROM js_autoreply WHERE enabled = true ORDER BY created_at ASC");
        const bl = await q('SELECT phone FROM js_blocked');
        const blocked = new Set(bl.rows.map((r) => digits(r.phone)));
        // ⚠️ pg는 created_at을 Date 객체로 반환 → 문자열과 비교하면 항상 false가 되어
        //    lastSeen이 갱신되지 않고 같은 수신 문자에 무한 재응답하는 버그가 있었음.
        //    반드시 ms 숫자로 비교한다.
        let maxSeenMs = new Date(lastSeen).getTime() || 0;
        for (const m of inbound.rows) {
          const text = String(m.content || '').trim();
          const ph = digits(m.phone);
          const ms = new Date(m.created_at).getTime();
          if (ms > maxSeenMs) maxSeenMs = ms;
          // 수신거부 자동 등록
          if (/^수신\s*거부$/.test(text) || text === '거부') {
            await q("INSERT INTO js_blocked (phone, reason) VALUES ($1, '자동(수신거부 회신)') ON CONFLICT (phone) DO NOTHING", [ph]);
            blocked.add(ph);
            continue;
          }
          if (blocked.has(ph)) continue;
          const rule = pickAutoreplyRule(rules.rows, text, m.created_at);
          if (!rule) continue;
          // 재발송 방지 쿨다운(서버리스 다중 인스턴스 대비, DB 기준):
          // 같은 번호로 같은 내용을 60분 내 이미 보냈으면 다시 보내지 않는다.
          const dup = await q(
            "SELECT 1 FROM js_message_logs WHERE dir='out' AND phone=$1 AND content=$2 AND created_at > now() - interval '60 minutes' LIMIT 1",
            [ph, rule.reply_content]
          );
          if (dup.rows.length) continue;
          await enqueue([ph], rule.reply_content, null);
        }
        cfg.autoreplyLastSeen = new Date(maxSeenMs).toISOString();
        await saveConfig(cfg);
      }
    } catch (e) {
      console.error('[SMS tick]', e.message);
    } finally {
      ticking = false;
    }
  }

  // ══════════════════════════════════════════════════════════
  //  대시보드 부트스트랩
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/bootstrap', requireSmsAccess, wrap(async (req, res) => {
    runTick();
    const cfg = await loadConfig();
    const todayOut = await q(
      "SELECT count(*)::int n FROM js_message_logs WHERE dir = 'out' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'"
    );
    const gw = await q('SELECT id, network_status, last_ping FROM js_gateway_status ORDER BY last_ping DESC');
    const blocked = await q('SELECT count(*)::int n FROM js_blocked');
    // 게이트웨이 온라인 = 최근 10분 내 핑
    const online = gw.rows.some((r) => r.last_ping && (Date.now() - new Date(r.last_ping).getTime()) < 10 * 60 * 1000);
    res.json({
      senders: cfg.senders || [],
      quotaTotal: cfg.quotaTotal || 500,
      quotaUsed: todayOut.rows[0].n,
      blockedCount: blocked.rows[0].n,
      gatewayOnline: online,
      gateway: gw.rows,
    });
  }));

  app.post('/api/sms/config', requireSmsAccess, wrap(async (req, res) => {
    const cfg = await loadConfig();
    if (Array.isArray(req.body.senders)) cfg.senders = req.body.senders;
    if (Number.isFinite(req.body.quotaTotal)) cfg.quotaTotal = req.body.quotaTotal;
    await saveConfig(cfg);
    res.json({ ok: true, senders: cfg.senders, quotaTotal: cfg.quotaTotal });
  }));

  // ══════════════════════════════════════════════════════════
  //  회원(연락처) CRUD  — js_members
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/members', requireSmsAccess, wrap(async (req, res) => {
    const term = (req.query.q || '').trim();
    let sql = 'SELECT id, name, phone, program, group_type, remaining, end_date, created_at FROM js_members';
    const params = [];
    if (term) {
      params.push('%' + term + '%');
      sql += ' WHERE name ILIKE $1 OR phone ILIKE $1';
    }
    sql += ' ORDER BY name ASC';
    const r = await q(sql, params);
    // 수신거부 여부 표시
    const bl = await q('SELECT phone FROM js_blocked');
    const blocked = new Set(bl.rows.map((x) => digits(x.phone)));
    res.json(r.rows.map((m) => ({ ...m, blocked: blocked.has(digits(m.phone)) })));
  }));

  app.post('/api/sms/members', requireSmsAccess, wrap(async (req, res) => {
    const { name, phone, program, group_type, remaining, end_date } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name/phone 필수' });
    const r = await q(
      `INSERT INTO js_members (name, phone, program, group_type, remaining, end_date)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name, program=EXCLUDED.program,
         group_type=EXCLUDED.group_type, remaining=EXCLUDED.remaining, end_date=EXCLUDED.end_date
       RETURNING *`,
      [name, phone, program || null, group_type || 'active', Number(remaining) || 0, end_date || null]
    );
    res.json({ ok: true, member: r.rows[0] });
  }));

  app.put('/api/sms/members/:id', requireSmsAccess, wrap(async (req, res) => {
    const { name, phone, program, group_type, remaining, end_date } = req.body;
    const r = await q(
      `UPDATE js_members SET name=$1, phone=$2, program=$3, group_type=$4, remaining=$5, end_date=$6
       WHERE id=$7 RETURNING *`,
      [name, phone, program || null, group_type || 'active', Number(remaining) || 0, end_date || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, member: r.rows[0] });
  }));

  app.delete('/api/sms/members/:id', requireSmsAccess, wrap(async (req, res) => {
    await q('DELETE FROM js_members WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  }));

  // 대량 import (엑셀/텍스트 파싱 결과: [{name, phone, program?}])
  app.post('/api/sms/members/import', requireSmsAccess, wrap(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let ok = 0;
    for (const m of rows) {
      if (!m.name || !m.phone) continue;
      await q(
        `INSERT INTO js_members (name, phone, program, group_type, remaining, end_date)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name`,
        [m.name, m.phone, m.program || null, m.group_type || 'active', Number(m.remaining) || 0, m.end_date || null]
      );
      ok++;
    }
    res.json({ ok: true, imported: ok });
  }));

  // 구글 연락처 가져오기 (라벨→그룹 포함). body.rows = [{name, phone, labels:[...]}]
  // 회원 upsert + 라벨을 js_groups로 find-or-create + 멤버 배정. 벌크 처리(대량 대응).
  const GROUP_COLORS = ['#0071e3', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#ff3b30'];
  app.post('/api/sms/google-import', requireSmsAccess, wrap(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    // 정규화 + 번호 기준 중복 제거(마지막 우선), 라벨 합집합
    const byPhone = new Map();
    for (const m of rows) {
      const phone = digits(m.phone);
      const name = String(m.name || '').trim();
      if (phone.length < 8 || !name) continue;
      const labels = (Array.isArray(m.labels) ? m.labels : [])
        .map((l) => String(l || '').trim())
        .filter((l) => l && !l.startsWith('*'));   // * 시스템 라벨 제외
      const prev = byPhone.get(phone);
      if (prev) { prev.name = name; labels.forEach((l) => prev.labels.add(l)); }
      else byPhone.set(phone, { phone, name, labels: new Set(labels) });
    }
    const list = [...byPhone.values()];
    if (!list.length) return res.json({ ok: true, imported: 0, groups: 0, assigned: 0 });

    // 1) 회원 upsert (500건 청크 멀티로우)
    let imported = 0;
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      const vals = [], params = [];
      chunk.forEach((m, j) => {
        const b = j * 3;
        vals.push(`($${b + 1},$${b + 2},$${b + 3})`);
        params.push(m.name, m.phone, 'active');
      });
      await q(
        `INSERT INTO js_members (name, phone, group_type) VALUES ${vals.join(',')}
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name`,
        params
      );
      imported += chunk.length;
    }

    // 2) 전화번호 → member_id 매핑 (숫자만 기준)
    const idmap = new Map();
    const allPhones = list.map((m) => m.phone);
    for (let i = 0; i < allPhones.length; i += 1000) {
      const chunk = allPhones.slice(i, i + 1000);
      const ph = chunk.map((_, j) => `$${j + 1}`).join(',');
      const r = await q(
        `SELECT id, regexp_replace(phone,'\\D','','g') dphone FROM js_members
         WHERE regexp_replace(phone,'\\D','','g') IN (${ph})`, chunk
      );
      r.rows.forEach((row) => idmapSet(idmap, row.dphone, row.id));
    }

    // 3) 라벨 → 그룹 find-or-create
    const wantLabels = [...new Set(list.flatMap((m) => [...m.labels]))];
    const groupId = {};
    if (wantLabels.length) {
      const existing = await q('SELECT id, name FROM js_groups');
      existing.rows.forEach((g) => { groupId[g.name] = g.id; });
      let ci = existing.rows.length;
      for (const label of wantLabels) {
        if (groupId[label]) continue;
        const gr = await q('INSERT INTO js_groups (name, color) VALUES ($1,$2) RETURNING id',
          [label, GROUP_COLORS[ci % GROUP_COLORS.length]]);
        groupId[label] = gr.rows[0].id;
        ci++;
      }
    }

    // 4) 멤버십 벌크 배정 (중복은 무시)
    const pairs = [];
    for (const m of list) {
      const mid = idmap.get(m.phone);
      if (!mid) continue;
      for (const label of m.labels) {
        const gid = groupId[label];
        if (gid) pairs.push([gid, mid]);
      }
    }
    let assigned = 0;
    for (let i = 0; i < pairs.length; i += 500) {
      const chunk = pairs.slice(i, i + 500);
      const vals = [], params = [];
      chunk.forEach((p, j) => { const b = j * 2; vals.push(`($${b + 1},$${b + 2})`); params.push(p[0], p[1]); });
      await q(`INSERT INTO js_group_members (group_id, member_id) VALUES ${vals.join(',')} ON CONFLICT DO NOTHING`, params);
      assigned += chunk.length;
    }
    res.json({ ok: true, imported, groups: wantLabels.length, assigned });
  }));

  // ══════════════════════════════════════════════════════════
  //  그룹 CRUD  — js_groups + js_group_members
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/groups', requireSmsAccess, wrap(async (req, res) => {
    const r = await q(
      `SELECT g.id, g.name, g.color, g.created_at, count(gm.member_id)::int member_count
       FROM js_groups g LEFT JOIN js_group_members gm ON gm.group_id = g.id
       GROUP BY g.id ORDER BY g.created_at ASC`
    );
    res.json(r.rows);
  }));

  app.post('/api/sms/groups', requireSmsAccess, wrap(async (req, res) => {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name 필수' });
    const r = await q('INSERT INTO js_groups (name, color) VALUES ($1,$2) RETURNING *', [name, color || '#0071e3']);
    res.json({ ok: true, group: r.rows[0] });
  }));

  app.put('/api/sms/groups/:id', requireSmsAccess, wrap(async (req, res) => {
    const { name, color } = req.body;
    const r = await q('UPDATE js_groups SET name=$1, color=$2 WHERE id=$3 RETURNING *', [name, color || '#0071e3', req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, group: r.rows[0] });
  }));

  app.delete('/api/sms/groups/:id', requireSmsAccess, wrap(async (req, res) => {
    await q('DELETE FROM js_groups WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  }));

  // 그룹 소속 회원 조회
  app.get('/api/sms/groups/:id/members', requireSmsAccess, wrap(async (req, res) => {
    const r = await q(
      `SELECT m.id, m.name, m.phone, m.program, m.group_type FROM js_group_members gm
       JOIN js_members m ON m.id = gm.member_id WHERE gm.group_id = $1 ORDER BY m.name ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  }));

  // 그룹 멤버 설정 (전체 교체)
  app.post('/api/sms/groups/:id/members', requireSmsAccess, wrap(async (req, res) => {
    const ids = Array.isArray(req.body.member_ids) ? req.body.member_ids : [];
    await q('DELETE FROM js_group_members WHERE group_id=$1', [req.params.id]);
    for (const mid of ids) {
      await q('INSERT INTO js_group_members (group_id, member_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, mid]);
    }
    res.json({ ok: true, count: ids.length });
  }));

  // ══════════════════════════════════════════════════════════
  //  템플릿 CRUD  — js_templates
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/templates', requireSmsAccess, wrap(async (req, res) => {
    const r = await q('SELECT id, title, content, created_at FROM js_templates ORDER BY created_at DESC');
    res.json(r.rows);
  }));
  app.post('/api/sms/templates', requireSmsAccess, wrap(async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title/content 필수' });
    const r = await q('INSERT INTO js_templates (title, content) VALUES ($1,$2) RETURNING *', [title, content]);
    res.json({ ok: true, template: r.rows[0] });
  }));
  app.put('/api/sms/templates/:id', requireSmsAccess, wrap(async (req, res) => {
    const { title, content } = req.body;
    const r = await q('UPDATE js_templates SET title=$1, content=$2 WHERE id=$3 RETURNING *', [title, content, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, template: r.rows[0] });
  }));
  app.delete('/api/sms/templates/:id', requireSmsAccess, wrap(async (req, res) => {
    await q('DELETE FROM js_templates WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  }));

  // ══════════════════════════════════════════════════════════
  //  발송 / 예약
  // ══════════════════════════════════════════════════════════
  app.post('/api/sms/send', requireSmsAccess, wrap(async (req, res) => {
    const { phones, content, image_url } = req.body;
    if (!content && !image_url) return res.status(400).json({ error: '내용 또는 이미지 필요' });
    if (!Array.isArray(phones) || !phones.length) return res.status(400).json({ error: '수신자 없음' });
    const r = await enqueue(phones, content || '', image_url);
    res.json({ ok: true, ...r });
  }));

  // 대량·변수 발송: 수신자별 치환 후 큐 등록. 100건 초과분은 분당 20건으로 자동 분할.
  // 개인 회선 게이트웨이 보호 목적 — 한 번에 대량 삽입 시 통신사 스팸 판정 위험.
  const BULK_IMMEDIATE = 100;   // 즉시 큐 상한
  const BULK_PER_MIN   = 20;    // 분할 배치 크기(분당)
  app.post('/api/sms/send-bulk', requireSmsAccess, wrap(async (req, res) => {
    const { template, image_url, recipients } = req.body;
    if (!Array.isArray(recipients) || !recipients.length) return res.status(400).json({ error: '수신자 없음' });
    if (!template && !image_url) return res.status(400).json({ error: '내용 또는 이미지 필요' });

    // 정규화 + 중복 제거
    const seen = new Set();
    const list = [];
    for (const r of recipients) {
      const ph = digits(r.phone);
      if (ph.length < 8 || seen.has(ph)) continue;
      seen.add(ph);
      list.push({ ...r, phone: ph });
    }
    // 수신거부 제외
    const bl = await q('SELECT phone FROM js_blocked');
    const blocked = new Set(bl.rows.map((x) => digits(x.phone)));
    const targets = list.filter((r) => !blocked.has(r.phone));
    const excluded = list.length - targets.length;
    if (!targets.length) return res.json({ ok: true, queued: 0, scheduled: 0, batches: 0, excluded, total: 0 });

    const items = targets.map((r) => ({ phone: r.phone, content: renderTemplate(template, r) }));
    let queued = 0, scheduled = 0, batches = 0;
    const immediate = items.slice(0, BULK_IMMEDIATE);
    for (const it of immediate) {
      await q("INSERT INTO js_message_logs (phone, content, dir, status, image_url) VALUES ($1, $2, 'out', 'queued', $3)",
        [it.phone, it.content, image_url || null]);
      queued++;
    }
    const rest = items.slice(BULK_IMMEDIATE);
    for (let i = 0; i < rest.length; i += BULK_PER_MIN) {
      const batch = rest.slice(i, i + BULK_PER_MIN);
      batches++;
      await q(
        "INSERT INTO js_scheduled (phones, content, image_url, send_at, items) VALUES ('[]', '', $1, now() + ($2 || ' minutes')::interval, $3)",
        [image_url || null, String(batches), JSON.stringify(batch)]
      );
      scheduled += batch.length;
    }
    res.json({ ok: true, queued, scheduled, batches, excluded, total: items.length });
  }));

  app.post('/api/sms/schedule', requireSmsAccess, wrap(async (req, res) => {
    const { phones, content, image_url, send_at } = req.body;
    if (!Array.isArray(phones) || !phones.length) return res.status(400).json({ error: '수신자 없음' });
    if (!send_at) return res.status(400).json({ error: '예약 시각 필요' });
    const norm = [...new Set(phones.map(digits).filter((p) => p.length >= 8))];
    const r = await q(
      "INSERT INTO js_scheduled (phones, content, image_url, send_at) VALUES ($1,$2,$3,$4) RETURNING *",
      [JSON.stringify(norm), content || '', image_url || null, send_at]
    );
    res.json({ ok: true, scheduled: r.rows[0] });
  }));

  app.get('/api/sms/scheduled', requireSmsAccess, wrap(async (req, res) => {
    runTick();
    const r = await q("SELECT * FROM js_scheduled WHERE status='pending' ORDER BY send_at ASC");
    res.json(r.rows);
  }));

  app.delete('/api/sms/scheduled/:id', requireSmsAccess, wrap(async (req, res) => {
    await q("UPDATE js_scheduled SET status='canceled' WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  }));

  // ══════════════════════════════════════════════════════════
  //  이력 / 대화 스레드
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/history', requireSmsAccess, wrap(async (req, res) => {
    const { dir, q: term } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const params = [];
    const cond = [];
    if (dir === 'in' || dir === 'out') { params.push(dir); cond.push(`dir = $${params.length}`); }
    if (term) { params.push('%' + term + '%'); cond.push(`(phone ILIKE $${params.length} OR content ILIKE $${params.length})`); }
    params.push(limit);
    const sql = `SELECT id, phone, content, dir, status, image_url, created_at FROM js_message_logs
                 ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
                 ORDER BY created_at DESC LIMIT $${params.length}`;
    const r = await q(sql, params);
    res.json(r.rows);
  }));

  // 대화 스레드 목록 (번호별 최근 메시지 + 회원명)
  app.get('/api/sms/threads', requireSmsAccess, wrap(async (req, res) => {
    runTick();
    const r = await q(
      `SELECT DISTINCT ON (phone) phone, content, dir, image_url, created_at
       FROM js_message_logs ORDER BY phone, created_at DESC`
    );
    // 최근 대화순 정렬
    const threads = r.rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    // 이름 해석: 게이트웨이 주소록 → 회원 명부 순으로 덮어써서 회원 명부가 우선
    const nameByPhone = {};
    const gc = await q('SELECT name, phone FROM js_gateway_contacts');
    gc.rows.forEach((c) => { nameByPhone[digits(c.phone)] = c.name; });
    const members = await q('SELECT name, phone FROM js_members');
    members.rows.forEach((m) => { nameByPhone[digits(m.phone)] = m.name; });
    res.json(threads.map((t) => ({
      phone: t.phone,
      name: nameByPhone[digits(t.phone)] || t.phone,
      last: t.image_url && !t.content ? '[이미지]' : (t.content || ''),
      dir: t.dir,
      created_at: t.created_at,
    })));
  }));

  // 특정 번호 대화 내역
  app.get('/api/sms/thread/:phone', requireSmsAccess, wrap(async (req, res) => {
    const ph = digits(req.params.phone);
    const r = await q(
      "SELECT id, phone, content, dir, status, image_url, created_at FROM js_message_logs WHERE regexp_replace(phone,'\\D','','g') = $1 ORDER BY created_at ASC LIMIT 500",
      [ph]
    );
    res.json(r.rows);
  }));

  // ══════════════════════════════════════════════════════════
  //  수신 거부 관리
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/blocked', requireSmsAccess, wrap(async (req, res) => {
    const r = await q('SELECT id, phone, reason, created_at FROM js_blocked ORDER BY created_at DESC');
    res.json(r.rows);
  }));
  app.post('/api/sms/blocked', requireSmsAccess, wrap(async (req, res) => {
    const ph = digits(req.body.phone);
    if (ph.length < 8) return res.status(400).json({ error: '번호 형식 오류' });
    const r = await q(
      "INSERT INTO js_blocked (phone, reason) VALUES ($1,$2) ON CONFLICT (phone) DO UPDATE SET reason=EXCLUDED.reason RETURNING *",
      [ph, req.body.reason || '수동 등록']
    );
    res.json({ ok: true, blocked: r.rows[0] });
  }));
  app.delete('/api/sms/blocked/:id', requireSmsAccess, wrap(async (req, res) => {
    await q('DELETE FROM js_blocked WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  }));

  // ══════════════════════════════════════════════════════════
  //  자동 응답 규칙
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/autoreply', requireSmsAccess, wrap(async (req, res) => {
    const r = await q('SELECT * FROM js_autoreply ORDER BY created_at ASC');
    res.json(r.rows);
  }));
  // 규칙 본문 검증: keyword형=키워드 필수, time형=시작/종료 시각 필수
  function validAutoreplyBody(b) {
    const type = b.rule_type === 'time' ? 'time' : 'keyword';
    if (!b.reply_content) return { error: '응답 내용은 필수입니다' };
    if (type === 'keyword' && !b.keyword) return { error: '키워드는 필수입니다' };
    if (type === 'time' && (!b.start_time || !b.end_time)) return { error: '시작/종료 시각은 필수입니다' };
    return {
      type,
      keyword: type === 'keyword' ? b.keyword : '',
      match_type: b.match_type || 'contains',
      reply_content: b.reply_content,
      enabled: !!b.enabled,
      start_time: type === 'time' ? b.start_time : null,
      end_time: type === 'time' ? b.end_time : null,
    };
  }
  app.post('/api/sms/autoreply', requireSmsAccess, wrap(async (req, res) => {
    const v = validAutoreplyBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const r = await q(
      'INSERT INTO js_autoreply (keyword, match_type, reply_content, enabled, rule_type, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [v.keyword, v.match_type, v.reply_content, v.enabled, v.type, v.start_time, v.end_time]
    );
    res.json({ ok: true, rule: r.rows[0] });
  }));
  app.put('/api/sms/autoreply/:id', requireSmsAccess, wrap(async (req, res) => {
    const v = validAutoreplyBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const r = await q(
      'UPDATE js_autoreply SET keyword=$1, match_type=$2, reply_content=$3, enabled=$4, rule_type=$5, start_time=$6, end_time=$7 WHERE id=$8 RETURNING *',
      [v.keyword, v.match_type, v.reply_content, v.enabled, v.type, v.start_time, v.end_time, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, rule: r.rows[0] });
  }));
  app.delete('/api/sms/autoreply/:id', requireSmsAccess, wrap(async (req, res) => {
    await q('DELETE FROM js_autoreply WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  }));

  // ══════════════════════════════════════════════════════════
  //  URL 단축  — /s/:code 리다이렉트 + 클릭 집계
  // ══════════════════════════════════════════════════════════
  app.post('/api/sms/shorten', requireSmsAccess, wrap(async (req, res) => {
    let url = String(req.body.url || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    // 이미 발급된 URL 재사용
    const ex = await q('SELECT code FROM js_short_urls WHERE url = $1 LIMIT 1', [url]);
    let code;
    if (ex.rows.length) {
      code = ex.rows[0].code;
    } else {
      for (let i = 0; i < 5; i++) {
        code = Math.random().toString(36).slice(2, 8);
        try {
          await q('INSERT INTO js_short_urls (code, url) VALUES ($1,$2)', [code, url]);
          break;
        } catch (e) { code = null; }
      }
      if (!code) return res.status(500).json({ error: '코드 생성 실패' });
    }
    const base = (req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] : req.protocol) + '://' + req.headers.host;
    res.json({ ok: true, code, short: base + '/s/' + code, original: url });
  }));

  // 공개 리다이렉트 (인증 불필요)
  app.get('/s/:code', wrap(async (req, res) => {
    const r = await q('SELECT url FROM js_short_urls WHERE code = $1', [req.params.code]);
    if (!r.rows.length) return res.status(404).send('링크를 찾을 수 없습니다.');
    q('UPDATE js_short_urls SET clicks = clicks + 1 WHERE code = $1', [req.params.code]).catch(() => {});
    res.redirect(302, r.rows[0].url);
  }));

  // ══════════════════════════════════════════════════════════
  //  게이트웨이 주소록 연동 — js_gateway_contacts (폰이 anon 키로 직접 upsert)
  // ══════════════════════════════════════════════════════════
  app.get('/api/sms/gateway-contacts', requireSmsAccess, wrap(async (req, res) => {
    const gc = await q('SELECT phone, name, updated_at FROM js_gateway_contacts ORDER BY name ASC');
    const mem = await q('SELECT phone FROM js_members');
    const memberPhones = new Set(mem.rows.map((m) => digits(m.phone)));
    res.json(gc.rows.map((c) => ({ ...c, in_members: memberPhones.has(digits(c.phone)) })));
  }));

  // 회원 명부에 없는 게이트웨이 연락처를 일괄 등록
  app.post('/api/sms/gateway-contacts/import', requireSmsAccess, wrap(async (req, res) => {
    const gc = await q('SELECT phone, name FROM js_gateway_contacts');
    const mem = await q('SELECT phone FROM js_members');
    const memberPhones = new Set(mem.rows.map((m) => digits(m.phone)));
    let imported = 0;
    for (const c of gc.rows) {
      const ph = digits(c.phone);
      if (ph.length < 8 || memberPhones.has(ph) || !c.name) continue;
      await q(
        "INSERT INTO js_members (name, phone, group_type) VALUES ($1, $2, 'new') ON CONFLICT (phone) DO NOTHING",
        [c.name, ph]
      );
      imported++;
    }
    res.json({ ok: true, imported });
  }));

  // ══════════════════════════════════════════════════════════
  //  이미지 업로드 (MMS) — base64 수신 → Supabase mms 버킷 업로드 → 공개 URL 반환
  // ══════════════════════════════════════════════════════════
  app.post('/api/sms/upload-image', requireSmsAccess, wrap(async (req, res) => {
    const { data, contentType, ext } = req.body;
    if (!data) return res.status(400).json({ error: '이미지 데이터 없음' });
    const buf = Buffer.from(data, 'base64');
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: '5MB 이하만 가능합니다' });
    const safeExt = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase() || 'jpg';
    const name = 'out/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + safeExt;
    const up = await fetch(SUPA_URL + '/storage/v1/object/mms/' + name, {
      method: 'POST',
      headers: {
        apikey: SUPA_ANON,
        authorization: 'Bearer ' + SUPA_ANON,
        'content-type': contentType || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (!up.ok) {
      const t = await up.text().catch(() => '');
      throw new Error('스토리지 업로드 실패 (' + up.status + ') ' + t.slice(0, 120));
    }
    res.json({ ok: true, url: SUPA_URL + '/storage/v1/object/public/mms/' + name });
  }));

  // 수동 tick (대시보드 폴링용)
  app.get('/api/sms/tick', requireSmsAccess, wrap(async (req, res) => {
    await runTick(true);
    res.json({ ok: true });
  }));

  console.log('📨 J.SMS 발송센터 라우트 등록 완료 (/api/sms/*, /s/:code)');
}

module.exports = { registerSmsRoutes };
