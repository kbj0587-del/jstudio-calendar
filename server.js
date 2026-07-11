const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const app      = express();
const PORT     = process.env.PORT || 8080;

// ── 환경 감지 ───────────────────────────────────────
const IS_VERCEL    = !!process.env.VERCEL;           // Vercel 서버리스
const IS_SERVERLESS = IS_VERCEL;                     // 확장 가능
const USE_DB       = !!process.env.DATABASE_URL;

// ── PostgreSQL 연결 ─────────────────────────────────
let pool = null;
let reconnectTimer = null;

function createPool() {
  const { Pool } = require('pg');
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // 서버리스(Vercel)는 커넥션 풀 1개, 일반 서버는 5개
    max: IS_SERVERLESS ? 1 : 5,
    idleTimeoutMillis:    IS_SERVERLESS ? 10000 : 30000,
    connectionTimeoutMillis: 10000,
  });
}

// pool 에러 → 재연결 예약 (서버리스에선 no-op)
function attachPoolErrorHandler() {
  if (!pool || IS_SERVERLESS) return;
  pool.on('error', (err) => {
    console.error('⚠️  PostgreSQL pool 오류:', err.message, '→ 재연결 예약');
    pool = null;
    scheduleReconnect();
  });
}

// DB 자동 재연결 (서버 모드 전용 — 서버리스에선 요청마다 재연결됨)
function scheduleReconnect(delayMs = 30000) {
  if (!USE_DB || IS_SERVERLESS || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    console.log('🔄 DB 자동 재연결 시도 중...');
    try {
      const newPool = createPool();
      await newPool.query('SELECT 1');
      pool = newPool;
      attachPoolErrorHandler();
      await pool.query(
        'INSERT INTO jstudio_store (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
        [JSON.stringify(store)]
      );
      console.log('✅ DB 자동 재연결 성공 — 데이터 DB 동기화 완료');
    } catch (e) {
      console.error('❌ DB 자동 재연결 실패:', e.message, '→ 30초 후 재시도');
      scheduleReconnect(30000);
    }
  }, delayMs);
}

if (USE_DB) {
  pool = createPool();
  attachPoolErrorHandler();
  const maskedUrl = process.env.DATABASE_URL.replace(/\/\/[^@]+@/, '//****@');
  console.log('🐘 PostgreSQL 모드 활성화' + (IS_SERVERLESS ? ' (서버리스)' : ''));
  console.log(`   DB URL: ${maskedUrl}`);
} else {
  console.log('📁 파일 저장 모드 (DATABASE_URL 없음)');
}

// ── 서버리스 지연 초기화 ────────────────────────────
// Vercel에서는 서버 시작 시 initStore()를 못 부르므로
// 첫 요청 때 한 번만 초기화한다
let storeReady = false;
let storeInitPromise = null;

let storeLastLoaded = 0;
// Vercel 서버리스: 5초마다 DB에서 재로드 (인스턴스 간 데이터 불일치 방지)
const STORE_TTL_MS = IS_SERVERLESS ? 5000 : Infinity;

function ensureStore() {
  const stale = (Date.now() - storeLastLoaded) > STORE_TTL_MS;
  if (storeReady && !stale) return Promise.resolve();
  if (storeInitPromise) return storeInitPromise;
  storeReady = false;
  storeInitPromise = initStore()
    .then(() => {
      ensureDefaultAdmin();
      storeReady = true;
      storeLastLoaded = Date.now();
      storeInitPromise = null;
    })
    .catch(err => { storeInitPromise = null; throw err; });
  return storeInitPromise;
}

app.use(express.json({ limit: '10mb' }));

// 정적 파일은 DB 초기화 없이 바로 서빙 (CSS/JS/이미지 등)
app.use(express.static(__dirname, {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js'))
      res.setHeader('Content-Type', 'application/javascript');
    // 앱 코드(html/js/css/sw/manifest)는 항상 서버 재검증 → 브라우저 재시작 시 최신 보장
    // ETag 기반이라 변경 없으면 304(가벼움), 변경되면 200(새 파일)
    if (/\.(html|js|css)$/.test(filePath) || filePath.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
      // 이미지·폰트 등 정적 자산은 캐시 허용
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// 서버리스 환경: 첫 요청 시 DB/store 초기화 (정적파일·health check 제외)
if (IS_SERVERLESS) {
  app.use(async (req, res, next) => {
    if (req.path === '/api/health') return next();
    try { await ensureStore(); next(); }
    catch (err) {
      console.error('Store 초기화 실패:', err.message);
      res.status(503).json({ error: 'starting_up', message: '서버 초기화 중입니다. 잠시 후 다시 시도해주세요.' });
    }
  });
}

// ── 상수 ───────────────────────────────────────────
const DATA_FILE = '/tmp/jstudio_data.json';
const ADMIN_PW  = process.env.ADMIN_PASSWORD || 'jstudio2024';

const DEFAULT_CATS = [
  { id: 'daeggang',      name: '대강',      color: '#e07b20', system: true },
  { id: 'incentive',    name: '인센티브',   color: '#7c3aed', system: true },
  { id: 'trial',        name: '체험수업',   color: '#0891b2', system: true },
  { id: 'review',       name: '리뷰체험',   color: '#e91e8c', system: true },
  { id: 'classnoshow',  name: '수업노쇼',   color: '#e03050', system: true },
  { id: 'sales',        name: '매출/등록',  color: '#059669', system: true },
  { id: 'consult',      name: '상담',       color: '#0d9488', system: true },
  { id: 'personallesson', name: '개인레슨', color: '#6366f1', system: true },
  { id: 'meeting',      name: '미팅',       color: '#64748b', system: true },
  { id: 'noshow',       name: '노쇼',       color: '#e03050' },
  { id: 'makeup',       name: '보강',       color: '#1a8fc7' },
  { id: 'info',         name: '중요정보',   color: '#c88a00' },
  { id: 'other',        name: '기타',       color: '#2e9e4f' },
];
const SYSTEM_CAT_IDS = ['daeggang','incentive','trial','review','classnoshow','sales','consult','personallesson','meeting'];

// 강사에게 허용되는 카테고리
const INSTRUCTOR_ALLOWED_CATS = ['trial','review','personallesson','meeting','daeggang'];

// ── 데이터 저장소 ───────────────────────────────────
let store = {
  inviteRequired:    false,   // true = 초대장 없이 접근 불가
  invites:           [],      // 일회용 초대 토큰 배열
  users:             [],      // 등록된 사용자
  events:            [],      // 일정
  activityLog:       [],      // 활동 기록
  categories:        DEFAULT_CATS,
  darkMode:          false,
  incentiveDefaults:    { trialAmount: 10000, consultRate: 5 }, // 인센티브 기본값
  instructorAllowedCats: null, // null = DEFAULT (INSTRUCTOR_ALLOWED_CATS)
};

// ── DB 초기화 및 데이터 로드 (서버 시작 시 1회) ─────
async function initStore() {
  let useDB = USE_DB;

  if (useDB) {
    // ── PostgreSQL 연결 테스트 ──
    try {
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL 연결 성공');
    } catch (connErr) {
      console.error('❌ PostgreSQL 연결 실패:', connErr.message);
      console.error('   ⚠️  파일 모드로 전환하여 서버를 계속 시작합니다.');
      useDB = false;  // 크래시 대신 파일 모드로 폴백
      pool  = null;
      scheduleReconnect(30000); // 30초 후 자동 재연결 시도
    }
  }

  if (useDB) {
    // ── PostgreSQL 데이터 로드 ──
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS jstudio_store (
          id   INTEGER PRIMARY KEY,
          data JSONB   NOT NULL
        )
      `);
      const result = await pool.query('SELECT data FROM jstudio_store WHERE id = 1');
      if (result.rows.length > 0) {
        const saved = result.rows[0].data;
        store = { ...store, ...saved };
        if (!Array.isArray(store.users))       store.users       = [];
        if (!Array.isArray(store.activityLog)) store.activityLog = [];
        if (!Array.isArray(store.invites))     store.invites     = [];
        if (!Array.isArray(store.events))      store.events      = [];
        if (!Array.isArray(store.categories))  store.categories  = DEFAULT_CATS;
        if (!store.incentiveDefaults) store.incentiveDefaults = { trialAmount: 10000, consultRate: 5 };
        // 시스템 카테고리가 DB에 없는 경우 자동 추가 (마이그레이션)
        SYSTEM_CAT_IDS.forEach(id => {
          const def = DEFAULT_CATS.find(c => c.id === id);
          if (!def) return;
          const existing = store.categories.find(c => c.id === id);
          if (!existing) {
            store.categories.unshift({ ...def });
            console.log(`📌 시스템 카테고리 추가: ${def.name}`);
          } else {
            existing.name   = def.name;
            existing.system = true;
          }
        });
        // 마이그레이션 완료 — 비활성화 (2026-06-16)
        // migrateSalesPersonalLesson();
        console.log(`✅ DB 로드 완료: 일정 ${store.events.length}건 | 사용자 ${store.users.length}명 | 카테고리 ${store.categories.length}개`);
      } else {
        await pool.query('INSERT INTO jstudio_store (id, data) VALUES (1, $1)', [JSON.stringify(store)]);
        console.log('✅ DB 최초 초기화 완료 (새 데이터베이스)');
      }
    } catch (dbErr) {
      console.error('❌ DB 초기화 오류:', dbErr.message);
      console.error('   ⚠️  파일 모드로 전환합니다.');
      useDB = false;
      pool  = null;
      scheduleReconnect(30000);
    }
  }

  if (!useDB) {
    // ── 파일 폴백 ──
    try {
      if (fs.existsSync(DATA_FILE)) {
        const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        store = { ...store, ...saved };
        if (!Array.isArray(store.users))       store.users       = [];
        if (!Array.isArray(store.activityLog)) store.activityLog = [];
        if (!Array.isArray(store.invites))     store.invites     = [];
        if (!Array.isArray(store.events))      store.events      = [];
        console.log(`⚠️  파일 로드 (임시저장): 일정 ${store.events.length}건 | 사용자 ${store.users.length}명`);
        console.log('⚠️  이 데이터는 다음 배포 시 삭제됩니다!');
      } else {
        console.log('⚠️  저장 파일 없음, 기본값으로 시작');
      }
    } catch (e) {
      console.error('파일 로드 실패:', e.message);
    }
  }
}

// ── sales 내 개인레슨 → personallesson 마이그레이션 ─
async function migrateSalesPersonalLesson() {
  let changed = false;
  store.events = store.events.map(ev => {
    if (ev.type === 'sales' && ev.extraFields?.lessonType === '개인레슨') {
      changed = true;
      return {
        ...ev,
        type: 'personallesson',
        extraFields: {
          clientName:   ev.extraFields.clientName || '',
          sessionCount: ev.extraFields.sessionCount || 0,
          migratedFrom: 'sales',
        },
      };
    }
    return ev;
  });
  if (changed) {
    console.log('📦 sales→personallesson 마이그레이션 완료');
    await saveToFile(); // DB 저장 완료까지 대기
  }
}

// ── 저장 (fire-and-forget) ──────────────────────────
function saveToFile() {
  if (USE_DB && pool) {
    return pool.query(
      'INSERT INTO jstudio_store (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      [JSON.stringify(store)]
    ).catch(e => {
      console.error('❌ DB 저장 실패:', e.message);
      try {
        fs.writeFileSync(DATA_FILE + '.emergency', JSON.stringify(store), 'utf8');
        console.log('📁 비상 파일 백업 저장됨');
      } catch (_) {}
    });
  } else {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8'); }
    catch (e) { console.error('파일 저장 실패:', e.message); }
    return Promise.resolve();
  }
}

// ── 일회용 토큰 생성 ────────────────────────────────
function generateToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let token;
  do {
    token = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (store.invites.find(i => i.token === token));
  return token;
}

// ── PIN 해시 ────────────────────────────────────────
const PIN_SALT = process.env.PIN_SALT || 'jstudio_pin_2024';
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin + PIN_SALT).digest('hex');
}

// ── 기본 관리자 계정 자동 생성 ─────────────────────
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'kbj0587';
const DEFAULT_ADMIN_PIN      = process.env.DEFAULT_ADMIN_PIN      || '123456';
function ensureDefaultAdmin() {
  if (store.users.find(u => u.username === DEFAULT_ADMIN_USERNAME)) return;
  store.users.push({
    id:           crypto.randomUUID(),
    name:         '관리자',
    username:     DEFAULT_ADMIN_USERNAME,
    pinHash:      hashPin(DEFAULT_ADMIN_PIN),
    status:       'approved',
    role:         'admin',
    registeredAt: new Date().toISOString(),
    approvedAt:   new Date().toISOString(),
  });
  saveToFile();
  console.log(`✅ 기본 관리자 계정 생성: @${DEFAULT_ADMIN_USERNAME}`);
}

// ── 인증 헬퍼 ──────────────────────────────────────
function isAdmin(req) {
  return req.headers['x-admin-password'] === ADMIN_PW;
}

function requireAdmin(req, res, next) {
  if (isAdmin(req) || isSubAdmin(req)) return next();
  return res.status(403).json({ error: 'forbidden' });
}

// 서브 관리자 확인 (role:'admin' 을 부여받은 승인 사용자)
function isSubAdmin(req) {
  const uid = req.headers['x-user-id'];
  if (!uid) return false;
  const user = store.users.find(u => u.id === uid);
  return !!(user && user.status === 'approved' && user.role === 'admin');
}

// 강사 확인
function isInstructor(req) {
  const uid = req.headers['x-user-id'];
  if (!uid) return false;
  const user = store.users.find(u => u.id === uid);
  return !!(user && user.status === 'approved' && user.role === 'instructor');
}

// 강사용 이벤트 필터링: 비허용 카테고리 제거, 허용 카테고리 내 금융 필드 제거
function filterEventForInstructor(ev) {
  const allowedCats = store.instructorAllowedCats || INSTRUCTOR_ALLOWED_CATS;
  if (!allowedCats.includes(ev.type)) return null;
  if (ev.type === 'trial') {
    const { trialFee, personCount, trialTotal, linkedRegistration, linkedIncentive, ...safe } = ev.extraFields || {};
    return { ...ev, extraFields: safe };
  }
  return ev;
}

// 데이터 접근 미들웨어: 관리자 OR 승인된 사용자
function requireAccess(req, res, next) {
  if (isAdmin(req)) return next();

  const uid  = req.headers['x-user-id'];
  const user = uid ? store.users.find(u => u.id === uid) : null;

  if (!user) {
    return res.status(401).json({ error: 'needsRegistration', message: '등록이 필요합니다.' });
  }
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'pending',  message: '관리자 승인 대기 중입니다.' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'rejected', message: '접근이 거절되었습니다.' });
  }
  if (user.status === 'approved') {
    req.currentUser = user;
    return next();
  }
  return res.status(401).json({ error: 'needsRegistration' });
}

// ── PWA 헤더 ───────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ════════════════════════════════════════════════════
// 인증 API (아이디/PIN)
// ════════════════════════════════════════════════════

// 회원가입 요청
app.post('/api/auth/register', async (req, res) => {
  const { name, username, pin } = req.body;
  if (!name?.trim())     return res.status(400).json({ error: 'name_required',     message: '이름을 입력해주세요.' });
  if (!username?.trim()) return res.status(400).json({ error: 'username_required', message: '아이디를 입력해주세요.' });
  if (!pin || String(pin).length < 4)
    return res.status(400).json({ error: 'pin_required', message: 'PIN은 4자리 이상이어야 합니다.' });

  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(uname))
    return res.status(400).json({ error: 'username_invalid', message: '아이디는 영문 소문자, 숫자, _만 사용 가능합니다.' });

  if (store.users.find(u => u.username === uname))
    return res.status(400).json({ error: 'username_taken', message: '이미 사용 중인 아이디입니다.' });

  const newUser = {
    id:           crypto.randomUUID(),
    name:         name.trim(),
    username:     uname,
    pinHash:      hashPin(String(pin)),
    status:       'pending',
    registeredAt: new Date().toISOString(),
    approvedAt:   null,
  };
  store.users.push(newUser);
  await saveToFile();
  console.log(`✅ 신규 가입 요청: ${newUser.name} (@${uname})`);
  res.json({ ok: true, user: { id: newUser.id, name: newUser.name, status: newUser.status } });
});

// 로그인
app.post('/api/auth/login', (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin)
    return res.status(400).json({ error: 'missing_fields', message: '아이디와 PIN을 입력해주세요.' });

  const user = store.users.find(u => u.username === username.trim().toLowerCase());
  if (!user || user.pinHash !== hashPin(String(pin)))
    return res.status(401).json({ error: 'invalid_credentials', message: '아이디 또는 PIN이 올바르지 않습니다.' });

  if (user.status === 'pending')
    return res.status(403).json({ error: 'pending',  message: '관리자 승인 대기 중입니다.' });
  if (user.status === 'rejected')
    return res.status(403).json({ error: 'rejected', message: '접근이 거절되었습니다.' });

  res.json({ ok: true, user: { id: user.id, name: user.name, status: user.status, role: user.role || 'user' } });
});

// ════════════════════════════════════════════════════
// 관리자 API
// ════════════════════════════════════════════════════

// 관리자 비밀번호 확인
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  res.json({ ok: password === ADMIN_PW });
});

// 사용자 목록
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: store.users });
});

// 사용자 승인 (role 선택 포함)
app.post('/api/admin/users/:id/approve', requireAdmin, async (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.status     = 'approved';
  user.approvedAt = new Date().toISOString();
  const { role } = req.body;
  if (role && ['user','instructor','admin'].includes(role)) {
    user.role = role;
  }
  await saveToFile();
  res.json({ ok: true, user });
});

// 강사 카테고리 노출 설정 조회
app.get('/api/admin/category-visibility', requireAdmin, (req, res) => {
  res.json({
    instructorAllowedCats: store.instructorAllowedCats || INSTRUCTOR_ALLOWED_CATS,
    defaultCats: INSTRUCTOR_ALLOWED_CATS,
    allSystemCats: SYSTEM_CAT_IDS,
  });
});

// 강사 카테고리 노출 설정 저장
app.post('/api/admin/category-visibility', requireAdmin, async (req, res) => {
  const { instructorAllowedCats } = req.body;
  if (!Array.isArray(instructorAllowedCats))
    return res.status(400).json({ error: 'invalid', message: 'instructorAllowedCats must be array' });
  store.instructorAllowedCats = instructorAllowedCats;
  await saveToFile();
  res.json({ ok: true, instructorAllowedCats: store.instructorAllowedCats });
});

// 사용자 거절
app.post('/api/admin/users/:id/reject', requireAdmin, async (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.status     = 'rejected';
  user.rejectedAt = new Date().toISOString();
  await saveToFile();
  res.json({ ok: true, user });
});

// 사용자 삭제
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const idx = store.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  store.users.splice(idx, 1);
  await saveToFile();
  res.json({ ok: true });
});

// 관리자 권한 부여 (관리자 이상)
app.post('/api/admin/users/:id/grant-admin', requireAdmin, async (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  if (user.status !== 'approved')
    return res.status(400).json({ error: 'not_approved', message: '승인된 사용자에게만 관리자 권한을 부여할 수 있습니다.' });
  user.role = 'admin';
  await saveToFile();
  console.log(`✅ 관리자 권한 부여: ${user.name} (@${user.username})`);
  res.json({ ok: true, user });
});

// 관리자 권한 해제 (관리자 이상)
app.post('/api/admin/users/:id/revoke-admin', requireAdmin, async (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.role = 'user';
  await saveToFile();
  console.log(`✅ 관리자 권한 해제: ${user.name} (@${user.username})`);
  res.json({ ok: true, user });
});

// 강사 지정
app.post('/api/admin/users/:id/grant-instructor', requireAdmin, async (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  if (user.status !== 'approved')
    return res.status(400).json({ error: 'not_approved', message: '승인된 사용자에게만 강사 권한을 부여할 수 있습니다.' });
  user.role = 'instructor';
  await saveToFile();
  console.log(`✅ 강사 권한 부여: ${user.name} (@${user.username})`);
  res.json({ ok: true, user });
});

// 강사 해제
app.post('/api/admin/users/:id/revoke-instructor', requireAdmin, async (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.role = 'user';
  await saveToFile();
  console.log(`✅ 강사 권한 해제: ${user.name} (@${user.username})`);
  res.json({ ok: true, user });
});

// 활동 기록
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const logs = [...store.activityLog]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 200);
  res.json({ logs });
});

// ════════════════════════════════════════════════════
// 일회용 초대 토큰 API
// ════════════════════════════════════════════════════

// 초대장 생성 (관리자)
app.post('/api/admin/invites/generate', requireAdmin, async (req, res) => {
  const token = generateToken();
  const invite = {
    token,
    createdAt:   new Date().toISOString(),
    status:      'active',   // active | used | cancelled
    usedBy:      null,       // userId
    usedByName:  null,
    usedAt:      null,
  };
  store.invites.push(invite);
  // 최대 100개, 오래된 used/cancelled 정리
  if (store.invites.length > 100) {
    const active     = store.invites.filter(i => i.status === 'active');
    const recentDone = store.invites.filter(i => i.status !== 'active').slice(-30);
    store.invites = [...active, ...recentDone];
  }
  await saveToFile();
  res.json({ ok: true, invite });
});

// 초대장 목록 (관리자)
app.get('/api/admin/invites', requireAdmin, (req, res) => {
  const list = [...store.invites]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json({ invites: list });
});

// 초대장 취소 (관리자)
app.delete('/api/admin/invites/:token', requireAdmin, async (req, res) => {
  const invite = store.invites.find(i => i.token === req.params.token);
  if (!invite) return res.status(404).json({ error: 'not_found' });
  if (invite.status !== 'active') return res.status(400).json({ error: 'already_done' });
  invite.status = 'cancelled';
  await saveToFile();
  res.json({ ok: true });
});

// 초대장 유효성 확인 (공개 — invite.html에서 사용)
app.get('/api/invite/validate/:token', (req, res) => {
  const invite = store.invites.find(i => i.token === req.params.token);
  if (!invite)                   return res.json({ valid: false, reason: 'not_found' });
  if (invite.status === 'used')       return res.json({ valid: false, reason: 'used',      usedByName: invite.usedByName });
  if (invite.status === 'cancelled')  return res.json({ valid: false, reason: 'cancelled' });
  res.json({ valid: true });
});

// ════════════════════════════════════════════════════
// 사용자 등록 API
// ════════════════════════════════════════════════════

// 이름 + 초대 토큰으로 등록 요청
app.post('/api/invite/register', async (req, res) => {
  const { name, token: inviteToken, userId } = req.body;

  if (!name || !name.trim())
    return res.status(400).json({ error: 'name_required', message: '이름을 입력해주세요.' });

  // 이미 등록된 사용자면 현재 상태 반환
  if (userId) {
    const existing = store.users.find(u => u.id === userId);
    if (existing) return res.json({ ok: true, user: existing });
  }

  // 초대 토큰 검증
  const invite = store.invites.find(i => i.token === inviteToken);
  if (!invite)
    return res.status(400).json({ error: 'invalid_token', message: '유효하지 않은 초대 링크입니다.' });
  if (invite.status === 'used')
    return res.status(400).json({ error: 'token_used', message: '이미 사용된 초대 링크입니다. 관리자에게 새 초대장을 요청하세요.' });
  if (invite.status === 'cancelled')
    return res.status(400).json({ error: 'token_cancelled', message: '취소된 초대 링크입니다.' });

  // 신규 사용자 생성 (pending)
  const newUserId = userId || crypto.randomUUID();
  const newUser = {
    id:           newUserId,
    name:         name.trim(),
    status:       'pending',
    registeredAt: new Date().toISOString(),
    approvedAt:   null,
    inviteToken:  inviteToken,
  };
  store.users.push(newUser);

  // ★ 초대 토큰 즉시 만료 처리 (핵심 보안)
  invite.status    = 'used';
  invite.usedBy    = newUserId;
  invite.usedByName = newUser.name;
  invite.usedAt    = new Date().toISOString();

  await saveToFile();
  console.log(`✅ 신규 사용자 등록: ${newUser.name} (토큰 ${inviteToken} 만료)`);
  res.json({ ok: true, user: newUser });
});

// 사용자 상태 확인
app.get('/api/user/:id/status', (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user });
});

// ════════════════════════════════════════════════════
// 관리자 PIN 강제 재설정
// ════════════════════════════════════════════════════
app.post('/api/admin/users/:id/reset-pin', requireAdmin, async (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });

  const { newPin } = req.body;
  if (!newPin || String(newPin).length < 4)
    return res.status(400).json({ error: 'pin_too_short', message: 'PIN은 4자리 이상이어야 합니다.' });

  user.pinHash      = hashPin(String(newPin));
  user.pinChangedAt = new Date().toISOString();
  await saveToFile();
  console.log(`✅ 관리자가 PIN 재설정: ${user.name} (@${user.username})`);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════
// 사용자 PIN 변경
// ════════════════════════════════════════════════════
app.post('/api/user/change-pin', async (req, res) => {
  const uid = req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const user = store.users.find(u => u.id === uid);
  if (!user) return res.status(404).json({ error: 'not_found' });

  const { currentPin, newPin } = req.body;
  if (!currentPin || !newPin)
    return res.status(400).json({ error: 'missing_fields', message: '현재 PIN과 새 PIN을 입력해주세요.' });
  if (user.pinHash !== hashPin(String(currentPin)))
    return res.status(400).json({ error: 'wrong_pin', message: '현재 PIN이 올바르지 않습니다.' });
  if (String(newPin).length < 4)
    return res.status(400).json({ error: 'pin_too_short', message: 'PIN은 4자리 이상이어야 합니다.' });

  user.pinHash      = hashPin(String(newPin));
  user.pinChangedAt = new Date().toISOString();
  await saveToFile();
  console.log(`✅ PIN 변경: ${user.name} (@${user.username})`);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════
// 데이터 동기화 API
// ════════════════════════════════════════════════════

app.get('/api/sync', requireAccess, (req, res) => {
  const pendingCount = store.users.filter(u => u.status === 'pending').length;
  const uid  = req.headers['x-user-id'];
  const user = uid ? store.users.find(u => u.id === uid) : null;
  const role = isAdmin(req) ? 'admin' : (user?.role || 'user');

  let filteredEvents = store.events;
  if (role === 'instructor') {
    filteredEvents = store.events.map(filterEventForInstructor).filter(Boolean);
  }

  res.json({
    events:               filteredEvents,
    categories:           store.categories,
    darkMode:             store.darkMode,
    pendingCount:         (isAdmin(req) || isSubAdmin(req)) ? pendingCount : 0,
    role,
    instructorAllowedCats: store.instructorAllowedCats || INSTRUCTOR_ALLOWED_CATS,
  });
});

app.post('/api/sync/events', requireAccess, async (req, res) => {
  const { events, action, changedEvent, detail } = req.body;

  if (isInstructor(req)) {
    const uid = req.headers['x-user-id'];
    const incoming = events || [];
    // 강사는 비허용 카테고리를 받지 못했으므로 서버에서 보호
    const allowedCats = store.instructorAllowedCats || INSTRUCTOR_ALLOWED_CATS;
    const adminOnly = store.events.filter(ev => !allowedCats.includes(ev.type));
    // 허용 카테고리 중 다른 강사 개인레슨은 수정 불가
    // createdById 없는 이벤트(마이그레이션된 구 데이터)는 본인 이벤트로 허용
    const isOthersPL = ev => ev.type === 'personallesson' && ev.createdById && ev.createdById !== uid;
    const othersPL = store.events.filter(isOthersPL);
    const incomingAllowed = incoming.filter(ev => allowedCats.includes(ev.type) && !isOthersPL(ev));
    store.events = [...adminOnly, ...othersPL, ...incomingAllowed.filter(ev => !othersPL.find(o => o.id === ev.id))];
  } else {
    store.events = events || [];
  }

  if (action && changedEvent) {
    const user     = req.currentUser;
    const userName = isAdmin(req) ? '관리자' : (user?.name || '알 수 없음');
    const userId   = isAdmin(req) ? 'admin'  : (user?.id || 'unknown');

    const logEntry = {
      id:         crypto.randomUUID(),
      userId,
      userName,
      action,
      eventId:    changedEvent.id    || '',
      eventTitle: changedEvent.title || '',
      eventDate:  changedEvent.date  || '',
      timestamp:  new Date().toISOString(),
      detail:     detail || '',
    };
    store.activityLog.unshift(logEntry);
    if (store.activityLog.length > 500)
      store.activityLog = store.activityLog.slice(0, 500);
  }

  await saveToFile();
  res.json({ ok: true });
});

app.post('/api/sync/settings', requireAccess, async (req, res) => {
  const { categories, darkMode } = req.body;
  if (categories !== undefined) {
    store.categories = categories;
    // 시스템 카테고리 보호 — 항상 존재, 이름 고정, system 플래그 유지
    SYSTEM_CAT_IDS.forEach(id => {
      const def = DEFAULT_CATS.find(c => c.id === id);
      if (!def) return;
      const existing = store.categories.find(c => c.id === id);
      if (!existing) {
        store.categories.unshift({ ...def });
      } else {
        existing.name   = def.name;
        existing.system = true;
      }
    });
  }
  if (darkMode !== undefined) store.darkMode = darkMode;
  await saveToFile();
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════
// 대한민국 공휴일 API 프록시 (Nager.Date — 무료, API키 불필요)
// ════════════════════════════════════════════════════
const _holidayCache = {};   // 연도별 캐시

// 날짜 → YYYY-MM-DD 문자열
function _dateFmt(d) {
  const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
  return `${y}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}

// 고정 공휴일 내장 목록 (API 실패 시 fallback)
function getBuiltinHolidays(year) {
  return [
    { date: `${year}-01-01`, name: '새해' },
    { date: `${year}-03-01`, name: '삼일절' },
    { date: `${year}-05-05`, name: '어린이날' },
    { date: `${year}-06-06`, name: '현충일' },
    { date: `${year}-08-15`, name: '광복절' },
    { date: `${year}-10-03`, name: '개천절' },
    { date: `${year}-10-09`, name: '한글날' },
    { date: `${year}-12-25`, name: '성탄절' },
  ];
}

/**
 * 대체공휴일 계산 (2023년 개정법 기준)
 * - 성탄절 제외한 모든 공휴일이 토·일 → 다음 평일이 대체공휴일
 * - 이미 대체공휴일로 표기된 항목은 중복 추가 안 함
 */
function addSubstituteHolidays(holidays) {
  // 성탄절 대체공휴일 미적용 날짜들
  const XMAS_DATES = new Set(
    Array.from({length:21},(_,i)=>`${2020+i}-12-25`)
  );

  const knownDates = new Set(holidays.map(h => h.date));
  const subs = [];

  holidays.forEach(h => {
    // 이미 대체공휴일이면 스킵
    if (h.name.includes('대체')) return;
    // 성탄절 대체공휴일 미적용
    if (XMAS_DATES.has(h.date)) return;

    const d   = new Date(h.date);
    const dow = d.getDay(); // 0=일, 6=토
    if (dow !== 0 && dow !== 6) return;

    // 토요일이면 +2, 일요일이면 +1 → 월요일부터 탐색
    const start = new Date(h.date);
    start.setDate(start.getDate() + (dow === 6 ? 2 : 1));

    // 이미 공휴일·대체공휴일인 날이면 하루씩 더 이동
    let candidate = new Date(start);
    while (knownDates.has(_dateFmt(candidate)) || candidate.getDay() === 0) {
      candidate.setDate(candidate.getDate() + 1);
    }

    const subDate = _dateFmt(candidate);
    if (!knownDates.has(subDate)) {
      subs.push({ date: subDate, name: `${h.name} 대체공휴일` });
      knownDates.add(subDate);
    }
  });

  return [...holidays, ...subs].sort((a, b) => a.date.localeCompare(b.date));
}

app.get('/api/holidays/:year', async (req, res) => {
  const year = parseInt(req.params.year);
  if (isNaN(year) || year < 2020 || year > 2040)
    return res.status(400).json({ error: 'invalid_year' });

  if (_holidayCache[year])
    return res.json({ holidays: _holidayCache[year], source: 'cache' });

  try {
    const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const raw  = await r.json();
    const base = raw.map(h => ({ date: h.date, name: h.localName || h.name }));
    // 대체공휴일이 API에 포함 안 된 경우를 대비해 자체 계산 후 병합
    const list = addSubstituteHolidays(base);
    _holidayCache[year] = list;
    console.log(`📅 공휴일 로드: ${year}년 ${list.length}건 (API)`);
    res.json({ holidays: list, source: 'api' });
  } catch (e) {
    console.warn(`⚠️ 공휴일 API 실패 (${year}): ${e.message} → 내장 목록 사용`);
    const base = getBuiltinHolidays(year);
    const list = addSubstituteHolidays(base);
    _holidayCache[year] = list;
    console.log(`📅 공휴일 내장: ${year}년 ${list.length}건 (대체공휴일 포함)`);
    res.json({ holidays: list, source: 'builtin' });
  }
});

// ════════════════════════════════════════════════════
// 헬스 체크 / 백업·복원 API
// ════════════════════════════════════════════════════

// 서버 상태 확인 (누구나 접근 가능)
// 앱 버전 — 배포마다 자동으로 바뀜(Vercel 커밋 SHA). 클라이언트가 새 배포 감지 후 자동 새로고침
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.VERCEL_DEPLOYMENT_ID
  || String(Date.now());
app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: APP_VERSION });
});

app.get('/api/health', async (req, res) => {
  const info = {
    status:     'ok',
    storage:    (USE_DB && pool) ? 'postgresql' : (USE_DB ? 'file(/tmp) [DB fallback]' : 'file(/tmp)'),
    persistent: !!(USE_DB && pool),
    events:     store.events.length,
    users:      store.users.length,
    timestamp:  new Date().toISOString(),
    dbUrlSet:   USE_DB,
    poolActive: !!pool,
  };
  if (USE_DB && pool) {
    try {
      await pool.query('SELECT 1');
      info.db = 'connected';
    } catch (e) {
      info.db      = 'error';
      info.dbError = e.message;
      info.status  = 'degraded';
    }
  } else if (USE_DB && !pool) {
    info.db     = 'fallback_file';
    info.dbNote = 'DB 연결 실패로 파일 모드 전환됨 — /api/db-reconnect 로 재연결 시도 가능';
    info.status = 'degraded';
  }
  res.json(info);
});

// DB 재연결 시도 (관리자 전용)
app.post('/api/db-reconnect', requireAdmin, async (req, res) => {
  if (!USE_DB) return res.json({ ok: false, message: 'DATABASE_URL이 설정되지 않음' });
  try {
    const { Pool } = require('pg');
    const newPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    await newPool.query('SELECT 1');
    pool = newPool;
    attachPoolErrorHandler();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    console.log('✅ DB 재연결 성공 (관리자 요청)');
    // 재연결 후 데이터 동기화
    try {
      const result = await pool.query('SELECT data FROM jstudio_store WHERE id = 1');
      if (result.rows.length > 0) {
        const saved = result.rows[0].data;
        // 현재 메모리 데이터가 더 최신이므로 DB에 덮어씀
        await pool.query(
          'INSERT INTO jstudio_store (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
          [JSON.stringify(store)]
        );
        console.log('✅ 현재 데이터 DB에 동기화 완료');
      } else {
        await pool.query('INSERT INTO jstudio_store (id, data) VALUES (1, $1)', [JSON.stringify(store)]);
        console.log('✅ DB 최초 초기화 완료');
      }
    } catch (syncErr) {
      console.error('DB 동기화 오류:', syncErr.message);
    }
    res.json({ ok: true, message: 'DB 재연결 및 동기화 성공' });
  } catch (e) {
    console.error('DB 재연결 실패:', e.message);
    res.json({ ok: false, message: e.message });
  }
});

// 데이터 전체 백업 (JSON 다운로드) — 관리자 전용
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  const dateStr = new Date().toISOString().slice(0, 10);
  const backup  = {
    exportedAt: new Date().toISOString(),
    storage:    USE_DB ? 'postgresql' : 'file(/tmp)',
    version:    1,
    data: {
      events:      store.events,
      users:       store.users.map(u => ({ ...u, pinHash: undefined })), // PIN 해시 제외
      categories:  store.categories,
      activityLog: store.activityLog,
      invites:     store.invites,
      darkMode:    store.darkMode,
      inviteRequired: store.inviteRequired,
    },
  };
  res.setHeader('Content-Disposition', `attachment; filename="jstudio-backup-${dateStr}.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(backup);
});

// 데이터 복원 (JSON 업로드) — 관리자 전용
app.post('/api/admin/restore', requireAdmin, (req, res) => {
  const { data, mode } = req.body;   // mode: 'merge' | 'replace'
  if (!data) return res.status(400).json({ error: 'no_data', message: '복원할 데이터가 없습니다.' });

  const restoreMode = mode === 'replace' ? 'replace' : 'merge';
  const stats = { events: 0, users: 0 };

  if (restoreMode === 'replace') {
    if (data.events)    { store.events     = data.events;     stats.events = data.events.length; }
    if (data.categories)  store.categories = data.categories;
    if (data.darkMode !== undefined) store.darkMode = data.darkMode;
    if (data.inviteRequired !== undefined) store.inviteRequired = data.inviteRequired;
  }

  // 이벤트 머지 (중복 ID 제외)
  if (data.events && restoreMode === 'merge') {
    const existingIds = new Set(store.events.map(e => e.id));
    const newEvs = data.events.filter(e => !existingIds.has(e.id));
    store.events = [...store.events, ...newEvs];
    stats.events = newEvs.length;
  }

  // 사용자 복원 (pinHash 포함 — 비밀번호 그대로 유지됨)
  if (Array.isArray(data.users) && data.users.length > 0) {
    const existingIds = new Set(store.users.map(u => u.id));
    const newUsers = data.users.filter(u => !existingIds.has(u.id));
    store.users = [...store.users, ...newUsers];
    stats.users = newUsers.length;
    if (restoreMode === 'replace') {
      // replace 모드에서도 기존 관리자 계정은 유지하고 나머지 교체
      const adminUsers = store.users.filter(u => u.role === 'admin');
      const nonAdminBackup = data.users.filter(u => u.role !== 'admin');
      store.users = [...adminUsers, ...nonAdminBackup];
      stats.users = nonAdminBackup.length;
    }
  }

  saveToFile();
  console.log(`✅ 데이터 복원 완료 (${restoreMode}): 일정 +${stats.events}건, 사용자 +${stats.users}명`);
  res.json({ ok: true, mode: restoreMode, restored: stats });
});

// ════════════════════════════════════════════════════
// 인센티브 기본값 API
// ════════════════════════════════════════════════════

// 인센티브 기본값 조회 (승인된 사용자 이상)
app.get('/api/admin/incentive-defaults', requireAccess, (req, res) => {
  res.json({ ok: true, defaults: store.incentiveDefaults });
});

// 인센티브 기본값 변경 (관리자 전용)
app.post('/api/admin/incentive-defaults', requireAdmin, async (req, res) => {
  const { trialAmount, consultRate } = req.body;
  if (!store.incentiveDefaults) store.incentiveDefaults = { trialAmount: 10000, consultRate: 5 };
  if (trialAmount !== undefined) {
    const amt = Number(trialAmount);
    if (!isNaN(amt) && amt >= 0) store.incentiveDefaults.trialAmount = Math.round(amt);
  }
  if (consultRate !== undefined) {
    const rate = Number(consultRate);
    if (!isNaN(rate) && rate >= 0 && rate <= 100) store.incentiveDefaults.consultRate = rate;
  }
  await saveToFile();
  console.log(`✅ 인센티브 기본값 업데이트: 체험 ${store.incentiveDefaults.trialAmount}원, 상담 ${store.incentiveDefaults.consultRate}%`);
  res.json({ ok: true, defaults: store.incentiveDefaults });
});

// ── manifest.json ──────────────────────────────────
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// ── J.SMS 메시지 발송센터 라우트 (/api/sms/*, /s/:code) ──
const { registerSmsRoutes } = require('./sms-api');
registerSmsRoutes(app, {
  getPool:    () => pool,
  isAdmin,
  isSubAdmin,
});

app.get('*', (req, res) => {
  // index.html은 절대 stale 캐시를 쓰지 않도록 항상 재검증 (구버전 캐시 문제 근본 차단)
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── 서버 시작 ────────────────────────────────────────
async function startServer() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 제이스튜디오 캘린더 서버 시작 중...');
  console.log(`   NODE_ENV    : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DATABASE_URL: ${USE_DB ? '✅ 설정됨 (PostgreSQL)' : '❌ 없음 (/tmp 파일 모드)'}`);

  await ensureStore();   // DB or 파일에서 데이터 로드 (지연 초기화와 공유)

  app.listen(PORT, '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 제이스튜디오 캘린더 → http://0.0.0.0:${PORT}`);
    console.log(`   저장소 : ${(USE_DB && pool) ? '🐘 PostgreSQL (영구 저장)' : '📁 /tmp 파일 (⚠️ 임시)'}`);
    console.log(`   관리자 : @${DEFAULT_ADMIN_USERNAME}`);
    console.log(`   헬스체크: /api/health`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

// Vercel: app을 export (서버리스 핸들러로 사용)
// Railway/로컬: 직접 listen
module.exports = app;
if (!IS_VERCEL) {
  startServer().catch(e => { console.error('❌ 서버 시작 실패:', e); process.exit(1); });
}
