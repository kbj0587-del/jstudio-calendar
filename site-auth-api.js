// site-auth-api.js
// 미사제이스튜디오 사이트(mjs.ai.kr) 회원 계정 — 가입 요청·승인·로그인·등급
//  server.js 에서 registerSiteAuthRoutes(app, { getPool }) 로 연결.
//  mjs.ai.kr 의 /api/site/* 를 Vercel 리라이트로 이 서버에 넘겨, 로그인 쿠키가 mjs.ai.kr 자기 쿠키가 되게 함.
//  등급: guest < member < student < instructor < admin < owner(최종관리자 1명)
//  가입은 승인제: 가입 요청(pending) → 관리자/최종관리자가 등급을 골라 승인(active) 또는 거절(rejected).
const crypto = require('crypto');

const SECRET = process.env.SITE_AUTH_SECRET || process.env.LECTURE_SECRET || process.env.ADMIN_PASSWORD || 'mjs-site-dev';
const OWNER_PHONE = String(process.env.SITE_OWNER_PHONE || '').replace(/\D/g, '');
const COOKIE = 'mjs_sid';
const DAY = 24 * 60 * 60;
const ALLOW_ORIGINS = ['https://www.mjs.ai.kr', 'https://mjs.ai.kr'];
const ROLES = ['guest', 'member', 'student', 'instructor', 'admin', 'owner'];
const RANK = { guest: 0, member: 1, student: 2, instructor: 3, admin: 4, owner: 5 };
const ROLE_KO = { guest: '손님', member: '회원', student: '수강생', instructor: '강사', admin: '관리자', owner: '최종관리자' };
const TERMS_VER = '2026-11-01';
const PRIVACY_VER = '2026-11-01';

function registerSiteAuthRoutes(app, deps) {
  const { getPool } = deps;
  const q = (sql, params) => {
    const pool = getPool();
    if (!pool) throw new Error('DB 연결 없음 (DATABASE_URL 필요)');
    return pool.query(sql, params);
  };
  const wrap = (fn) => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    Promise.resolve(fn(req, res)).catch((e) => {
      console.error('[site-auth]', (e && e.message) || e);
      if (!res.headersSent) res.status(500).json({ error: 'server', message: '일시적인 오류입니다. 잠시 후 다시 시도해 주세요.' });
    });
  };

  // ── 테이블 ──
  let ready = false;
  async function ensureTables() {
    if (ready) return;
    await q(`CREATE TABLE IF NOT EXISTS site_users (
      id serial PRIMARY KEY,
      phone text UNIQUE NOT NULL,
      name text NOT NULL,
      email text,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'member',
      status text NOT NULL DEFAULT 'pending',
      signup_purpose text,
      approved_by integer,
      approved_at timestamptz,
      reject_reason text,
      must_change_pw boolean NOT NULL DEFAULT false,
      token_version integer NOT NULL DEFAULT 0,
      fail_count integer NOT NULL DEFAULT 0,
      locked_until timestamptz,
      terms_ver text, privacy_ver text,
      marketing_opt boolean NOT NULL DEFAULT false,
      agreed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz
    )`);
    // 로그인 아이디 (2026-11-01: 휴대폰 번호 로그인 → 아이디 로그인으로 전환)
    await q(`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS login_id text`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS site_users_login_id_uq ON site_users (lower(login_id))`);
    await q(`CREATE TABLE IF NOT EXISTS site_role_log (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      user_name text,
      from_role text, to_role text,
      from_status text, to_status text,
      by_user integer, by_name text,
      reason text,
      at timestamptz NOT NULL DEFAULT now()
    )`);
    ready = true;
  }

  // ── 유틸 ──
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const validPhone = (p) => /^01[016789]\d{7,8}$/.test(p);
  const fmtPhone = (p) => p.length === 11 ? p.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : p.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  // 아이디: 영문 소문자로 시작, 영문 소문자·숫자·밑줄 4~20자
  const normId = (s) => String(s || '').trim().toLowerCase();
  const validId = (s) => /^[a-z][a-z0-9_]{3,19}$/.test(s);
  const ID_RULE = '아이디는 영문 소문자로 시작하는 4~20자(영문 소문자·숫자·밑줄)로 정해 주세요.';
  async function idTaken(id, exceptUserId) {
    const r = await q('SELECT id FROM site_users WHERE lower(login_id)=$1 AND id<>$2', [id, exceptUserId || 0]);
    return r.rows.length > 0;
  }
  const maskPhone = (p) => { const f = fmtPhone(p); return f.replace(/-(\d{3,4})-/, (m, mid) => '-' + '*'.repeat(mid.length) + '-'); };

  function hashPw(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    return 'scrypt$' + salt + '$' + h;
  }
  function checkPw(pw, stored) {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const h = crypto.scryptSync(String(pw), parts[1], 64);
    const s = Buffer.from(parts[2], 'hex');
    return s.length === h.length && crypto.timingSafeEqual(s, h);
  }
  function tempPassword() {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = ''; const b = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) s += a[b[i] % a.length];
    return s;
  }

  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  function signTok(payload) {
    const body = b64u(JSON.stringify(payload));
    return body + '.' + b64u(crypto.createHmac('sha256', SECRET).update('site:' + body).digest());
  }
  function readTok(tok) {
    if (!tok) return null;
    const [body, sig] = String(tok).split('.');
    if (!body || !sig) return null;
    const exp = b64u(crypto.createHmac('sha256', SECRET).update('site:' + body).digest());
    if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
    let p; try { p = JSON.parse(unb64u(body)); } catch (e) { return null; }
    if (!p || !p.u || !p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  }
  function getCookie(req, name) {
    const c = req.headers.cookie || '';
    const m = c.split(/;\s*/).find((x) => x.startsWith(name + '='));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  }
  function setSession(res, user, remember) {
    const ttl = remember ? 30 * DAY : DAY;
    const tok = signTok({ u: user.id, v: user.token_version, exp: Math.floor(Date.now() / 1000) + ttl });
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(tok)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`);
  }
  function clearSession(res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  }

  // 다른 사이트에서 보낸 요청 차단 (쿠키 SameSite=Lax 와 이중 방어)
  function originOk(req, res) {
    const o = req.headers.origin;
    if (o && !ALLOW_ORIGINS.includes(o)) { res.status(403).json({ error: 'origin', message: '허용되지 않은 요청입니다.' }); return false; }
    return true;
  }

  // 수강생 등급의 실제 효력: 강의 수강생 명단에 있는데 모두 만료/비활성이면 회원으로 취급
  async function effectiveRole(u) {
    if (u.role !== 'student') return u.role;
    try {
      const r = await q(`SELECT active, expires_at FROM lecture_students
                          WHERE right(regexp_replace(phone, '\\D', '', 'g'), 11) = $1`, [u.phone]);
      if (!r.rows.length) return 'student';
      const ok = r.rows.some((s) => s.active && (!s.expires_at || new Date(s.expires_at).getTime() >= Date.now()));
      return ok ? 'student' : 'member';
    } catch (e) { return 'student'; }
  }
  async function lectureMatch(phone) {
    try {
      const r = await q(`SELECT name, active, expires_at FROM lecture_students
                          WHERE right(regexp_replace(phone, '\\D', '', 'g'), 11) = $1
                          ORDER BY active DESC, created_at DESC LIMIT 1`, [phone]);
      if (!r.rows.length) return null;
      const s = r.rows[0];
      return { name: s.name, active: !!s.active, expires_at: s.expires_at };
    } catch (e) { return null; }
  }

  // 현재 로그인 사용자 (없으면 null)
  async function currentUser(req) {
    const p = readTok(getCookie(req, COOKIE));
    if (!p) return null;
    const r = await q('SELECT * FROM site_users WHERE id=$1', [p.u]);
    const u = r.rows[0];
    if (!u || u.status !== 'active' || u.token_version !== p.v) return null;
    u.eff_role = await effectiveRole(u);
    return u;
  }
  async function requireRole(req, res, min) {
    await ensureTables();
    const u = await currentUser(req);
    if (!u) { res.status(401).json({ error: 'login', message: '로그인이 필요합니다.' }); return null; }
    if (RANK[u.eff_role] < RANK[min]) { res.status(403).json({ error: 'forbidden', message: '권한이 없습니다.' }); return null; }
    return u;
  }
  async function log(target, from, to, by, reason) {
    await q(`INSERT INTO site_role_log (user_id, user_name, from_role, to_role, from_status, to_status, by_user, by_name, reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [target.id, target.name, from.role, to.role, from.status, to.status, by ? by.id : null, by ? by.name : null, reason || null]);
  }

  // ════════ 공개/회원 API ════════

  // 가입 요청
  app.post('/api/site/signup', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    await ensureTables();
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 40);
    const loginId = normId(b.login_id);
    const phone = digits(b.phone);
    const pw = String(b.password || '');
    const email = String(b.email || '').trim().slice(0, 120) || null;
    const purpose = ['student', 'instructor', 'member'].includes(b.purpose) ? b.purpose : 'member';
    if (!b.agree_terms || !b.agree_privacy) return res.status(400).json({ error: 'agree', message: '필수 약관에 동의해 주세요.' });
    if (!validId(loginId)) return res.status(400).json({ error: 'login_id', message: ID_RULE });
    if (!name) return res.status(400).json({ error: 'name', message: '이름을 입력해 주세요.' });
    if (!validPhone(phone)) return res.status(400).json({ error: 'phone', message: '휴대폰 번호를 정확히 입력해 주세요.' });
    if (pw.length < 8) return res.status(400).json({ error: 'password', message: '비밀번호는 8자 이상으로 정해 주세요.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email', message: '이메일 형식을 확인해 주세요.' });

    // 짧은 시간 대량 가입 차단
    const burst = await q(`SELECT count(*)::int AS n FROM site_users WHERE created_at > now() - interval '1 hour' AND status='pending'`);
    if (burst.rows[0].n > 30) return res.status(429).json({ error: 'busy', message: '가입 요청이 많아 잠시 후 다시 시도해 주세요.' });

    const ex = (await q('SELECT * FROM site_users WHERE phone=$1', [phone])).rows[0];
    if (ex && ex.status === 'pending') return res.status(409).json({ error: 'pending', message: '이미 가입 요청이 접수되어 승인을 기다리고 있습니다.' });
    if (ex && ex.status !== 'rejected') return res.status(409).json({ error: 'exists', message: '이미 가입된 번호입니다. 로그인해 주세요.' });
    if (await idTaken(loginId, ex ? ex.id : 0)) return res.status(409).json({ error: 'login_id_taken', message: '이미 사용 중인 아이디입니다. 다른 아이디를 정해 주세요.' });

    // 최종관리자 번호면 바로 활성화 (최종관리자가 아직 없을 때만)
    let role = 'member', status = 'pending';
    if (OWNER_PHONE && phone === OWNER_PHONE) {
      const own = await q(`SELECT 1 FROM site_users WHERE role='owner' LIMIT 1`);
      if (!own.rows.length) { role = 'owner'; status = 'active'; }
    }
    const ph = hashPw(pw);
    let saved;
    if (ex) {
      saved = (await q(`UPDATE site_users SET name=$2, email=$3, password_hash=$4, role=$5, status=$6, signup_purpose=$7,
                          reject_reason=NULL, approved_by=NULL, approved_at=NULL, terms_ver=$8, privacy_ver=$9, marketing_opt=$10,
                          agreed_at=now(), created_at=now(), token_version=token_version+1, fail_count=0, locked_until=NULL, login_id=$11
                        WHERE id=$1 RETURNING id, status, role`,
        [ex.id, name, email, ph, role, status, purpose, TERMS_VER, PRIVACY_VER, !!b.agree_marketing, loginId])).rows[0];
    } else {
      saved = (await q(`INSERT INTO site_users (phone, name, email, password_hash, role, status, signup_purpose, terms_ver, privacy_ver, marketing_opt, agreed_at, login_id)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11) RETURNING id, status, role`,
        [phone, name, email, ph, role, status, purpose, TERMS_VER, PRIVACY_VER, !!b.agree_marketing, loginId])).rows[0];
    }
    if (role === 'owner') {
      await log({ id: saved.id, name }, { role: null, status: null }, { role: 'owner', status: 'active' }, null, '최종관리자 번호로 가입');
    }
    res.json({ ok: true, status: saved.status, role: saved.role });
  }));

  // 로그인
  app.post('/api/site/login', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    await ensureTables();
    const b = req.body || {};
    const loginId = normId(b.login_id);
    const pw = String(b.password || '');
    const bad = () => res.status(401).json({ error: 'invalid', message: '아이디 또는 비밀번호가 맞지 않습니다.' });
    if (!loginId || !pw) return bad();
    let u = validId(loginId) ? (await q('SELECT * FROM site_users WHERE lower(login_id)=$1', [loginId])).rows[0] : null;
    // 전환 전에 만든 계정(아이디 없음)만 번호로 한 번 들어와 아이디를 정할 수 있음.
    // 아이디가 생긴 계정은 번호로 로그인되지 않음.
    if (!u && validPhone(digits(loginId))) {
      u = (await q('SELECT * FROM site_users WHERE phone=$1 AND login_id IS NULL', [digits(loginId)])).rows[0];
    }
    if (!u) return bad();
    if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
      return res.status(423).json({ error: 'locked', message: '비밀번호를 여러 번 틀려 10분간 로그인이 잠겼습니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (!checkPw(pw, u.password_hash)) {
      const n = (u.fail_count || 0) + 1;
      if (n >= 5) await q(`UPDATE site_users SET fail_count=0, locked_until=now() + interval '10 minutes' WHERE id=$1`, [u.id]);
      else await q('UPDATE site_users SET fail_count=$2 WHERE id=$1', [u.id, n]);
      return bad();
    }
    await q('UPDATE site_users SET fail_count=0, locked_until=NULL WHERE id=$1', [u.id]);
    if (u.status === 'pending') return res.status(403).json({ error: 'pending', message: '가입 승인을 기다리고 있습니다.', created_at: u.created_at, purpose: u.signup_purpose });
    if (u.status === 'rejected') return res.status(403).json({ error: 'rejected', message: '가입 요청이 승인되지 않았습니다.', reason: u.reject_reason || '' });
    if (u.status !== 'active') return res.status(403).json({ error: 'suspended', message: '이용이 정지된 계정입니다. 스튜디오로 문의해 주세요.' });
    await q('UPDATE site_users SET last_login_at=now() WHERE id=$1', [u.id]);
    setSession(res, u, !!b.remember);
    res.json({ ok: true, must_change_pw: !!u.must_change_pw, must_set_id: !u.login_id });
  }));

  // 아이디 정하기 (전환 전 계정만, 한 번만)
  app.post('/api/site/login-id', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    const u = await requireRole(req, res, 'member'); if (!u) return;
    if (u.login_id) return res.status(400).json({ error: 'has_id', message: '이미 아이디가 있습니다. 변경은 스튜디오에 요청해 주세요.' });
    const b = req.body || {};
    const loginId = normId(b.login_id);
    if (!validId(loginId)) return res.status(400).json({ error: 'login_id', message: ID_RULE });
    if (!checkPw(String(b.password || ''), u.password_hash)) return res.status(400).json({ error: 'current', message: '비밀번호가 맞지 않습니다.' });
    if (await idTaken(loginId, u.id)) return res.status(409).json({ error: 'login_id_taken', message: '이미 사용 중인 아이디입니다. 다른 아이디를 정해 주세요.' });
    await q('UPDATE site_users SET login_id=$2 WHERE id=$1 AND login_id IS NULL', [u.id, loginId]);
    await log(u, { role: u.role, status: u.status }, { role: u.role, status: u.status }, u, '아이디 설정: ' + loginId);
    res.json({ ok: true, login_id: loginId });
  }));

  app.post('/api/site/logout', wrap(async (req, res) => {
    clearSession(res);
    res.json({ ok: true });
  }));

  // 내 정보 (메뉴 노출용) — 손님이면 role=guest
  app.get('/api/site/me', wrap(async (req, res) => {
    await ensureTables();
    const u = await currentUser(req);
    if (!u) return res.json({ role: 'guest', rank: 0 });
    const out = {
      id: u.id, login_id: u.login_id || '', must_set_id: !u.login_id, name: u.name, phone: fmtPhone(u.phone), email: u.email || '',
      role: u.eff_role, role_ko: ROLE_KO[u.eff_role], rank: RANK[u.eff_role],
      stored_role: u.role, must_change_pw: !!u.must_change_pw, marketing_opt: !!u.marketing_opt,
      created_at: u.created_at,
    };
    if (u.role === 'student') {
      const m = await lectureMatch(u.phone);
      if (m) out.student_expires_at = m.expires_at;
    }
    if (RANK[u.eff_role] >= RANK.admin) {
      out.pending_count = (await q(`SELECT count(*)::int AS n FROM site_users WHERE status='pending'`)).rows[0].n;
    }
    res.json(out);
  }));

  // 내 정보 수정 (이메일·마케팅 수신)
  app.post('/api/site/me', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    const u = await requireRole(req, res, 'member'); if (!u) return;
    const b = req.body || {};
    const email = String(b.email || '').trim().slice(0, 120) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email', message: '이메일 형식을 확인해 주세요.' });
    await q('UPDATE site_users SET email=$2, marketing_opt=$3 WHERE id=$1', [u.id, email, !!b.marketing_opt]);
    res.json({ ok: true });
  }));

  // 비밀번호 변경
  app.post('/api/site/password', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    const u = await requireRole(req, res, 'member'); if (!u) return;
    const b = req.body || {};
    const next = String(b.next || '');
    if (!checkPw(String(b.current || ''), u.password_hash)) return res.status(400).json({ error: 'current', message: '현재 비밀번호가 맞지 않습니다.' });
    if (next.length < 8) return res.status(400).json({ error: 'password', message: '새 비밀번호는 8자 이상으로 정해 주세요.' });
    const r = (await q(`UPDATE site_users SET password_hash=$2, must_change_pw=false, token_version=token_version+1 WHERE id=$1 RETURNING *`,
      [u.id, hashPw(next)])).rows[0];
    setSession(res, r, false);
    res.json({ ok: true });
  }));

  // 회원 탈퇴
  app.post('/api/site/withdraw', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    const u = await requireRole(req, res, 'member'); if (!u) return;
    if (u.role === 'owner') return res.status(400).json({ error: 'owner', message: '최종관리자 계정은 탈퇴할 수 없습니다.' });
    if (!checkPw(String((req.body || {}).password || ''), u.password_hash)) return res.status(400).json({ error: 'current', message: '비밀번호가 맞지 않습니다.' });
    await log(u, { role: u.role, status: u.status }, { role: u.role, status: 'withdrawn' }, u, '회원 탈퇴');
    await q('DELETE FROM site_users WHERE id=$1', [u.id]);
    clearSession(res);
    res.json({ ok: true });
  }));

  // 내 수료증·자격증 (발급 기록의 연락처가 내 번호와 같은 것)
  app.get('/api/site/my-certs', wrap(async (req, res) => {
    const u = await requireRole(req, res, 'member'); if (!u) return;
    let rows = [];
    try {
      rows = (await q(`SELECT c.cert_no, c.completion_date, c.issued_date, c.name_en, t.name AS cert_name
                         FROM lecture_certs c LEFT JOIN lecture_cert_types t ON t.id = c.cert_type_id
                        WHERE right(regexp_replace(coalesce(c.holder_phone,''), '\\D', '', 'g'), 11) = $1
                        ORDER BY coalesce(c.completion_date, c.issued_date) DESC NULLS LAST`, [u.phone])).rows;
    } catch (e) { rows = []; }
    res.json({ ok: true, certs: rows.map((r) => ({
      name: r.cert_name || '자격증', cert_no: r.cert_no || '', date: r.completion_date || r.issued_date || null, name_en: r.name_en || '',
    })) });
  }));

  // ════════ 관리 API (관리자+) ════════

  const canAssign = (actor, role) => {
    if (!['member', 'student', 'instructor', 'admin'].includes(role)) return false;
    if (role === 'admin') return actor.eff_role === 'owner';
    return true;
  };
  const canTouch = (actor, target) => {
    if (target.id === actor.id) return false;            // 자기 자신은 바꾸지 않음
    if (target.role === 'owner') return false;           // 최종관리자는 아무도 못 바꿈
    if (target.role === 'admin') return actor.eff_role === 'owner';
    return true;
  };

  // 가입 요청 목록
  app.get('/api/site/admin/signups', wrap(async (req, res) => {
    const a = await requireRole(req, res, 'admin'); if (!a) return;
    const st = ['pending', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    // 거절 30일 지난 신청은 정리
    await q(`DELETE FROM site_users WHERE status='rejected' AND created_at < now() - interval '30 days'`);
    const rows = (await q(`SELECT id, login_id, name, phone, email, signup_purpose, created_at, reject_reason
                           FROM site_users WHERE status=$1 ORDER BY created_at ASC`, [st])).rows;
    const out = [];
    for (const r of rows) {
      out.push({
        id: r.id, login_id: r.login_id || '', name: r.name, phone: fmtPhone(r.phone), email: r.email || '',
        purpose: r.signup_purpose || 'member', created_at: r.created_at, reject_reason: r.reject_reason || '',
        lecture: await lectureMatch(r.phone),
      });
    }
    res.json({ ok: true, signups: out, can_assign_admin: a.eff_role === 'owner' });
  }));

  // 승인 / 거절
  app.post('/api/site/admin/signups/:id', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    const a = await requireRole(req, res, 'admin'); if (!a) return;
    const id = parseInt(req.params.id, 10);
    const t = (await q('SELECT * FROM site_users WHERE id=$1', [id])).rows[0];
    if (!t || t.status !== 'pending') return res.status(404).json({ error: 'not_found', message: '대기 중인 가입 요청이 아닙니다.' });
    const b = req.body || {};
    if (b.action === 'approve') {
      const role = String(b.role || 'member');
      if (!canAssign(a, role)) return res.status(403).json({ error: 'role', message: '이 등급은 줄 수 없습니다.' });
      await q(`UPDATE site_users SET status='active', role=$2, approved_by=$3, approved_at=now(), reject_reason=NULL WHERE id=$1`, [id, role, a.id]);
      await log(t, { role: t.role, status: 'pending' }, { role, status: 'active' }, a, '가입 승인');
      return res.json({ ok: true });
    }
    if (b.action === 'reject') {
      const reason = String(b.reason || '').trim().slice(0, 200);
      await q(`UPDATE site_users SET status='rejected', reject_reason=$2, approved_by=$3, approved_at=now() WHERE id=$1`, [id, reason || null, a.id]);
      await log(t, { role: t.role, status: 'pending' }, { role: t.role, status: 'rejected' }, a, reason ? '가입 거절: ' + reason : '가입 거절');
      return res.json({ ok: true });
    }
    res.status(400).json({ error: 'action', message: '잘못된 요청입니다.' });
  }));

  // 회원 목록 (번호 가림)
  app.get('/api/site/admin/users', wrap(async (req, res) => {
    const a = await requireRole(req, res, 'admin'); if (!a) return;
    const rows = (await q(`SELECT u.id, u.login_id, u.name, u.phone, u.role, u.status, u.created_at, u.last_login_at, u.must_change_pw,
                                  ab.name AS approved_by_name
                           FROM site_users u LEFT JOIN site_users ab ON ab.id = u.approved_by
                           WHERE u.status IN ('active','suspended')
                           ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'instructor' THEN 2 WHEN 'student' THEN 3 ELSE 4 END, u.name`)).rows;
    res.json({
      ok: true, me: a.id, my_role: a.eff_role, can_assign_admin: a.eff_role === 'owner',
      users: rows.map((r) => ({
        id: r.id, login_id: r.login_id || '', name: r.name, phone: maskPhone(r.phone), role: r.role, role_ko: ROLE_KO[r.role], status: r.status,
        created_at: r.created_at, last_login_at: r.last_login_at, approved_by: r.approved_by_name || '',
        must_change_pw: !!r.must_change_pw, editable: canTouch(a, r),
      })),
    });
  }));

  // 등급 변경 / 정지 / 정지 해제 / 비밀번호 초기화
  app.post('/api/site/admin/users/:id', wrap(async (req, res) => {
    if (!originOk(req, res)) return;
    const a = await requireRole(req, res, 'admin'); if (!a) return;
    const id = parseInt(req.params.id, 10);
    const t = (await q('SELECT * FROM site_users WHERE id=$1', [id])).rows[0];
    if (!t || !['active', 'suspended'].includes(t.status)) return res.status(404).json({ error: 'not_found', message: '회원을 찾을 수 없습니다.' });
    if (!canTouch(a, t)) return res.status(403).json({ error: 'forbidden', message: '이 회원은 변경할 수 없습니다.' });
    const b = req.body || {};
    if (b.action === 'role') {
      const role = String(b.role || '');
      if (!canAssign(a, role)) return res.status(403).json({ error: 'role', message: '이 등급은 줄 수 없습니다.' });
      if (role === t.role) return res.json({ ok: true });
      await q('UPDATE site_users SET role=$2 WHERE id=$1', [id, role]);
      await log(t, { role: t.role, status: t.status }, { role, status: t.status }, a, '등급 변경');
      return res.json({ ok: true });
    }
    if (b.action === 'suspend' || b.action === 'activate') {
      const st = b.action === 'suspend' ? 'suspended' : 'active';
      await q('UPDATE site_users SET status=$2, token_version=token_version+1 WHERE id=$1', [id, st]);
      await log(t, { role: t.role, status: t.status }, { role: t.role, status: st }, a, b.action === 'suspend' ? '이용 정지' : '정지 해제');
      return res.json({ ok: true });
    }
    if (b.action === 'reset_pw') {
      const tmp = tempPassword();
      await q('UPDATE site_users SET password_hash=$2, must_change_pw=true, token_version=token_version+1, fail_count=0, locked_until=NULL WHERE id=$1', [id, hashPw(tmp)]);
      await log(t, { role: t.role, status: t.status }, { role: t.role, status: t.status }, a, '비밀번호 초기화');
      return res.json({ ok: true, temp_password: tmp });
    }
    res.status(400).json({ error: 'action', message: '잘못된 요청입니다.' });
  }));

  // 변경 기록 (최종관리자)
  app.get('/api/site/admin/log', wrap(async (req, res) => {
    const a = await requireRole(req, res, 'owner'); if (!a) return;
    const rows = (await q('SELECT * FROM site_role_log ORDER BY at DESC LIMIT 200')).rows;
    res.json({ ok: true, log: rows.map((r) => ({
      at: r.at, user: r.user_name, by: r.by_name || '',
      from: (r.from_role ? ROLE_KO[r.from_role] || r.from_role : '') + (r.from_status ? '·' + r.from_status : ''),
      to: (r.to_role ? ROLE_KO[r.to_role] || r.to_role : '') + (r.to_status ? '·' + r.to_status : ''),
      reason: r.reason || '',
    })) });
  }));

  console.log('✅ site-auth 라우트 등록 (/api/site/*)' + (OWNER_PHONE ? '' : ' — SITE_OWNER_PHONE 미설정'));
  return { currentUser, RANK };
}

module.exports = { registerSiteAuthRoutes, RANK, ROLES };
