const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const app      = express();
const PORT     = process.env.PORT || 8080;

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

try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    store = { ...store, ...saved };
    if (!store.users)       store.users       = [];
    if (!store.activityLog) store.activityLog = [];
    if (!store.invites)     store.invites     = [];
    console.log(`✅ 로드: 일정 ${store.events.length}건 | 사용자 ${store.users.length}명 | 초대장 ${store.invites.length}개`);
  }
} catch (e) {
  console.log('⚠️ 저장 파일 없음, 기본값 사용');
}

function saveToFile() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8'); }
  catch (e) { console.error('저장 실패:', e.message); }
}

// ── 일회용 토큰 생성 ────────────────────────────────
// 혼동되기 쉬운 문자(0,O,1,I,L) 제외한 8자리 랜덤 코드
function generateToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let token;
  do {
    token = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (store.invites.find(i => i.token === token)); // 중복 방지
  return token;
}

// ── 인증 헬퍼 ──────────────────────────────────────
function isAdmin(req) {
  return req.headers['x-admin-password'] === ADMIN_PW;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  next();
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
// 데이터 동기화 API
// ════════════════════════════════════════════════════

app.get('/api/sync', requireAccess, (req, res) => {
  const pendingCount = store.users.filter(u => u.status === 'pending').length;
  res.json({
    events:       store.events,
    categories:   store.categories,
    darkMode:     store.darkMode,
    pendingCount: isAdmin(req) ? pendingCount : 0,
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
  console.log(`   관리자 비밀번호: ${ADMIN_PW}`);
  const activeInvites = store.invites.filter(i => i.status === 'active').length;
  console.log(`   활성 초대장: ${activeInvites}개`);
});
