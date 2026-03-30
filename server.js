const express = require('express');
const path    = require('path');
const fs      = require('fs');
const app     = express();
const PORT    = process.env.PORT || 8080;

app.use(express.json({ limit: '10mb' }));

// ── 데이터 저장소 ───────────────────────────────────
const DATA_FILE = '/tmp/jstudio_data.json';

const DEFAULT_CATS = [
  { id: 'noshow', name: '노쇼',    color: '#e03050' },
  { id: 'makeup', name: '보강',    color: '#1a8fc7' },
  { id: 'info',   name: '중요정보', color: '#c88a00' },
  { id: 'other',  name: '기타',    color: '#2e9e4f' },
];

let store = {
  inviteCode: '',       // 빈 문자열 = 제한 없음
  events:     [],
  categories: DEFAULT_CATS,
  darkMode:   false,
};

// 서버 시작 시 파일에서 로드
try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    store = { ...store, ...saved };
    console.log(`✅ 데이터 로드: 일정 ${store.events.length}건`);
  }
} catch (e) {
  console.log('⚠️ 저장 파일 없음, 기본값 사용');
}

function saveToFile() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8'); }
  catch (e) { console.error('파일 저장 실패:', e.message); }
}

// ── 초대코드 검사 미들웨어 ──────────────────────────
function checkInvite(req, res, next) {
  if (!store.inviteCode) return next(); // 초대코드 없음 = 누구나 접근
  const code = req.headers['x-invite-code'];
  if (code !== store.inviteCode) {
    return res.status(401).json({ error: 'invalid_invite_code' });
  }
  next();
}

// ── PWA 헤더 ───────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ── API: 초대코드 검증 (인증 없이 접근 가능) ────────
app.post('/api/invite/verify', (req, res) => {
  const { code } = req.body;
  if (!store.inviteCode || code === store.inviteCode) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});

// API: 초대코드 필요 여부 확인
app.get('/api/invite/status', (req, res) => {
  res.json({ required: !!store.inviteCode });
});

// ── API: 데이터 동기화 ─────────────────────────────
// GET: 전체 데이터 가져오기
app.get('/api/sync', checkInvite, (req, res) => {
  res.json({
    events:     store.events,
    categories: store.categories,
    darkMode:   store.darkMode,
    inviteCode: store.inviteCode,  // 관리자에게 표시용
  });
});

// POST: 일정 저장
app.post('/api/sync/events', checkInvite, (req, res) => {
  store.events = req.body.events || [];
  saveToFile();
  res.json({ ok: true, count: store.events.length });
});

// POST: 설정 저장 (카테고리, 다크모드, 초대코드)
app.post('/api/sync/settings', checkInvite, (req, res) => {
  const { categories, darkMode, inviteCode } = req.body;
  if (categories  !== undefined) store.categories  = categories;
  if (darkMode    !== undefined) store.darkMode    = darkMode;
  if (inviteCode  !== undefined) store.inviteCode  = inviteCode;
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
});
