// lecture-api.js
// 미사제이스튜디오 "강의보기" 백엔드 — 개인코드 인증 · 유튜브 진도 · 퀴즈 · 수료
//  server.js 에서 registerLectureRoutes(app, { getPool, checkAdminPassword }) 로 연결.
//  DB: 같은 Supabase(jstudio-calendar) 의 lecture_* 테이블 (기존 기능과 격리).
//  프론트: mjs.ai.kr/lecture 에서 CORS 로 호출.
const crypto = require('crypto');

const SECRET = process.env.LECTURE_SECRET || process.env.ADMIN_PASSWORD || 'mjs-lecture-dev';
const TOKEN_TTL_SEC = 6 * 60 * 60; // 6시간
const WATCH_DONE_PCT = 98;         // 반올림·미세오차 감안, 98% 이상이면 완주로 인정
const ALLOW_ORIGINS = ['https://www.mjs.ai.kr', 'https://mjs.ai.kr'];

function registerLectureRoutes(app, deps) {
  const { getPool, checkAdminPassword } = deps;
  const q = (sql, params) => {
    const pool = getPool();
    if (!pool) throw new Error('DB 연결 없음 (DATABASE_URL 필요)');
    return pool.query(sql, params);
  };

  // ── CORS ──
  function cors(req, res) {
    const o = req.headers.origin;
    if (o && ALLOW_ORIGINS.includes(o)) res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password');
    res.setHeader('Cache-Control', 'no-store');
  }
  app.options('/api/lecture/*', (req, res) => { cors(req, res); res.status(204).end(); });

  // ── 토큰(HMAC) ──
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  function sign(payload) {
    const body = b64u(JSON.stringify(payload));
    const sig = b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
    return body + '.' + sig;
  }
  function verifyToken(tok) {
    if (!tok) return null;
    const [body, sig] = String(tok).split('.');
    if (!body || !sig) return null;
    const exp = b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
    let p; try { p = JSON.parse(unb64u(body)); } catch (e) { return null; }
    if (!p || !p.sid || !p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  }
  function authStudent(req) {
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
    return verifyToken(tok);
  }
  function requireAdmin(req, res) {
    const pw = req.headers['x-admin-password'];
    if (!checkAdminPassword(pw)) { res.status(403).json({ error: 'forbidden' }); return false; }
    return true;
  }

  // ── 코드 생성 (MJS-XXXX-XXXX, 혼동문자 제외) ──
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randCode() {
    const pick = (n) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
    return 'MJS-' + pick(4) + '-' + pick(4);
  }

  function courseOpen(c) {
    const now = Date.now();
    if (!c.active) return false;
    if (c.open_from && new Date(c.open_from).getTime() > now) return false;
    if (c.open_to && new Date(c.open_to).getTime() < now) return false;
    return true;
  }

  const wrap = (fn) => async (req, res) => {
    cors(req, res);
    try { await fn(req, res); }
    catch (e) { console.error('[lecture]', req.path, String((e && e.message) || e)); res.status(500).json({ error: 'server' }); }
  };

  // ════════ 수강생(방문자) ════════

  // 코드 인증 → 토큰 + 수강 가능한 강의 목록(+개인 진도)
  app.post('/api/lecture/verify', wrap(async (req, res) => {
    const code = String((req.body && req.body.code) || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'code_required' });
    const { rows } = await q('SELECT * FROM lecture_students WHERE code = $1', [code]);
    const s = rows[0];
    if (!s || !s.active) return res.status(401).json({ error: 'invalid_code', message: '유효하지 않은 코드입니다.' });
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now())
      return res.status(401).json({ error: 'expired', message: '코드 사용 기간이 지났습니다.' });

    const token = sign({ sid: s.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC });
    const cs = (await q('SELECT * FROM lecture_courses ORDER BY sort, created_at')).rows.filter(courseOpen);
    const pr = (await q('SELECT * FROM lecture_progress WHERE student_id = $1', [s.id])).rows;
    const pmap = {}; pr.forEach(p => { pmap[p.course_id] = p; });
    const courses = cs.map(c => ({
      id: c.id, title: c.title, youtube_id: c.youtube_id, description: c.description,
      progress: pmap[c.id] ? {
        watched_pct: pmap[c.id].watched_pct, passed: pmap[c.id].passed,
        completed: !!pmap[c.id].completed_at,
        marks: Array.isArray(pmap[c.id].marks) ? pmap[c.id].marks : [],
        bucket: pmap[c.id].bucket || 2,
        last_pos: pmap[c.id].last_pos || 0
      } : { watched_pct: 0, passed: false, completed: false, marks: [], bucket: 2, last_pos: 0 }
    }));
    res.json({ ok: true, token, student: { name: s.name }, courses });
  }));

  // 세션 복원(새로고침 대비) — 토큰만으로 학생·강의목록 재조회(코드 재입력 불필요)
  app.get('/api/lecture/session', wrap(async (req, res) => {
    const p = authStudent(req); if (!p) return res.status(401).json({ error: 'auth' });
    const s = (await q('SELECT id, name, active FROM lecture_students WHERE id=$1', [p.sid])).rows[0];
    if (!s || !s.active) return res.status(401).json({ error: 'auth' });
    const cs = (await q('SELECT * FROM lecture_courses ORDER BY sort, created_at')).rows.filter(courseOpen);
    const pr = (await q('SELECT * FROM lecture_progress WHERE student_id=$1', [s.id])).rows;
    const pmap = {}; pr.forEach(function (x) { pmap[x.course_id] = x; });
    const courses = cs.map(function (c) {
      return {
        id: c.id, title: c.title, youtube_id: c.youtube_id, description: c.description,
        progress: pmap[c.id] ? {
          watched_pct: pmap[c.id].watched_pct, passed: pmap[c.id].passed, completed: !!pmap[c.id].completed_at,
          marks: Array.isArray(pmap[c.id].marks) ? pmap[c.id].marks : [], bucket: pmap[c.id].bucket || 2, last_pos: pmap[c.id].last_pos || 0
        } : { watched_pct: 0, passed: false, completed: false, marks: [], bucket: 2, last_pos: 0 }
      };
    });
    res.json({ ok: true, student: { name: s.name }, courses: courses });
  }));

  // 진도 저장 — 클라가 "본 구간(버킷 인덱스) 목록"을 보냄. 서버는 기존 기록과 합집합(union)으로만
  // 누적한다. 같은 구간 반복 시청은 합집합이 안 늘어 100% 안 되고(중복 방지), 서로 다른 구간을
  // 여러 번에 나눠 봐도 정당하게 누적된다. 되감기·새로고침·세션 재접속 모두 안전.
  app.post('/api/lecture/progress', wrap(async (req, res) => {
    const p = authStudent(req); if (!p) return res.status(401).json({ error: 'auth' });
    const b = req.body || {};
    const courseId = b.courseId;
    const duration = Math.max(1, Math.floor(Number(b.duration) || 0));
    const bucket = Math.min(30, Math.max(1, Math.floor(Number(b.bucket) || 2)));
    const pos = Math.max(0, Math.min(duration, Math.floor(Number(b.pos) || 0)));   // 이어보기용 마지막 위치
    if (!courseId) return res.status(400).json({ error: 'course_required' });
    const c = (await q('SELECT * FROM lecture_courses WHERE id = $1', [courseId])).rows[0];
    if (!c || !courseOpen(c)) return res.status(404).json({ error: 'course' });

    const maxIdx = Math.ceil(duration / bucket) + 2;   // 조작 방지: duration 범위 밖 인덱스 무시
    const set = {};
    const prev = (await q('SELECT marks FROM lecture_progress WHERE student_id=$1 AND course_id=$2', [p.sid, courseId])).rows[0];
    if (prev && Array.isArray(prev.marks)) prev.marks.forEach(function (n) { if (n >= 0 && n < maxIdx) set[n] = 1; });
    if (Array.isArray(b.marks)) b.marks.forEach(function (m) { const n = Math.floor(Number(m)); if (n >= 0 && n < maxIdx) set[n] = 1; });
    const union = Object.keys(set).map(Number);
    const seconds = Math.min(duration, union.length * bucket);
    const pct = Math.min(100, Math.round((seconds / duration) * 100));

    await q(
      `INSERT INTO lecture_progress (student_id, course_id, watched_pct, seconds_watched, duration, marks, bucket, last_pos, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (student_id, course_id) DO UPDATE SET
         marks = EXCLUDED.marks,
         seconds_watched = EXCLUDED.seconds_watched,
         duration = EXCLUDED.duration,
         watched_pct = GREATEST(lecture_progress.watched_pct, EXCLUDED.watched_pct),
         bucket = EXCLUDED.bucket,
         last_pos = EXCLUDED.last_pos,
         updated_at = now()`,
      [p.sid, courseId, pct, seconds, duration, JSON.stringify(union), bucket, pos]
    );
    res.json({ ok: true, watched_pct: pct });
  }));

  // 퀴즈 문제 (정답 제외) — 완주(98%+) 후에만
  app.get('/api/lecture/quiz', wrap(async (req, res) => {
    const p = authStudent(req); if (!p) return res.status(401).json({ error: 'auth' });
    const courseId = req.query.courseId;
    if (!courseId) return res.status(400).json({ error: 'course_required' });
    const pr = (await q('SELECT watched_pct FROM lecture_progress WHERE student_id=$1 AND course_id=$2', [p.sid, courseId])).rows[0];
    if (!pr || pr.watched_pct < WATCH_DONE_PCT) return res.status(403).json({ error: 'not_completed', message: '영상을 끝까지 시청해야 퀴즈가 열립니다.' });
    const rows = (await q('SELECT id, ord, question, options FROM lecture_quiz WHERE course_id=$1 ORDER BY ord, id', [courseId])).rows;
    const c = (await q('SELECT pass_score FROM lecture_courses WHERE id=$1', [courseId])).rows[0] || {};
    res.json({ ok: true, pass_score: c.pass_score || rows.length, questions: rows.map(r => ({ id: r.id, question: r.question, options: r.options })) });
  }));

  // 퀴즈 제출 → 서버 채점 → 수료 판정
  app.post('/api/lecture/quiz', wrap(async (req, res) => {
    const p = authStudent(req); if (!p) return res.status(401).json({ error: 'auth' });
    const { courseId, answers } = req.body || {};
    if (!courseId || !answers || typeof answers !== 'object') return res.status(400).json({ error: 'bad_request' });
    const pr = (await q('SELECT * FROM lecture_progress WHERE student_id=$1 AND course_id=$2', [p.sid, courseId])).rows[0];
    if (!pr || pr.watched_pct < WATCH_DONE_PCT) return res.status(403).json({ error: 'not_completed' });
    const c = (await q('SELECT pass_score FROM lecture_courses WHERE id=$1', [courseId])).rows[0];
    if (!c) return res.status(404).json({ error: 'course' });
    const qs = (await q('SELECT id, answer_index FROM lecture_quiz WHERE course_id=$1', [courseId])).rows;
    let score = 0;
    qs.forEach(qq => { if (Number(answers[qq.id]) === qq.answer_index) score++; });
    const total = qs.length;
    const passScore = c.pass_score || total;
    const passed = score >= passScore;
    const completedAt = passed ? new Date().toISOString() : null;
    await q(
      `UPDATE lecture_progress SET quiz_score=$3, quiz_total=$4, passed=$5,
         completed_at = COALESCE(lecture_progress.completed_at, $6), updated_at=now()
       WHERE student_id=$1 AND course_id=$2`,
      [p.sid, courseId, score, total, passed, completedAt]
    );
    res.json({ ok: true, score, total, pass_score: passScore, passed, completed: passed });
  }));

  // ════════ 관리자 ════════

  app.post('/api/lecture/admin/student', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const name = String((req.body && req.body.name) || '').trim();
    const phone = String((req.body && req.body.phone) || '').trim();
    const memo = String((req.body && req.body.memo) || '').trim() || null;
    const expires_at = (req.body && req.body.expires_at) || null;
    if (!name || !phone) return res.status(400).json({ error: 'name_phone_required' });
    let code, saved, tries = 0;
    while (tries++ < 6) {
      code = randCode();
      try {
        saved = (await q(
          'INSERT INTO lecture_students (name, phone, code, memo, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, phone, code, expires_at',
          [name, phone, code, memo, expires_at]
        )).rows[0];
        break;
      } catch (e) { if (!/unique/i.test(String(e.message))) throw e; }
    }
    if (!saved) return res.status(500).json({ error: 'code_gen' });
    res.json({ ok: true, student: saved });
  }));

  app.get('/api/lecture/admin/students', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rows = (await q('SELECT id, name, phone, code, active, expires_at, memo, created_at FROM lecture_students ORDER BY created_at DESC')).rows;
    res.json({ ok: true, students: rows });
  }));

  app.post('/api/lecture/admin/course', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const b = req.body || {};
    const id = String(b.id || '').trim();
    if (!id || !b.title || !b.youtube_id) return res.status(400).json({ error: 'id_title_youtube_required' });
    await q(
      `INSERT INTO lecture_courses (id, title, youtube_id, description, open_from, open_to, pass_score, active, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, youtube_id=EXCLUDED.youtube_id,
         description=EXCLUDED.description, open_from=EXCLUDED.open_from, open_to=EXCLUDED.open_to,
         pass_score=EXCLUDED.pass_score, active=EXCLUDED.active, sort=EXCLUDED.sort`,
      [id, b.title, b.youtube_id, b.description || null, b.open_from || null, b.open_to || null,
       Math.max(0, parseInt(b.pass_score, 10) || 0), b.active !== false, parseInt(b.sort, 10) || 0]
    );
    if (Array.isArray(b.quiz)) {
      await q('DELETE FROM lecture_quiz WHERE course_id=$1', [id]);
      for (let i = 0; i < b.quiz.length; i++) {
        const qq = b.quiz[i];
        await q('INSERT INTO lecture_quiz (course_id, ord, question, options, answer_index) VALUES ($1,$2,$3,$4,$5)',
          [id, i + 1, String(qq.question || ''), JSON.stringify(qq.options || []), parseInt(qq.answer_index, 10) || 0]);
      }
    }
    res.json({ ok: true });
  }));

  app.get('/api/lecture/admin/courses', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rows = (await q(`SELECT c.*, (SELECT count(*) FROM lecture_quiz z WHERE z.course_id=c.id) AS quiz_count
                           FROM lecture_courses c ORDER BY c.sort, c.created_at`)).rows;
    res.json({ ok: true, courses: rows });
  }));

  app.get('/api/lecture/admin/report', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const courseId = req.query.courseId;
    const rows = (await q(
      `SELECT s.name, s.phone, s.code, p.watched_pct, p.quiz_score, p.quiz_total, p.passed, p.completed_at
       FROM lecture_students s
       LEFT JOIN lecture_progress p ON p.student_id = s.id AND p.course_id = $1
       ORDER BY (p.completed_at IS NOT NULL) DESC, p.watched_pct DESC NULLS LAST, s.created_at DESC`,
      [courseId || null]
    )).rows;
    res.json({ ok: true, rows });
  }));

  console.log('✅ lecture-api 라우트 등록 (/api/lecture/*)');
}

module.exports = { registerLectureRoutes };
