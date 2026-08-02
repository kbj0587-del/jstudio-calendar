'use strict';

/*
 * NAS(jstudio.ipdisk.co.kr) 시간표 앱을 그대로 가져오면서, 그 앱이 쓰던
 * PHP 백엔드(`/api.php`)만 우리 서버 + Supabase 로 갈아끼운 것.
 * 프론트엔드는 손대지 않았으므로 요청/응답 형태를 원본과 똑같이 맞춰야 한다.
 *
 * 원본 계약 (번들에서 확인)
 *   GET  /api.php                        → 전체 상태 JSON
 *   POST /api.php                        → 전체 상태 저장
 *   GET  /api.php?action=get_admins&token=…   → [{username}, …]
 *   POST /api.php?action=admin_login     {username,password} → {success, username, token} | {error}
 *   POST /api.php?action=verify_token    {token}            → {valid, username}
 *   POST /api.php?action=save_admins     {token, admins:[{username,password?}]} → {success}
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12시간

function registerScheduleAppRoutes(app, deps) {
  const { getPool, checkAdminPassword } = deps;

  const q = (sql, params) => {
    const pool = getPool();
    if (!pool) throw new Error('DB 연결 없음 (DATABASE_URL 필요)');
    return pool.query(sql, params);
  };

  async function ensureTables() {
    await q(`
      CREATE TABLE IF NOT EXISTS js_schedule_state (
        id INT PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT js_schedule_state_single_row CHECK (id = 1)
      )
    `);
    await q(`
      CREATE TABLE IF NOT EXISTS js_schedule_admins (
        username TEXT PRIMARY KEY,
        pass_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await seedInitialState();
  }

  /* NAS 에서 그대로 받아온 현재 상태를 최초 1회만 넣는다 (이미 있으면 건드리지 않음) */
  async function seedInitialState() {
    const { rows } = await q('SELECT COUNT(*)::int AS cnt FROM js_schedule_state', []);
    if (rows[0].cnt > 0) return;
    const seedPath = path.join(__dirname, 'schedule', 'seed-state.json');
    if (!fs.existsSync(seedPath)) {
      console.warn('시간표 앱 시드 파일 없음:', seedPath);
      return;
    }
    const seed = fs.readFileSync(seedPath, 'utf8');
    await q(
      `INSERT INTO js_schedule_state (id, data) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [seed]
    );
    console.log('📅 시간표 앱 초기 상태 주입 완료');
  }

  const hashPw = (pw) => crypto.createHash('sha256').update(String(pw)).digest('hex');

  /* 토큰은 서버리스라 메모리에 못 들고 있는다 → 서명해서 자체검증 */
  /* 관리자 비밀번호는 바뀔 수 있으므로 서명 키로 쓰지 않는다 (기존 토큰이 죽어버림) */
  function tokenSecret() {
    return process.env.SCHEDULE_TOKEN_SECRET
        || process.env.ADMIN_PASSWORD
        || 'jstudio-schedule-secret';
  }
  function makeToken(username) {
    const exp = Date.now() + TOKEN_TTL_MS;
    const payload = `${Buffer.from(username, 'utf8').toString('base64url')}.${exp}`;
    const sig = crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }
  function readToken(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [u, exp, sig] = parts;
    const expect = crypto.createHmac('sha256', tokenSecret()).update(`${u}.${exp}`).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Number(exp) < Date.now()) return null;
    try { return Buffer.from(u, 'base64url').toString('utf8'); } catch { return null; }
  }

  /* 로그인 판정 — 등록된 관리자이거나, 프로젝트 공용 관리자 비밀번호이면 통과 */
  async function checkLogin(username, password) {
    if (!username || !password) return false;
    if (checkAdminPassword(password)) return true;
    try {
      const r = await q('SELECT pass_hash FROM js_schedule_admins WHERE username = $1', [username]);
      return !!r.rows.length && r.rows[0].pass_hash === hashPw(password);
    } catch { return false; }
  }

  // ── GET /api.php ──────────────────────────────
  app.get('/api.php', async (req, res) => {
    try {
      if (req.query.action === 'get_admins') {
        if (!readToken(req.query.token)) return res.json([]);
        const r = await q('SELECT username FROM js_schedule_admins ORDER BY created_at', []);
        return res.json(r.rows.map(x => ({ username: x.username })));
      }
      const r = await q('SELECT data FROM js_schedule_state WHERE id = 1', []);
      res.json(r.rows[0] ? r.rows[0].data : {});
    } catch (e) {
      console.error('api.php GET error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api.php ─────────────────────────────
  app.post('/api.php', async (req, res) => {
    const action = req.query.action;
    try {
      if (action === 'admin_login') {
        const { username, password } = req.body || {};
        if (!(await checkLogin(username, password)))
          return res.json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        return res.json({ success: true, username, token: makeToken(username) });
      }

      if (action === 'verify_token') {
        const username = readToken((req.body || {}).token);
        return res.json(username ? { valid: true, username } : { valid: false });
      }

      if (action === 'save_admins') {
        const { token, admins } = req.body || {};
        if (!readToken(token)) return res.json({ success: false, error: '인증이 만료되었습니다.' });
        if (!Array.isArray(admins)) return res.json({ success: false, error: 'admins 배열 필요' });
        for (const a of admins) {
          const name = String(a?.username || '').trim();
          if (!name) continue;
          if (a.password) {
            await q(
              `INSERT INTO js_schedule_admins (username, pass_hash) VALUES ($1, $2)
               ON CONFLICT (username) DO UPDATE SET pass_hash = $2`,
              [name, hashPw(a.password)]
            );
          }
        }
        /* 목록에서 빠진 관리자는 삭제 */
        const keep = admins.map(a => String(a?.username || '').trim()).filter(Boolean);
        if (keep.length) {
          await q('DELETE FROM js_schedule_admins WHERE NOT (username = ANY($1))', [keep]);
        }
        return res.json({ success: true });
      }

      /* action 없음 = 전체 상태 저장 (관리자만) */
      const token = (req.body || {}).token || req.get('x-schedule-token') || req.query.token;
      const master = req.get('x-admin-password');
      const authed = !!readToken(token) || (master && checkAdminPassword(master));
      if (!authed) return res.status(403).json({ success: false, error: 'forbidden' });

      const body = Object.assign({}, req.body);
      delete body.token;
      if (!body || typeof body !== 'object' || !Object.keys(body).length)
        return res.status(400).json({ success: false, error: '저장할 데이터가 없습니다.' });

      await q(
        `INSERT INTO js_schedule_state (id, data, updated_at) VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
        [JSON.stringify(body)]
      );
      res.json({ success: true });
    } catch (e) {
      console.error('api.php POST error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  ensureTables().catch(e => console.error('시간표 앱 테이블 초기화 실패:', e));
  console.log('📅 시간표 앱 라우트 등록 완료 (/api.php)');
}

module.exports = { registerScheduleAppRoutes };
