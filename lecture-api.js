// lecture-api.js
// 미사제이스튜디오 "강의보기" 백엔드 — 개인코드 인증 · 유튜브 진도 · 퀴즈 · 수료
//  server.js 에서 registerLectureRoutes(app, { getPool, checkAdminPassword }) 로 연결.
//  DB: 같은 Supabase(jstudio-calendar) 의 lecture_* 테이블 (기존 기능과 격리).
//  프론트: mjs.ai.kr/lecture 에서 CORS 로 호출.
const crypto = require('crypto');
const { CERT_SEEDS } = require('./lecture-cert-seeds');

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

  // 유튜브 전체 URL 붙여넣어도 11자리 영상 ID만 추출 (watch?v=·youtu.be·embed·shorts·live)
  function extractYtId(s) {
    s = String(s || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    var m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : s;
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

  // 인증(이름 + 연락처 뒤 4자리) → 토큰 + 수강 가능한 강의 목록(+개인 진도)
  //  관리자가 등록해 둔 수강생의 이름·전화번호와 대조. 코드 입력 방식은 폐지.
  app.post('/api/lecture/verify', wrap(async (req, res) => {
    const name = String((req.body && req.body.name) || '').trim();
    const phone4 = String((req.body && req.body.phone4) || '').replace(/\D/g, '');
    if (!name || phone4.length !== 4) return res.status(400).json({ error: 'name_phone_required', message: '이름과 연락처 뒤 4자리를 입력해 주세요.' });
    // 이름 일치 + 전화번호에서 숫자만 남긴 뒤 마지막 4자리 대조
    const { rows } = await q(
      `SELECT * FROM lecture_students
        WHERE lower(btrim(name)) = lower($1)
          AND right(regexp_replace(phone, '\\D', '', 'g'), 4) = $2
        ORDER BY active DESC, created_at DESC`,
      [name, phone4]
    );
    const s = rows[0];
    if (!s || !s.active) return res.status(401).json({ error: 'invalid', message: '등록된 정보와 일치하지 않습니다. 이름과 연락처를 확인해 주세요.' });
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now())
      return res.status(401).json({ error: 'expired', message: '수강 가능 기간이 지났습니다.' });

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

  // ── 유튜브 챕터(타임라인) — 영상 설명의 타임스탬프를 파싱 ──
  const YT_KEY = process.env.YOUTUBE_API_KEY || '';
  const _chapCache = {};   // youtubeId -> { at, chapters }
  const CHAP_TTL = 6 * 60 * 60 * 1000;
  function parseChapters(desc) {
    const out = [];
    String(desc || '').split(/\r?\n/).forEach(function (line) {
      // 줄 안의 타임스탬프(h:mm:ss 또는 m:ss) + 뒤에 오는 제목
      const m = line.match(/(?:^|\s)(\d{1,2}:)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/);
      if (!m) return;
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const t = h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
      const label = m[4].replace(/^[-–—·|:]\s*/, '').trim();
      if (label) out.push({ t: t, label: label });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    // 유튜브 챕터 인정 규칙에 가깝게: 3개 이상 + 첫 챕터 0초일 때만 유효 처리
    if (out.length < 3 || out[0].t !== 0) return [];
    return out;
  }
  async function fetchChapters(youtubeId) {
    if (!YT_KEY || !youtubeId) return [];
    const c = _chapCache[youtubeId];
    if (c && Date.now() - c.at < CHAP_TTL) return c.chapters;
    try {
      const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' +
        encodeURIComponent(youtubeId) + '&key=' + encodeURIComponent(YT_KEY);
      const r = await fetch(url);
      const j = await r.json();
      const desc = j && j.items && j.items[0] && j.items[0].snippet && j.items[0].snippet.description;
      const chapters = parseChapters(desc);
      _chapCache[youtubeId] = { at: Date.now(), chapters: chapters };
      return chapters;
    } catch (e) {
      console.error('[lecture] chapters', String((e && e.message) || e));
      return [];
    }
  }
  // 수강생: 강의의 챕터 목록
  app.get('/api/lecture/chapters', wrap(async (req, res) => {
    const p = authStudent(req); if (!p) return res.status(401).json({ error: 'auth' });
    const courseId = req.query.courseId;
    if (!courseId) return res.status(400).json({ error: 'course_required' });
    const c = (await q('SELECT youtube_id FROM lecture_courses WHERE id=$1', [courseId])).rows[0];
    if (!c) return res.status(404).json({ error: 'course' });
    const chapters = await fetchChapters(c.youtube_id);
    res.json({ ok: true, chapters: chapters, source: YT_KEY ? 'youtube' : 'no_key' });
  }));

  // 퀴즈 문제 (정답 제외) — 완주(98%+) 후에만
  app.get('/api/lecture/quiz', wrap(async (req, res) => {
    const p = authStudent(req); if (!p) return res.status(401).json({ error: 'auth' });
    const courseId = req.query.courseId;
    if (!courseId) return res.status(400).json({ error: 'course_required' });
    const pr = (await q('SELECT watched_pct FROM lecture_progress WHERE student_id=$1 AND course_id=$2', [p.sid, courseId])).rows[0];
    if (!pr || pr.watched_pct < WATCH_DONE_PCT) return res.status(403).json({ error: 'not_completed', message: '영상을 끝까지 시청해야 퀴즈가 열립니다.' });
    const rows = (await q('SELECT id, ord, question, options, explanation FROM lecture_quiz WHERE course_id=$1 ORDER BY ord, id', [courseId])).rows;
    const c = (await q('SELECT pass_score FROM lecture_courses WHERE id=$1', [courseId])).rows[0] || {};
    // explanation은 응시 중 "힌트"로 노출(정답 인덱스는 여전히 미포함). 정답 대조는 제출 시 서버에서만.
    res.json({ ok: true, pass_score: c.pass_score || rows.length, questions: rows.map(r => ({ id: r.id, question: r.question, options: r.options, explanation: r.explanation || '' })) });
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
    const qs = (await q('SELECT id, answer_index, explanation FROM lecture_quiz WHERE course_id=$1 ORDER BY ord, id', [courseId])).rows;
    let score = 0;
    const results = qs.map(function (qq) {
      const your = Number(answers[qq.id]);
      const ok = your === qq.answer_index;
      if (ok) score++;
      return { id: qq.id, correct_index: qq.answer_index, your_index: isNaN(your) ? null : your, correct: ok, explanation: qq.explanation || '' };
    });
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
    res.json({ ok: true, score, total, pass_score: passScore, passed, completed: passed, results: results });
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

  // 수강생 정보 수정 (이름·연락처·메모·만료일·활성)
  app.post('/api/lecture/admin/student-update', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const b = req.body || {};
    const id = String(b.id || '').trim();
    const name = String(b.name || '').trim();
    const phone = String(b.phone || '').trim();
    const memo = String(b.memo || '').trim() || null;
    const expires_at = b.expires_at || null;
    const active = b.active !== false;
    if (!id) return res.status(400).json({ error: 'id_required' });
    if (!name || !phone) return res.status(400).json({ error: 'name_phone_required' });
    const saved = (await q(
      `UPDATE lecture_students SET name=$2, phone=$3, memo=$4, expires_at=$5, active=$6
        WHERE id=$1 RETURNING id, name, phone, code, active, expires_at, memo`,
      [id, name, phone, memo, expires_at, active]
    )).rows[0];
    if (!saved) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, student: saved });
  }));

  // 수강생 삭제 (수강기록 함께 삭제)
  app.post('/api/lecture/admin/student-delete', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String((req.body && req.body.id) || '').trim();
    if (!id) return res.status(400).json({ error: 'id_required' });
    await q('DELETE FROM lecture_progress WHERE student_id=$1', [id]);
    await q('DELETE FROM lecture_students WHERE id=$1', [id]);
    res.json({ ok: true });
  }));

  app.post('/api/lecture/admin/course', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();   // group_id 컬럼 보장
    const b = req.body || {};
    const id = String(b.id || '').trim();
    const yt = extractYtId(b.youtube_id);   // 전체 URL이면 ID만 추출
    if (!id || !b.title || !yt) return res.status(400).json({ error: 'id_title_youtube_required' });
    const groupId = (b.group_id != null && b.group_id !== '') ? (parseInt(b.group_id, 10) || null) : null;
    await q(
      `INSERT INTO lecture_courses (id, title, youtube_id, description, open_from, open_to, pass_score, active, sort, group_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, youtube_id=EXCLUDED.youtube_id,
         description=EXCLUDED.description, open_from=EXCLUDED.open_from, open_to=EXCLUDED.open_to,
         pass_score=EXCLUDED.pass_score, active=EXCLUDED.active, sort=EXCLUDED.sort, group_id=EXCLUDED.group_id`,
      [id, b.title, yt, b.description || null, b.open_from || null, b.open_to || null,
       Math.max(0, parseInt(b.pass_score, 10) || 0), b.active !== false, parseInt(b.sort, 10) || 0, groupId]
    );
    if (Array.isArray(b.quiz)) {
      await q('DELETE FROM lecture_quiz WHERE course_id=$1', [id]);
      for (let i = 0; i < b.quiz.length; i++) {
        const qq = b.quiz[i];
        await q('INSERT INTO lecture_quiz (course_id, ord, question, options, answer_index, explanation) VALUES ($1,$2,$3,$4,$5,$6)',
          [id, i + 1, String(qq.question || ''), JSON.stringify(qq.options || []), parseInt(qq.answer_index, 10) || 0, String(qq.explanation || '') || null]);
      }
    }
    res.json({ ok: true });
  }));

  app.post('/api/lecture/admin/course-delete', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String((req.body && req.body.id) || '').trim();
    if (!id) return res.status(400).json({ error: 'id_required' });
    await q('DELETE FROM lecture_courses WHERE id=$1', [id]);  // 퀴즈·수강기록은 FK ON DELETE CASCADE로 함께 삭제
    res.json({ ok: true });
  }));

  app.get('/api/lecture/admin/courses', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();   // group_id 컬럼 보장
    const rows = (await q(`SELECT c.*, (SELECT count(*) FROM lecture_quiz z WHERE z.course_id=c.id) AS quiz_count
                           FROM lecture_courses c ORDER BY c.sort, c.created_at`)).rows;
    res.json({ ok: true, courses: rows });
  }));

  // 강의 수정 시 기존 퀴즈(정답·해설 포함) 불러오기
  app.get('/api/lecture/admin/quiz', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const courseId = req.query.courseId;
    if (!courseId) return res.status(400).json({ error: 'course_required' });
    const rows = (await q('SELECT id, ord, question, options, answer_index, explanation FROM lecture_quiz WHERE course_id=$1 ORDER BY ord, id', [courseId])).rows;
    res.json({ ok: true, quiz: rows });
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

  // 전체 강의 기준 수강 현황 — 학생별 (전체 강의 평균 진도율 · 수료 강의 수)
  app.get('/api/lecture/admin/report-overall', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const courseCount = Number((await q('SELECT count(*)::int AS n FROM lecture_courses')).rows[0].n) || 0;
    const rows = (await q(
      `SELECT s.name, s.phone, s.code,
              COALESCE(SUM(p.watched_pct), 0)::int      AS sum_pct,
              COUNT(p.completed_at)::int                AS completed_count,
              COUNT(p.course_id)::int                   AS started_count
         FROM lecture_students s
         LEFT JOIN lecture_progress p ON p.student_id = s.id
        GROUP BY s.id, s.name, s.phone, s.code
        ORDER BY sum_pct DESC, s.created_at DESC`
    )).rows;
    const out = rows.map(function (r) {
      return {
        name: r.name, phone: r.phone, code: r.code,
        // 전체 강의 기준: 진도 없는 강의는 0%로 간주 → 합계 / 전체 강의 수
        overall_pct: courseCount ? Math.round(r.sum_pct / courseCount) : 0,
        completed_count: r.completed_count,
        started_count: r.started_count,
        course_count: courseCount
      };
    });
    res.json({ ok: true, course_count: courseCount, rows: out });
  }));

  // ════════ 센터영상 (영상보기 페이지 mjs.ai.kr/videos) ════════
  //  강의와 별개. 테이블은 최초 호출 시 자동 생성.
  let videoTableReady = false;
  async function ensureVideoTable() {
    if (videoTableReady) return;
    await q(`CREATE TABLE IF NOT EXISTS center_videos (
      id serial PRIMARY KEY,
      youtube_id text NOT NULL,
      title text NOT NULL DEFAULT '',
      sort int NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    // 멀티 매체 지원 컬럼(유튜브/틱톡/인스타). 기존 행은 유튜브로 백필.
    await q(`ALTER TABLE center_videos ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'youtube'`);
    await q(`ALTER TABLE center_videos ADD COLUMN IF NOT EXISTS embed_id text`);
    await q(`ALTER TABLE center_videos ADD COLUMN IF NOT EXISTS url text`);
    await q(`UPDATE center_videos SET embed_id = youtube_id WHERE embed_id IS NULL`);
    videoTableReady = true;
  }

  // 입력(URL 또는 ID)에서 매체·임베드ID 판별
  function parseVideoSource(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    // 틱톡: .../video/<숫자>
    if (/tiktok\.com/i.test(s)) {
      const m = s.match(/\/video\/(\d+)/) || s.match(/\/(\d{8,})/);
      return { provider: 'tiktok', embed_id: m ? m[1] : '', url: s };
    }
    // 인스타: /reel|reels|p|tv/<코드>
    if (/instagram\.com/i.test(s)) {
      const m = s.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
      return { provider: 'instagram', embed_id: m ? m[1] : '', url: s };
    }
    // 유튜브(전체 URL 또는 11자리 ID)
    const yt = extractYtId(s);
    if (/^[A-Za-z0-9_-]{11}$/.test(yt)) return { provider: 'youtube', embed_id: yt, url: s };
    return null;
  }

  // 방문자용: 노출(active) 영상 목록
  app.get('/api/lecture/videos', wrap(async (req, res) => {
    await ensureVideoTable();
    const rows = (await q("SELECT id, provider, embed_id, youtube_id, url, title FROM center_videos WHERE active = true ORDER BY sort, created_at")).rows;
    res.json({ ok: true, videos: rows.map(function (r) { return { id: r.id, provider: r.provider || 'youtube', embed_id: r.embed_id || r.youtube_id, url: r.url, title: r.title }; }) });
  }));

  // 관리자: 전체 목록
  app.get('/api/lecture/admin/videos', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureVideoTable();
    const rows = (await q("SELECT id, provider, embed_id, youtube_id, url, title, sort, active, created_at FROM center_videos ORDER BY sort, created_at")).rows;
    res.json({ ok: true, videos: rows.map(function (r) { return { id: r.id, provider: r.provider || 'youtube', embed_id: r.embed_id || r.youtube_id, url: r.url, title: r.title, sort: r.sort, active: r.active }; }) });
  }));

  // 관리자: 추가/수정 (id 있으면 수정, 없으면 신규) — 유튜브/틱톡/인스타 URL 자동 판별
  app.post('/api/lecture/admin/video', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureVideoTable();
    const b = req.body || {};
    const parsed = parseVideoSource(b.url || b.youtube_id);   // url 우선, 하위호환 youtube_id
    if (!parsed || !parsed.embed_id) return res.status(400).json({ error: 'bad_source', message: '지원하지 않는 주소입니다. 유튜브·틱톡·인스타그램 영상 주소를 확인해 주세요.' });
    const title = String(b.title || '').trim();
    const sort = parseInt(b.sort, 10) || 0;
    const active = b.active !== false;
    // youtube_id 컬럼은 NOT NULL이라 유튜브가 아니어도 embed_id로 채운다(하위호환)
    const ytCol = parsed.provider === 'youtube' ? parsed.embed_id : parsed.embed_id;
    const id = parseInt(b.id, 10);
    let saved;
    if (id) {
      saved = (await q('UPDATE center_videos SET provider=$2, embed_id=$3, url=$4, youtube_id=$5, title=$6, sort=$7, active=$8 WHERE id=$1 RETURNING id, provider, embed_id, url, title, sort, active',
        [id, parsed.provider, parsed.embed_id, parsed.url, ytCol, title, sort, active])).rows[0];
      if (!saved) return res.status(404).json({ error: 'not_found' });
    } else {
      saved = (await q('INSERT INTO center_videos (provider, embed_id, url, youtube_id, title, sort, active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, provider, embed_id, url, title, sort, active',
        [parsed.provider, parsed.embed_id, parsed.url, ytCol, title, sort, active])).rows[0];
    }
    res.json({ ok: true, video: saved });
  }));

  // 관리자: 순서 일괄 저장 (드래그앤드롭) — ids 배열 순서대로 sort 0,1,2...
  app.post('/api/lecture/admin/video-reorder', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureVideoTable();
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : null;
    if (!ids) return res.status(400).json({ error: 'ids_required' });
    for (let i = 0; i < ids.length; i++) {
      const vid = parseInt(ids[i], 10);
      if (vid) await q('UPDATE center_videos SET sort=$2 WHERE id=$1', [vid, i]);
    }
    res.json({ ok: true });
  }));

  // 관리자: 삭제
  app.post('/api/lecture/admin/video-delete', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureVideoTable();
    const id = parseInt((req.body && req.body.id), 10);
    if (!id) return res.status(400).json({ error: 'id_required' });
    await q('DELETE FROM center_videos WHERE id=$1', [id]);
    res.json({ ok: true });
  }));

  // ════════ 강의 그룹 + 자격증 관리 ════════
  //  강의를 그룹(아로마테라피·플라잉요가·번지피지오 등)으로 묶고, 체크박스로 이동/복사.
  //  자격증: 종류(등록 자격증) 관리 + 발급현황 리스트. 발급 폼(template_html)은 관리자가 디자인 주입.
  //  테이블은 최초 호출 시 자동 생성(center_videos 패턴).
  let certTablesReady = false;
  async function ensureCertTables() {
    if (certTablesReady) return;
    // 강의 그룹
    await q(`CREATE TABLE IF NOT EXISTS lecture_groups (
      id serial PRIMARY KEY,
      name text NOT NULL,
      sort int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q(`ALTER TABLE lecture_courses ADD COLUMN IF NOT EXISTS group_id int`);
    // 등록 자격증(자격증 종류)
    await q(`CREATE TABLE IF NOT EXISTS lecture_cert_types (
      id serial PRIMARY KEY,
      name text NOT NULL,
      issuer text,
      template_html text,
      sort int NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    // 자격증 발급현황
    await q(`CREATE TABLE IF NOT EXISTS lecture_certs (
      id serial PRIMARY KEY,
      cert_type_id int,
      cert_no text,
      holder_name text NOT NULL,
      holder_phone text,
      issued_date date,
      memo text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    // 수료자 정보 확장: 영문이름·생년월일·수료일 (holder_name=한글이름)
    await q(`ALTER TABLE lecture_certs ADD COLUMN IF NOT EXISTS name_en text`);
    await q(`ALTER TABLE lecture_certs ADD COLUMN IF NOT EXISTS birth date`);
    await q(`ALTER TABLE lecture_certs ADD COLUMN IF NOT EXISTS completion_date date`);
    // 발급 폼 시드: "아로마 전문 지도사" 종류가 이 발급 폼으로 출력되도록 보장(이름 기준 upsert).
    //  이미 같은 이름의 자격증이 있으면 template_html 을 이 폼으로 갱신, 없으면 신규 등록.
    //  (관리자가 이 종류의 폼을 직접 수정했다면 재배포 시 이 시드로 되돌아갈 수 있음 — 커스터마이즈 필요 시 시드 갱신)
    try {
      for (const s of (CERT_SEEDS || [])) {
        if (!s || !s.name || !s.template) continue;
        const up = await q('UPDATE lecture_cert_types SET template_html=$2 WHERE name=$1', [s.name, s.template]);
        if (!up.rowCount) {
          await q('INSERT INTO lecture_cert_types (name, issuer, template_html, sort, active) VALUES ($1,$2,$3,0,true)',
            [s.name, s.issuer || null, s.template]);
          console.log('✅ lecture: 발급 폼 신규 등록 — ' + s.name);
        } else {
          console.log('✅ lecture: 발급 폼 갱신 — ' + s.name);
        }
      }
    } catch (e) { console.error('[lecture] cert seed', String((e && e.message) || e)); }
    certTablesReady = true;
  }

  // ── 강의 그룹 ──
  app.get('/api/lecture/admin/groups', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const rows = (await q(`SELECT g.*, (SELECT count(*) FROM lecture_courses c WHERE c.group_id = g.id)::int AS course_count
                           FROM lecture_groups g ORDER BY g.sort, g.created_at`)).rows;
    res.json({ ok: true, groups: rows });
  }));

  // 그룹 추가/수정 (id 있으면 수정)
  app.post('/api/lecture/admin/group', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const sort = parseInt(b.sort, 10) || 0;
    if (!name) return res.status(400).json({ error: 'name_required' });
    const id = parseInt(b.id, 10);
    let saved;
    if (id) {
      saved = (await q('UPDATE lecture_groups SET name=$2, sort=$3 WHERE id=$1 RETURNING id, name, sort', [id, name, sort])).rows[0];
      if (!saved) return res.status(404).json({ error: 'not_found' });
    } else {
      saved = (await q('INSERT INTO lecture_groups (name, sort) VALUES ($1,$2) RETURNING id, name, sort', [name, sort])).rows[0];
    }
    res.json({ ok: true, group: saved });
  }));

  // 그룹 삭제 (소속 강의는 group_id=NULL 로 미분류 처리, 강의 자체는 보존)
  app.post('/api/lecture/admin/group-delete', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const id = parseInt((req.body && req.body.id), 10);
    if (!id) return res.status(400).json({ error: 'id_required' });
    await q('UPDATE lecture_courses SET group_id=NULL WHERE group_id=$1', [id]);
    await q('DELETE FROM lecture_groups WHERE id=$1', [id]);
    res.json({ ok: true });
  }));

  // 선택 강의 그룹 이동 (group_id 변경). groupId=null 이면 미분류로.
  app.post('/api/lecture/admin/courses-move', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : null;
    const gid = (req.body && req.body.group_id != null) ? (parseInt(req.body.group_id, 10) || null) : null;
    if (!ids || !ids.length) return res.status(400).json({ error: 'ids_required' });
    await q('UPDATE lecture_courses SET group_id=$1 WHERE id = ANY($2::text[])', [gid, ids]);
    res.json({ ok: true, moved: ids.length });
  }));

  // 선택 강의 그룹 복사 (강의+퀴즈를 새 id로 복제해 대상 그룹에 추가)
  app.post('/api/lecture/admin/courses-copy', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : null;
    const gid = (req.body && req.body.group_id != null) ? (parseInt(req.body.group_id, 10) || null) : null;
    if (!ids || !ids.length) return res.status(400).json({ error: 'ids_required' });
    let copied = 0;
    for (const srcId of ids) {
      const c = (await q('SELECT * FROM lecture_courses WHERE id=$1', [srcId])).rows[0];
      if (!c) continue;
      // 고유한 새 id 생성: <원본>-copy, -copy2 …
      let newId = srcId + '-copy', n = 1;
      while ((await q('SELECT 1 FROM lecture_courses WHERE id=$1', [newId])).rows.length) {
        n++; newId = srcId + '-copy' + n;
      }
      await q(
        `INSERT INTO lecture_courses (id, title, youtube_id, description, open_from, open_to, pass_score, active, sort, group_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [newId, c.title + ' (복사)', c.youtube_id, c.description, c.open_from, c.open_to, c.pass_score, c.active, c.sort, gid]
      );
      const qs = (await q('SELECT ord, question, options, answer_index, explanation FROM lecture_quiz WHERE course_id=$1 ORDER BY ord, id', [srcId])).rows;
      for (const z of qs) {
        await q('INSERT INTO lecture_quiz (course_id, ord, question, options, answer_index, explanation) VALUES ($1,$2,$3,$4,$5,$6)',
          [newId, z.ord, z.question, JSON.stringify(z.options || []), z.answer_index, z.explanation]);
      }
      copied++;
    }
    res.json({ ok: true, copied });
  }));

  // ── 등록 자격증(자격증 종류) ──
  app.get('/api/lecture/admin/cert-types', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const rows = (await q(`SELECT t.id, t.name, t.issuer, t.sort, t.active, t.created_at, t.template_html,
                                  (t.template_html IS NOT NULL AND t.template_html <> '') AS has_template,
                                  (SELECT count(*) FROM lecture_certs c WHERE c.cert_type_id = t.id)::int AS issued_count
                           FROM lecture_cert_types t ORDER BY t.sort, t.created_at`)).rows;
    res.json({ ok: true, cert_types: rows });
  }));

  // 자격증 종류 단건 (발급 폼 템플릿 포함)
  app.get('/api/lecture/admin/cert-type', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const id = parseInt(req.query.id, 10);
    if (!id) return res.status(400).json({ error: 'id_required' });
    const row = (await q('SELECT id, name, issuer, template_html, sort, active FROM lecture_cert_types WHERE id=$1', [id])).rows[0];
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, cert_type: row });
  }));

  // 자격증 종류 추가/수정 (id 있으면 수정). template_html = 발급 폼 디자인(HTML).
  app.post('/api/lecture/admin/cert-type', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const issuer = String(b.issuer || '').trim() || null;
    const sort = parseInt(b.sort, 10) || 0;
    const active = b.active !== false;
    const hasTpl = Object.prototype.hasOwnProperty.call(b, 'template_html');
    const tpl = hasTpl ? (String(b.template_html || '') || null) : undefined;
    if (!name) return res.status(400).json({ error: 'name_required' });
    const id = parseInt(b.id, 10);
    let saved;
    if (id) {
      // template_html 은 보낸 경우에만 갱신(목록 수정이 템플릿을 지우지 않도록)
      if (tpl === undefined) {
        saved = (await q('UPDATE lecture_cert_types SET name=$2, issuer=$3, sort=$4, active=$5 WHERE id=$1 RETURNING id, name, issuer, sort, active',
          [id, name, issuer, sort, active])).rows[0];
      } else {
        saved = (await q('UPDATE lecture_cert_types SET name=$2, issuer=$3, sort=$4, active=$5, template_html=$6 WHERE id=$1 RETURNING id, name, issuer, sort, active',
          [id, name, issuer, sort, active, tpl])).rows[0];
      }
      if (!saved) return res.status(404).json({ error: 'not_found' });
    } else {
      saved = (await q('INSERT INTO lecture_cert_types (name, issuer, sort, active, template_html) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, issuer, sort, active',
        [name, issuer, sort, active, tpl === undefined ? null : tpl])).rows[0];
    }
    res.json({ ok: true, cert_type: saved });
  }));

  app.post('/api/lecture/admin/cert-type-delete', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const id = parseInt((req.body && req.body.id), 10);
    if (!id) return res.status(400).json({ error: 'id_required' });
    await q('DELETE FROM lecture_certs WHERE cert_type_id=$1', [id]);
    await q('DELETE FROM lecture_cert_types WHERE id=$1', [id]);
    res.json({ ok: true });
  }));

  // ── 자격증 발급현황 ──
  app.get('/api/lecture/admin/certs', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const typeId = parseInt(req.query.typeId, 10);
    const params = [];
    let where = '';
    if (typeId) { where = 'WHERE c.cert_type_id = $1'; params.push(typeId); }
    const rows = (await q(
      `SELECT c.id, c.cert_type_id, c.cert_no, c.holder_name, c.name_en, c.birth, c.holder_phone,
              c.issued_date, c.completion_date, c.memo, c.created_at,
              t.name AS cert_type_name
         FROM lecture_certs c
         LEFT JOIN lecture_cert_types t ON t.id = c.cert_type_id
         ${where}
        ORDER BY c.created_at DESC, c.id DESC`, params)).rows;
    res.json({ ok: true, certs: rows });
  }));

  // 자격증 발급 기록 추가/수정
  app.post('/api/lecture/admin/cert', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const b = req.body || {};
    const certTypeId = parseInt(b.cert_type_id, 10) || null;
    const holder = String(b.holder_name || '').trim();        // 한글이름
    const nameEn = String(b.name_en || '').trim() || null;    // 영문이름(자격증 표기)
    const birth = b.birth || null;                            // 생년월일
    const phone = String(b.holder_phone || '').trim() || null; // 연락처
    const completion = b.completion_date || null;             // 수료일(자격증 표기)
    const certNo = String(b.cert_no || '').trim() || null;    // 발급번호(자동)
    const memo = String(b.memo || '').trim() || null;
    const issued = completion;   // 하위호환: issued_date = 수료일
    if (!holder) return res.status(400).json({ error: 'holder_required' });
    const cols = 'id, cert_type_id, cert_no, holder_name, name_en, birth, holder_phone, completion_date, issued_date, memo';
    const id = parseInt(b.id, 10);
    let saved;
    if (id) {
      saved = (await q(`UPDATE lecture_certs SET cert_type_id=$2, cert_no=$3, holder_name=$4, name_en=$5, birth=$6, holder_phone=$7, completion_date=$8, issued_date=$9, memo=$10
                        WHERE id=$1 RETURNING ${cols}`,
        [id, certTypeId, certNo, holder, nameEn, birth, phone, completion, issued, memo])).rows[0];
      if (!saved) return res.status(404).json({ error: 'not_found' });
    } else {
      saved = (await q(`INSERT INTO lecture_certs (cert_type_id, cert_no, holder_name, name_en, birth, holder_phone, completion_date, issued_date, memo)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${cols}`,
        [certTypeId, certNo, holder, nameEn, birth, phone, completion, issued, memo])).rows[0];
    }
    res.json({ ok: true, cert: saved });
  }));

  app.post('/api/lecture/admin/cert-delete', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await ensureCertTables();
    const id = parseInt((req.body && req.body.id), 10);
    if (!id) return res.status(400).json({ error: 'id_required' });
    await q('DELETE FROM lecture_certs WHERE id=$1', [id]);
    res.json({ ok: true });
  }));

  console.log('✅ lecture-api 라우트 등록 (/api/lecture/*)');
}

module.exports = { registerLectureRoutes };
