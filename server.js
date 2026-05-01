const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const app      = express();
const PORT     = process.env.PORT || 8080;

// ── PostgreSQL 연결 (DATABASE_URL 있을 때만) ────────
const USE_DB = !!process.env.DATABASE_URL;
let pool = null;
if (USE_DB) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  const maskedUrl = process.env.DATABASE_URL.replace(/\/\/[^@]+@/, '//****@');
  console.log('🐘 PostgreSQL 모드 활성화');
  console.log(`   DB URL: ${maskedUrl}`);
} else {
  console.log('📁 파일 저장 모드 (DATABASE_URL 없음)');
  console.log('⚠️  /tmp 파일은 배포 시마다 초기화됩니다 — 데이터가 영구 보존되지 않습니다!');
  console.log('⚠️  영구 저장을 위해 Railway에서 DATABASE_URL 환경변수를 설정하세요.');
}

app.use(express.json({ limit: '10mb' }));

// ── 상수 ───────────────────────────────────────────
const DATA_FILE = '/tmp/jstudio_data.json';
const ADMIN_PW  = process.env.ADMIN_PASSWORD || 'jstudio2024';

const DEFAULT_CATS = [
  { id: 'noshow', name: '노쇼',    color: '#e03050' },
  { id: 'makeup', name: '보강',    color: '#1a8fc7' },
  { id: 'info',   name: '중요정보', color: '#c88a00' },
  { id: 'other',  name: '기타',    color: '#2e9e4f' },
];

// ── 데이터 저장소 ───────────────────────────────────
let store = {
  inviteRequired: false,   // true = 초대장 없이 접근 불가
  invites:        [],      // 일회용 초대 토큰 배열
  users:          [],      // 등록된 사용자
  events:         [],      // 일정
  activityLog:    [],      // 활동 기록
  categories:     DEFAULT_CATS,
  darkMode:       false,
};

// ── DB 초기화 및 데이터 로드 (서버 시작 시 1회) ─────
async function initStore() {
  if (USE_DB) {
    // ── PostgreSQL ──
    // 연결 테스트
    try {
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL 연결 성공');
    } catch (connErr) {
      console.error('❌ PostgreSQL 연결 실패:', connErr.message);
      console.error('   DATABASE_URL이 올바른지 확인하세요.');
      throw connErr;
    }

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
      console.log(`✅ DB 로드 완료: 일정 ${store.events.length}건 | 사용자 ${store.users.length}명`);
    } else {
      await pool.query('INSERT INTO jstudio_store (id, data) VALUES (1, $1)', [JSON.stringify(store)]);
      console.log('✅ DB 최초 초기화 완료 (새 데이터베이스)');
    }
  } else {
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

// ── 저장 (fire-and-forget) ──────────────────────────
function saveToFile() {
  if (USE_DB) {
    pool.query(
      'INSERT INTO jstudio_store (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      [JSON.stringify(store)]
    ).then(() => {
      // 저장 성공 (필요 시 로깅: console.log('💾 DB 저장 완료');)
    }).catch(e => {
      console.error('❌ DB 저장 실패:', e.message);
      // 비상 파일 백업 시도
      try {
        fs.writeFileSync(DATA_FILE + '.emergency', JSON.stringify(store), 'utf8');
        console.log('📁 비상 파일 백업 저장됨');
      } catch (_) {}
    });
  } else {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8'); }
    catch (e) { console.error('파일 저장 실패:', e.message); }
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
app.post('/api/auth/register', (req, res) => {
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
  saveToFile();
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

// 사용자 승인
app.post('/api/admin/users/:id/approve', requireAdmin, (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.status     = 'approved';
  user.approvedAt = new Date().toISOString();
  saveToFile();
  res.json({ ok: true, user });
});

// 사용자 거절
app.post('/api/admin/users/:id/reject', requireAdmin, (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.status     = 'rejected';
  user.rejectedAt = new Date().toISOString();
  saveToFile();
  res.json({ ok: true, user });
});

// 사용자 삭제
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const idx = store.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  store.users.splice(idx, 1);
  saveToFile();
  res.json({ ok: true });
});

// 관리자 권한 부여 (관리자 이상)
app.post('/api/admin/users/:id/grant-admin', requireAdmin, (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  if (user.status !== 'approved')
    return res.status(400).json({ error: 'not_approved', message: '승인된 사용자에게만 관리자 권한을 부여할 수 있습니다.' });
  user.role = 'admin';
  saveToFile();
  console.log(`✅ 관리자 권한 부여: ${user.name} (@${user.username})`);
  res.json({ ok: true, user });
});

// 관리자 권한 해제 (관리자 이상)
app.post('/api/admin/users/:id/revoke-admin', requireAdmin, (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.role = 'user';
  saveToFile();
  console.log(`✅ 관리자 권한 해제: ${user.name} (@${user.username})`);
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
app.post('/api/admin/invites/generate', requireAdmin, (req, res) => {
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
  saveToFile();
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
app.delete('/api/admin/invites/:token', requireAdmin, (req, res) => {
  const invite = store.invites.find(i => i.token === req.params.token);
  if (!invite) return res.status(404).json({ error: 'not_found' });
  if (invite.status !== 'active') return res.status(400).json({ error: 'already_done' });
  invite.status = 'cancelled';
  saveToFile();
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
app.post('/api/invite/register', (req, res) => {
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

  saveToFile();
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
// 사용자 PIN 변경
// ════════════════════════════════════════════════════
app.post('/api/user/change-pin', (req, res) => {
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
  saveToFile();
  console.log(`✅ PIN 변경: ${user.name} (@${user.username})`);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════
// 데이터 동기화 API
// ════════════════════════════════════════════════════

app.get('/api/sync', requireAccess, (req, res) => {
  const pendingCount = store.users.filter(u => u.status === 'pending').length;
  res.json({
    events:       store.events,
    categories:   store.categories,
    darkMode:     store.darkMode,
    pendingCount: (isAdmin(req) || isSubAdmin(req)) ? pendingCount : 0,
  });
});

app.post('/api/sync/events', requireAccess, (req, res) => {
  const { events, action, changedEvent, detail } = req.body;
  store.events = events || [];

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

  saveToFile();
  res.json({ ok: true });
});

app.post('/api/sync/settings', requireAccess, (req, res) => {
  const { categories, darkMode } = req.body;
  if (categories !== undefined) store.categories = categories;
  if (darkMode   !== undefined) store.darkMode   = darkMode;
  saveToFile();
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════
// 헬스 체크 / 백업·복원 API
// ════════════════════════════════════════════════════

// 서버 상태 확인 (누구나 접근 가능)
app.get('/api/health', async (req, res) => {
  const info = {
    status:    'ok',
    storage:   USE_DB ? 'postgresql' : 'file(/tmp)',
    persistent: USE_DB,
    events:    store.events.length,
    users:     store.users.length,
    timestamp: new Date().toISOString(),
  };
  if (USE_DB) {
    try {
      await pool.query('SELECT 1');
      info.db = 'connected';
    } catch (e) {
      info.db      = 'error';
      info.dbError = e.message;
      info.status  = 'degraded';
    }
  }
  res.json(info);
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
    // 전체 교체 (기존 데이터 덮어쓰기)
    if (data.events)      { store.events      = data.events;      stats.events = data.events.length; }
    if (data.categories)    store.categories  = data.categories;
    if (data.darkMode !== undefined) store.darkMode = data.darkMode;
    if (data.inviteRequired !== undefined) store.inviteRequired = data.inviteRequired;
    // 사용자는 pinHash가 없으므로 머지만 가능 (아래 머지 로직 재사용)
  }

  // 이벤트 머지 (중복 ID 제외)
  if (data.events && restoreMode === 'merge') {
    const existingIds = new Set(store.events.map(e => e.id));
    const newEvs = data.events.filter(e => !existingIds.has(e.id));
    store.events = [...store.events, ...newEvs];
    stats.events = newEvs.length;
  }

  saveToFile();
  console.log(`✅ 데이터 복원 완료 (${restoreMode}): 일정 +${stats.events}건`);
  res.json({ ok: true, mode: restoreMode, restored: stats });
});

// ── manifest.json ──────────────────────────────────
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// ── 정적 파일 ──────────────────────────────────────
app.use(express.static(__dirname, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js'))
      res.setHeader('Content-Type', 'application/javascript');
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── 서버 시작 ────────────────────────────────────────
async function startServer() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 제이스튜디오 캘린더 서버 시작 중...');
  console.log(`   NODE_ENV    : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DATABASE_URL: ${USE_DB ? '✅ 설정됨 (PostgreSQL)' : '❌ 없음 (/tmp 파일 모드)'}`);

  await initStore();          // DB or 파일에서 데이터 로드
  ensureDefaultAdmin();       // 관리자 계정 없으면 자동 생성

  app.listen(PORT, '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 제이스튜디오 캘린더 → http://0.0.0.0:${PORT}`);
    console.log(`   저장소 : ${USE_DB ? '🐘 PostgreSQL (영구 저장)' : '📁 /tmp 파일 (⚠️ 임시 — 배포 시 삭제됨)'}`);
    console.log(`   관리자 : @${DEFAULT_ADMIN_USERNAME}`);
    console.log(`   헬스체크: /api/health`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}
startServer().catch(e => { console.error('❌ 서버 시작 실패:', e); process.exit(1); });
