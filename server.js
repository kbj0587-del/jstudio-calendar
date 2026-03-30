const express = require('express');
const path    = require('path');
const fs      = require('fs');
const app     = express();
const PORT    = process.env.PORT || 8080;

app.use(express.json({ limit: '10mb' }));

// ── 데이터 저장소 ───────────────────────────────────
const DATA_FILE   = '/tmp/jstudio_data.json';
const ADMIN_PW    = process.env.ADMIN_PASSWORD || 'jstudio2024';

const DEFAULT_CATS = [
  { id: 'noshow', name: '노쇼',    color: '#e03050' },
  { id: 'makeup', name: '보강',    color: '#1a8fc7' },
  { id: 'info',   name: '중요정보', color: '#c88a00' },
  { id: 'other',  name: '기타',    color: '#2e9e4f' },
];

let store = {
  inviteCode:  '',
  users:       [],
  events:      [],
  activityLog: [],
  categories:  DEFAULT_CATS,
  darkMode:    false,
};

// 서버 시작 시 파일에서 로드
try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    store = { ...store, ...saved };
    if (!store.users)       store.users       = [];
    if (!store.activityLog) store.activityLog = [];
    console.log(`✅ 데이터 로드: 일정 ${store.events.length}건, 사용자 ${store.users.length}명`);
  }
} catch (e) {
  console.log('⚠️ 저장 파일 없음, 기본값 사용');
}

function saveToFile() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8'); }
  catch (e) { console.error('파일 저장 실패:', e.message); }
}

// ── 인증 미들웨어 ──────────────────────────────────

// 관리자 인증: x-admin-password 헤더 확인
function isAdmin(req) {
  return req.headers['x-admin-password'] === ADMIN_PW;
}

// 일반 사용자 인증: x-user-id → store.users에서 approved 확인
function getApprovedUser(req) {
  const uid = req.headers['x-user-id'];
  if (!uid) return null;
  return store.users.find(u => u.id === uid && u.status === 'approved') || null;
}

// API 접근 미들웨어: 관리자 OR 승인된 사용자 OR (초대코드 없으면 누구나)
function requireAccess(req, res, next) {
  if (isAdmin(req)) return next();

  // 초대코드 없으면 누구나 접근 가능 (기존 방식)
  if (!store.inviteCode) {
    // 사용자 ID가 있으면 상태 체크
    const uid = req.headers['x-user-id'];
    if (uid) {
      const user = store.users.find(u => u.id === uid);
      if (user) {
        if (user.status === 'pending')  return res.status(403).json({ error: 'pending',  message: '관리자 승인 대기 중입니다.' });
        if (user.status === 'rejected') return res.status(403).json({ error: 'rejected', message: '접근이 거절되었습니다.' });
      }
    }
    return next();
  }

  // 초대코드 있는 경우: 승인된 사용자만
  const uid = req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ error: 'needsRegistration', message: '등록이 필요합니다.' });

  const user = store.users.find(u => u.id === uid);
  if (!user)                   return res.status(401).json({ error: 'needsRegistration', message: '등록이 필요합니다.' });
  if (user.status === 'pending')  return res.status(403).json({ error: 'pending',  message: '관리자 승인 대기 중입니다.' });
  if (user.status === 'rejected') return res.status(403).json({ error: 'rejected', message: '접근이 거절되었습니다.' });
  if (user.status === 'approved') return next();

  return res.status(401).json({ error: 'needsRegistration' });
}

// 관리자 전용 미들웨어
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  next();
}

// ── PWA 헤더 ───────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ── 관리자 API ─────────────────────────────────────

// 관리자 인증 확인
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PW) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'invalid_password' });
  }
});

// 모든 사용자 목록
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

// 활동 기록 (최신 200건)
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const logs = [...store.activityLog]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 200);
  res.json({ logs });
});

// ── 초대 / 사용자 등록 API ──────────────────────────

// 이름 + 초대코드로 사용자 등록 → pending 상태
app.post('/api/invite/register', (req, res) => {
  const { name, code, userId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required' });

  // 초대코드 검증 (설정된 경우)
  if (store.inviteCode && code !== store.inviteCode) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  // 이미 등록된 userId면 기존 상태 반환
  if (userId) {
    const existing = store.users.find(u => u.id === userId);
    if (existing) return res.json({ ok: true, user: existing });
  }

  const newUser = {
    id:           userId || crypto.randomUUID(),
    name:         name.trim(),
    status:       'pending',
    registeredAt: new Date().toISOString(),
    approvedAt:   null,
  };

  // 초대코드 없으면 바로 승인
  if (!store.inviteCode) {
    newUser.status     = 'approved';
    newUser.approvedAt = new Date().toISOString();
  }

  store.users.push(newUser);
  saveToFile();
  res.json({ ok: true, user: newUser });
});

// 사용자 상태 확인
app.get('/api/user/:id/status', (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user });
});

// 초대코드 검증 (기존 호환)
app.post('/api/invite/verify', (req, res) => {
  const { code } = req.body;
  if (!store.inviteCode || code === store.inviteCode) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});

// 초대코드 필요 여부 확인
app.get('/api/invite/status', (req, res) => {
  res.json({ required: !!store.inviteCode });
});

// ── 데이터 동기화 API ──────────────────────────────

// GET: 전체 데이터 가져오기
app.get('/api/sync', requireAccess, (req, res) => {
  const pendingCount = store.users.filter(u => u.status === 'pending').length;
  res.json({
    events:       store.events,
    categories:   store.categories,
    darkMode:     store.darkMode,
    inviteCode:   store.inviteCode,
    pendingCount: isAdmin(req) ? pendingCount : 0,
  });
});

// POST: 일정 저장 + 활동 로그
app.post('/api/sync/events', requireAccess, (req, res) => {
  const { events, action, changedEvent, detail } = req.body;
  store.events = events || [];

  // 활동 로그 기록
  if (action && changedEvent) {
    const uid  = req.headers['x-user-id'];
    const user = uid ? store.users.find(u => u.id === uid) : null;
    const userName = isAdmin(req) ? '관리자' : (user?.name || '알 수 없음');
    const userId   = isAdmin(req) ? 'admin'  : (uid || 'unknown');

    const logEntry = {
      id:         crypto.randomUUID(),
      userId,
      userName,
      action,
      eventId:    changedEvent.id   || '',
      eventTitle: changedEvent.title || '',
      eventDate:  changedEvent.date  || '',
      timestamp:  new Date().toISOString(),
      detail:     detail || '',
    };
    store.activityLog.unshift(logEntry);
    // 로그 최대 500건 유지
    if (store.activityLog.length > 500) store.activityLog = store.activityLog.slice(0, 500);
  }

  saveToFile();
  res.json({ ok: true, count: store.events.length });
});

// POST: 설정 저장 (inviteCode 변경은 관리자만)
app.post('/api/sync/settings', requireAccess, (req, res) => {
  const { categories, darkMode, inviteCode } = req.body;
  if (categories !== undefined) store.categories = categories;
  if (darkMode   !== undefined) store.darkMode   = darkMode;
  if (inviteCode !== undefined && isAdmin(req)) store.inviteCode = inviteCode;
  saveToFile();
  res.json({ ok: true });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 제이스튜디오 캘린더 → port ${PORT}`);
  console.log(`   초대코드: ${store.inviteCode || '(없음 - 누구나 접근)'}`);
  console.log(`   관리자 비밀번호: ${ADMIN_PW}`);
});
