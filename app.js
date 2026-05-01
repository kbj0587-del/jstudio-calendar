/* ═══════════════════════════════════════════════
   센터 캘린더 v4 – app.js
   ═══════════════════════════════════════════════ */

// ── 상수 ──────────────────────────────────────────
const DEFAULT_CATS = [
  { id: 'noshow',  name: '노쇼',    color: '#e03050' },
  { id: 'makeup',  name: '보강',    color: '#1a8fc7' },
  { id: 'info',    name: '중요정보', color: '#c88a00' },
  { id: 'other',   name: '기타',    color: '#2e9e4f' },
];

const PALETTE_COLORS = [
  '#e03050','#ff6b00','#c88a00','#2e9e4f',
  '#1a8fc7','#3b7af0','#7c3aed','#be185d',
  '#000000','#555555','#999999','#ffffff',
];

const EMOJI_LIST = [
  '😊','👍','⚠️','📌','📞','🏫','✅','❌','🔔','💡',
  '📝','🗓️','🎯','💪','🙏','😅','😤','🤔','❓','‼️',
  '🔴','🟡','🟢','🔵','⭐','🔥','💬','📢','🚫','✔️',
];

// ── 사용자 인증 상태 ───────────────────────────────
let currentView  = 'calendar'; // 'calendar' | 'list'
let currentUser  = null;   // { id, name }
let isAdminMode  = false;  // 마스터 관리자 모드 여부
let isSubAdmin   = false;  // 서브 관리자 (사용자이지만 관리자 권한 부여됨)
let adminPw      = '';     // 관리자 비밀번호
let pendingBadge = 0;      // 대기 중 사용자 수

// ── 동기화 상태 ───────────────────────────────────
let storedInviteCode = ''; // 하위 호환 — 실제로 사용 안 함
let syncEnabled      = false;
let syncTimer        = null;

function setSyncStatus(state, text) {
  const dot  = document.getElementById('headerSyncDot');
  const sdot = document.getElementById('syncDot');
  const stxt = document.getElementById('syncStatusText');
  if (dot)  { dot.className  = 'header-sync-dot ' + state; }
  if (sdot) { sdot.className = 'sync-dot ' + state; }
  if (stxt && text) stxt.textContent = text;
}

// ── 서버 API 헬퍼 ─────────────────────────────────
function buildHeaders(extra) {
  const h = { 'Content-Type': 'application/json' };
  if (isAdminMode && adminPw) {
    h['x-admin-password'] = adminPw;
  } else if (currentUser) {
    h['x-user-id'] = currentUser.id;
  }
  // 기존 초대코드 호환
  return Object.assign(h, extra || {});
}

async function apiGet(path) {
  const h = {};
  if (isAdminMode && adminPw) {
    h['x-admin-password'] = adminPw;
  } else if (currentUser) {
    h['x-user-id'] = currentUser.id;
  }
  return fetch(path, { headers: h });
}

async function apiPost(path, body) {
  return fetch(path, {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify(body),
  });
}

async function apiDelete(path) {
  return fetch(path, {
    method:  'DELETE',
    headers: buildHeaders(),
  });
}

// 관리자 API 헤더 빌더 (슈퍼 관리자 또는 서브 관리자 공용)
function adminHeaders() {
  if (isAdminMode && adminPw) return { 'x-admin-password': adminPw };
  if (isSubAdmin && currentUser) return { 'x-user-id': currentUser.id };
  return {};
}

// ── 상태 ──────────────────────────────────────────
let currentYear, currentMonth;
let miniCalYear   = 0;

let modalDate      = null;
let viewingEventId = null;
let editingEventId = null;
let formPrevView   = 'list';

let settingsUnlocked = false;
let settingsDraft    = null;
let savedSel         = null;

let events   = [];
let settings = {
  password:     '',
  lockDisabled: false,
  darkMode:     false,
  categories:   DEFAULT_CATS.map(c => ({ ...c })),
};

// ── 저장 / 로드 ───────────────────────────────────
function loadAll() {
  try { events = JSON.parse(localStorage.getItem('cc_events')) || []; } catch { events = []; }
  try {
    const s = JSON.parse(localStorage.getItem('cc_settings'));
    if (s) {
      settings = { ...settings, ...s };
      if (!settings.categories?.length) settings.categories = DEFAULT_CATS.map(c => ({ ...c }));
    }
  } catch {}
}
function saveEvents() {
  localStorage.setItem('cc_events', JSON.stringify(events));
  syncEventsToServer();
}
function saveSettings() { localStorage.setItem('cc_settings', JSON.stringify(settings)); }

// ── 테마 ──────────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

// ── 색상 헬퍼 ────────────────────────────────────
function getCat(id) {
  return settings.categories.find(c => c.id === id) || { name: id || '?', color: '#888' };
}
function hexToRgba(hex, a) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  const n = parseInt(hex, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// ── HTML 이스케이프 ──────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 날짜/시간 포맷 ────────────────────────────────
function formatShortDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mm}`;
}

// ═════════════════════════════════════════════════
// 초기화
// ═════════════════════════════════════════════════
async function init() {
  const now   = new Date();
  currentYear = now.getFullYear();
  currentMonth= now.getMonth();
  miniCalYear = currentYear;

  loadAll();
  applyTheme(settings.darkMode);

  // 사용자·관리자 정보 로드
  const savedUserId   = localStorage.getItem('cc_user_id')   || '';
  const savedUserName = localStorage.getItem('cc_user_name') || '';
  if (savedUserId) currentUser = { id: savedUserId, name: savedUserName };
  if (savedUserId && localStorage.getItem('cc_is_subadmin') === '1') isSubAdmin = true;
  adminPw = localStorage.getItem('cc_admin_pw') || '';
  if (adminPw) isAdminMode = true;

  // 이벤트 바인딩 (잠금 화면 버튼 작동에 필요)
  bindStaticEvents();
  setupRichEditor();

  // ── 자격증명 없으면 저장된 username/pin으로 자동 로그인 시도 ──
  if (!currentUser && !isAdminMode) {
    const savedUsername = localStorage.getItem('cc_username');
    const savedPin      = localStorage.getItem('cc_pin');
    const autoLogin     = localStorage.getItem('cc_autologin') === '1';
    if (savedUsername && savedPin && autoLogin) {
      // 저장된 자격증명으로 자동 로그인 시도 (로딩 중 표시)
      showAutoLoginScreen();
      try {
        const resp = await fetch('/api/auth/login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ username: savedUsername, pin: savedPin }),
        });
        hideAutoLoginScreen();
        if (resp.ok) {
          const data = await resp.json();
          localStorage.setItem('cc_user_id',   data.user.id);
          localStorage.setItem('cc_user_name', data.user.name);
          currentUser = { id: data.user.id, name: data.user.name };
          isSubAdmin = data.user.role === 'admin';
          if (isSubAdmin) localStorage.setItem('cc_is_subadmin', '1');
          else localStorage.removeItem('cc_is_subadmin');
          // 자동 로그인 성공 → 바로 진행
        } else if (resp.status === 403) {
          const d = await resp.json().catch(() => ({}));
          if (d.error === 'pending') { showPendingScreen(); return; }
          if (d.error === 'rejected') { showRejectedScreen(); return; }
          showAuthScreen('login'); return;
        } else {
          // 자동 로그인 실패 → 수동 로그인
          showAuthScreen('login'); return;
        }
      } catch {
        hideAutoLoginScreen();
        showAuthScreen('login'); return;
      }
    } else {
      showAuthScreen('login');
      return;
    }
  }

  // ── 앱 잠금 비밀번호가 설정된 경우 ──
  if (settings.password && !settings.lockDisabled) {
    showAppLock();
    return;
  }

  await launchApp();
}

function showAutoLoginScreen() {
  let el = document.getElementById('autoLoginScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'autoLoginScreen';
    el.className = 'app-lock-screen';
    el.innerHTML = `
      <div class="app-lock-card" style="text-align:center;padding:40px 32px">
        <img src="./icons/icon-192.png" class="lock-logo" alt="J.STUDIO" />
        <h2 class="lock-title">제이스튜디오 캘린더</h2>
        <p class="lock-sub" style="margin-top:8px">로그인 중…</p>
        <div class="pending-spinner" style="margin-top:16px">⏳</div>
      </div>`;
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
}
function hideAutoLoginScreen() {
  document.getElementById('autoLoginScreen')?.classList.add('hidden');
}

// 앱이 다시 포그라운드로 올 때 자동 재동기화 (모바일 탭 전환 대응)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && syncEnabled) {
    refreshSync();
  }
});

// 화면 크기 변경 시 캘린더 재렌더 (PC↔모바일 표시 전환)
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (document.getElementById('appMain') &&
        !document.getElementById('appMain').classList.contains('hidden')) {
      renderCurrentView();
    }
  }, 200);
});

// 잠금 해제 또는 비밀번호 미설정 시 캘린더 렌더링 + 서버 동기화
async function launchApp() {
  document.getElementById('appMain').classList.remove('hidden');
  initView();
  applyView();

  setSyncStatus('syncing', '서버 연결 중…');
  try {
    const resp = await apiGet('/api/sync');

    if (resp.status === 401) {
      // 서버 재시작 등으로 사용자 정보 소실 → 저장된 자격증명으로 재로그인 시도
      const savedUsername = localStorage.getItem('cc_username');
      const savedPin      = localStorage.getItem('cc_pin');
      if (savedUsername && savedPin) {
        try {
          const relogin = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: savedUsername, pin: savedPin }),
          });
          if (relogin.ok) {
            const rdata = await relogin.json();
            localStorage.setItem('cc_user_id',   rdata.user.id);
            localStorage.setItem('cc_user_name', rdata.user.name);
            currentUser = { id: rdata.user.id, name: rdata.user.name };
            isSubAdmin = rdata.user.role === 'admin';
            if (isSubAdmin) localStorage.setItem('cc_is_subadmin', '1');
            else localStorage.removeItem('cc_is_subadmin');
            // 재시도
            const resp2 = await apiGet('/api/sync');
            if (resp2.ok) {
              const data2 = await resp2.json();
              syncEnabled = true;
              events = data2.events || [];
              settings.categories = data2.categories || settings.categories;
              settings.darkMode   = data2.darkMode   ?? settings.darkMode;
              localStorage.setItem('cc_events', JSON.stringify(events));
              saveSettings(); applyTheme(settings.darkMode);
              renderCurrentView();
              setSyncStatus('online', '✅ 동기화됨');
              return;
            }
          }
        } catch { /* 재로그인 실패 시 아래 로그아웃 처리 */ }
      }
      localStorage.removeItem('cc_user_id');
      localStorage.removeItem('cc_user_name');
      currentUser = null;
      document.getElementById('appMain').classList.add('hidden');
      setSyncStatus('error', '로그인 필요');
      showAuthScreen('login');
      return;
    }

    if (resp.status === 403) {
      const data = await resp.json().catch(() => ({}));
      if (data.error === 'pending') {
        setSyncStatus('error', '승인 대기 중');
        showPendingScreen();
        return;
      }
      if (data.error === 'rejected') {
        setSyncStatus('error', '접근 거절됨');
        showRejectedScreen();
        return;
      }
    }

    if (resp.ok) {
      const data = await resp.json();
      syncEnabled = true;

      events = data.events || [];
      settings.categories = data.categories || settings.categories;
      settings.darkMode   = data.darkMode   ?? settings.darkMode;

      if ((isAdminMode || isSubAdmin) && data.pendingCount > 0) {
        pendingBadge = data.pendingCount;
        updateAdminBadge();
      }

      saveEvents();
      saveSettings();
      applyTheme(settings.darkMode);
      renderCurrentView();
      setSyncStatus('online', '✅ 동기화됨 — 모든 기기에서 동일한 데이터');
    }
  } catch {
    syncEnabled = false;
    setSyncStatus('offline', '⚠️ 오프라인 — 로컬 데이터 사용 중');
  }
}

// ── 관리자 배지 ───────────────────────────────────
function updateAdminBadge() {
  const headerBtn = document.getElementById('btnAdminPanelOpen');
  const badge     = document.getElementById('adminBadge');
  const tabBadge  = document.getElementById('pendingBadgeTab');

  // 관리자 모드면 헤더 버튼 표시
  if (headerBtn) {
    if (isAdminMode || isSubAdmin) headerBtn.classList.remove('hidden');
    else headerBtn.classList.add('hidden');
  }

  // 배지 숫자
  [badge, tabBadge].forEach(el => {
    if (!el) return;
    if (pendingBadge > 0) {
      el.textContent = pendingBadge;
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
    }
  });
}

// ── 등록 화면 ─────────────────────────────────────
// ── 로그인/회원가입 화면 ───────────────────────────
async function submitAdminLogin() {
  const pw    = document.getElementById('adminLoginPwInput').value.trim();
  const errEl = document.getElementById('adminLoginError');
  const btn   = document.getElementById('btnAdminLoginSubmit');
  if (!pw) return;

  btn.disabled = true; btn.textContent = '확인 중…';
  try {
    const resp = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      localStorage.setItem('cc_admin_pw', pw);
      adminPw = pw;
      isAdminMode = true;
      document.getElementById('authScreen').classList.add('hidden');
      await launchApp();
    } else {
      errEl.classList.remove('hidden');
      document.getElementById('adminLoginPwInput').value = '';
      document.getElementById('adminLoginPwInput').focus();
    }
  } catch {
    errEl.textContent = '서버에 연결할 수 없습니다.';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false; btn.textContent = '관리자 로그인';
}

function showAuthScreen(tab) {
  document.getElementById('authScreen').classList.remove('hidden');
  if (tab === 'register') switchAuthTab('register');
  else switchAuthTab('login');
  setTimeout(() => document.getElementById('loginUsernameInput')?.focus(), 150);
}

function switchAuthTab(tab) {
  const loginPanel    = document.getElementById('authLoginPanel');
  const registerPanel = document.getElementById('authRegisterPanel');
  const tabLogin      = document.getElementById('tabLogin');
  const tabRegister   = document.getElementById('tabRegister');
  if (tab === 'login') {
    loginPanel.classList.remove('hidden');
    registerPanel.classList.add('hidden');
    tabLogin.classList.add('auth-tab-active');
    tabRegister.classList.remove('auth-tab-active');
    setTimeout(() => document.getElementById('loginUsernameInput')?.focus(), 50);
  } else {
    loginPanel.classList.add('hidden');
    registerPanel.classList.remove('hidden');
    tabLogin.classList.remove('auth-tab-active');
    tabRegister.classList.add('auth-tab-active');
    setTimeout(() => document.getElementById('regNameInput')?.focus(), 50);
  }
}

async function submitLogin() {
  const username = document.getElementById('loginUsernameInput').value.trim();
  const pin      = document.getElementById('loginPinInput').value.trim();
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('btnLoginSubmit');

  if (!username || !pin) {
    errEl.textContent = '아이디와 PIN을 입력해주세요.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = '확인 중…';

  try {
    const resp = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, pin }),
    });
    const data = await resp.json();

    if (resp.status === 403 && data.error === 'pending') {
      document.getElementById('authScreen').classList.add('hidden');
      // 로컬에 username/pin 임시 저장 (상태 확인용)
      localStorage.setItem('cc_username', username);
      localStorage.setItem('cc_pin',      pin);
      showPendingScreen();
      btn.disabled = false; btn.textContent = '로그인';
      return;
    }
    if (resp.status === 403 && data.error === 'rejected') {
      document.getElementById('authScreen').classList.add('hidden');
      showRejectedScreen();
      btn.disabled = false; btn.textContent = '로그인';
      return;
    }
    if (!resp.ok) {
      errEl.textContent = data.message || '로그인에 실패했습니다.';
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '로그인';
      return;
    }

    // 로그인 성공
    const user      = data.user;
    const autoLogin = document.getElementById('autoLoginCheckbox')?.checked ?? true;

    localStorage.setItem('cc_user_id',   user.id);
    localStorage.setItem('cc_user_name', user.name);
    if (autoLogin) {
      localStorage.setItem('cc_username', username);
      localStorage.setItem('cc_pin',      pin);
      localStorage.setItem('cc_autologin', '1');
    } else {
      localStorage.removeItem('cc_username');
      localStorage.removeItem('cc_pin');
      localStorage.removeItem('cc_autologin');
    }
    isSubAdmin = user.role === 'admin';
    if (isSubAdmin) localStorage.setItem('cc_is_subadmin', '1');
    else localStorage.removeItem('cc_is_subadmin');
    currentUser = { id: user.id, name: user.name };
    document.getElementById('authScreen').classList.add('hidden');
    await launchApp();
  } catch {
    errEl.textContent = '서버에 연결할 수 없습니다.';
    errEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '로그인';
  }
}

async function submitRegistration() {
  const name     = document.getElementById('regNameInput').value.trim();
  const username = document.getElementById('regUsernameInput').value.trim();
  const pin      = document.getElementById('regPinInput').value.trim();
  const errEl    = document.getElementById('regError');
  const btn      = document.getElementById('btnRegSubmit');

  if (!name)     { errEl.textContent = '이름을 입력해주세요.';  errEl.classList.remove('hidden'); return; }
  if (!username) { errEl.textContent = '아이디를 입력해주세요.'; errEl.classList.remove('hidden'); return; }
  if (!pin || pin.length < 4) { errEl.textContent = 'PIN은 4자리 이상 입력해주세요.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = '요청 중…';

  try {
    const resp = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, username, pin }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      errEl.textContent = data.message || '오류가 발생했습니다.';
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '가입 요청하기';
      return;
    }

    // 가입 성공 → 대기 화면
    localStorage.setItem('cc_username', username);
    localStorage.setItem('cc_pin',      pin);
    document.getElementById('authScreen').classList.add('hidden');
    showPendingScreen();
  } catch {
    errEl.textContent = '서버에 연결할 수 없습니다.';
    errEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '가입 요청하기';
  }
}

// ── 승인 대기 화면 ─────────────────────────────────
function showPendingScreen() {
  const sc = document.getElementById('pendingScreen');
  if (sc) sc.classList.remove('hidden');
}

async function refreshPendingStatus() {
  const username = localStorage.getItem('cc_username');
  const pin      = localStorage.getItem('cc_pin');
  if (!username || !pin) { showAuthScreen('login'); return; }

  try {
    const resp = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, pin }),
    });
    const data = await resp.json();

    if (resp.ok) {
      const user = data.user;
      localStorage.setItem('cc_user_id',   user.id);
      localStorage.setItem('cc_user_name', user.name);
      currentUser = { id: user.id, name: user.name };
      isSubAdmin = user.role === 'admin';
      if (isSubAdmin) localStorage.setItem('cc_is_subadmin', '1');
      else localStorage.removeItem('cc_is_subadmin');
      document.getElementById('pendingScreen')?.classList.add('hidden');
      await launchApp();
    } else if (resp.status === 403 && data.error === 'rejected') {
      document.getElementById('pendingScreen')?.classList.add('hidden');
      showRejectedScreen();
    } else {
      showToast('아직 승인 대기 중입니다.');
    }
  } catch {
    showToast('서버에 연결할 수 없습니다.');
  }
}

// ── 접근 거절 화면 ─────────────────────────────────
function showRejectedScreen() {
  document.getElementById('pendingScreen')?.classList.add('hidden');
  const sc = document.getElementById('rejectedScreen');
  if (sc) sc.classList.remove('hidden');
}

// ── 서버 동기화 저장 (디바운스) ───────────────────
function syncEventsToServer(opts) {
  if (!syncEnabled) return;
  clearTimeout(syncTimer);
  setSyncStatus('syncing', '동기화 중…');
  const payload = { events, ...(opts || {}) };
  syncTimer = setTimeout(async () => {
    try {
      await apiPost('/api/sync/events', payload);
      setSyncStatus('online', '✅ 동기화됨');
    } catch {
      setSyncStatus('offline', '⚠️ 동기화 실패');
    }
  }, 800);
}

async function syncSettingsToServer(draft) {
  if (!syncEnabled) return;
  try {
    await apiPost('/api/sync/settings', {
      categories: draft.categories,
      darkMode:   draft.darkMode,
    });
  } catch {
    setSyncStatus('offline', '⚠️ 설정 동기화 실패');
  }
}

function showAppLock() {
  const screen = document.getElementById('appLockScreen');
  screen.classList.remove('hidden');
  setTimeout(() => document.getElementById('appLockInput').focus(), 150);
}

function verifyAppLock() {
  const input = document.getElementById('appLockInput');
  const error = document.getElementById('appLockError');
  if (input.value === settings.password) {
    document.getElementById('appLockScreen').classList.add('hidden');
    input.value = '';
    error.classList.add('hidden');
    launchApp(); // 비밀번호 확인 후 캘린더 렌더링 + 서버 동기화
  } else {
    error.classList.remove('hidden');
    input.value = '';
    input.focus();
    const card = document.querySelector('#appLockScreen .app-lock-card');
    if (card) {
      card.style.animation = 'none';
      card.offsetHeight;
      card.style.animation = 'lockShake 0.4s ease';
    }
  }
}

// ═════════════════════════════════════════════════
// 뷰 전환 (달력 ↔ 목록)
// ═════════════════════════════════════════════════
const isMobile = () => window.innerWidth <= 768;

function initView() {
  const saved = localStorage.getItem('cc_view');
  currentView = saved || (isMobile() ? 'list' : 'calendar');
}

function switchView(view) {
  currentView = view;
  localStorage.setItem('cc_view', view);
  applyView();
}

function applyView() {
  const calContent = document.getElementById('calendarContent');
  const listWrap   = document.getElementById('listViewWrap');
  const btnCal     = document.getElementById('btnViewCalendar');
  const btnList    = document.getElementById('btnViewList');
  const isList     = currentView === 'list';

  calContent?.classList.toggle('hidden', isList);
  listWrap?.classList.toggle('hidden', !isList);
  btnCal?.classList.toggle('view-toggle-active', !isList);
  btnList?.classList.toggle('view-toggle-active', isList);

  if (isList) renderListViewAll();
  else        renderCalendar();
}

function renderCurrentView() {
  if (currentView === 'list') renderListViewAll();
  else                        renderCalendar();
}

// ── 전체 목록 보기 렌더링 ─────────────────────────
function renderListViewAll() {
  const body = document.getElementById('listViewBody');
  if (!body) return;

  const sorted = [...events].sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    return dc !== 0 ? dc : (a.time || '').localeCompare(b.time || '');
  });

  if (!sorted.length) {
    body.innerHTML = `
      <div class="lv-empty">
        <div style="font-size:36px;margin-bottom:10px">📋</div>
        <div style="font-weight:600;margin-bottom:4px">등록된 일정이 없습니다.</div>
        <div style="font-size:13px;color:var(--text-muted)">날짜를 눌러 일정을 추가해보세요.</div>
      </div>`;
    return;
  }

  const todayStr = toDateStr(new Date());
  const alpha    = isDark() ? 0.22 : 0.15;
  const DAYS     = ['일','월','화','수','목','금','토'];

  // 월별 그룹
  const groups = {};
  sorted.forEach(ev => {
    const key = ev.date.substring(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  });

  let html = '';
  Object.entries(groups).forEach(([key, evts]) => {
    const [y, m] = key.split('-');
    html += `
      <div class="lv-month-header">
        ${y}년 ${parseInt(m)}월
        <span class="lv-month-count">${evts.length}건</span>
      </div>`;
    evts.forEach(ev => {
      const cat     = getCat(ev.type);
      const [ey, em, ed] = ev.date.split('-').map(Number);
      const dow     = new Date(ey, em-1, ed).getDay();
      const dowStr  = DAYS[dow];
      const isToday = ev.date === todayStr;
      const isSun   = dow === 0;
      const isSat   = dow === 6;
      const dateClr = isToday ? 'var(--accent)'
                    : isSun   ? 'var(--sunday)'
                    : isSat   ? 'var(--saturday)' : '';

      html += `
        <div class="lv-event-item" onclick="openDayModalFromList('${ev.date}','${ev.id}')">
          <div class="lv-date-col" ${dateClr ? `style="color:${dateClr}"` : ''}>
            <span class="lv-day">${String(ed).padStart(2,'0')}</span>
            <span class="lv-dow">${dowStr}</span>
          </div>
          <div class="lv-color-bar" style="background:${cat.color}"></div>
          <div class="lv-info">
            <div class="lv-title">${esc(ev.title)}</div>
            ${ev.time ? `<div class="lv-time">⏰ ${esc(ev.time)}</div>` : ''}
          </div>
          <span class="lv-badge" style="background:${hexToRgba(cat.color,alpha)};color:${cat.color}">${esc(cat.name)}</span>
        </div>`;
    });
  });

  body.innerHTML = html;
}

function openDayModalFromList(dateStr, eventId) {
  viewingEventId = eventId;
  openDayModal(dateStr);
  setTimeout(() => switchDayView('detail'), 50);
}

// ═════════════════════════════════════════════════
// 달력 렌더링
// ═════════════════════════════════════════════════

function renderCalendar() {
  const y = currentYear, m = currentMonth;
  document.getElementById('monthTitle').textContent = `${y}년 ${m + 1}월`;

  const firstDay = new Date(y, m, 1).getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();
  const prevLast = new Date(y, m, 0).getDate();
  const todayStr = toDateStr(new Date());
  const alpha    = isDark() ? 0.22 : 0.13;
  const mobile   = isMobile();

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    let d, mo = m, ye = y, other = false;
    if (i < firstDay) {
      d = prevLast - firstDay + 1 + i;
      mo = m - 1; if (mo < 0) { mo = 11; ye = y - 1; }
      other = true;
    } else if (i >= firstDay + lastDate) {
      d = i - firstDay - lastDate + 1;
      mo = m + 1; if (mo > 11) { mo = 0; ye = y + 1; }
      other = true;
    } else {
      d = i - firstDay + 1;
    }

    const dateStr  = toDateStr(new Date(ye, mo, d));
    const dow      = new Date(ye, mo, d).getDay();
    const dayEvts  = events.filter(e => e.date === dateStr);

    const cell = document.createElement('div');
    cell.className = 'day-cell'
      + (other ? ' other-month' : '')
      + (dateStr === todayStr ? ' today' : '')
      + (dayEvts.length > 0 && !other ? ' has-event' : '');
    cell.dataset.date = dateStr;

    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = d;
    if (dateStr === todayStr) numEl.style.color = 'var(--accent)';
    else if (dow === 0)       numEl.style.color = 'var(--sunday)';
    else if (dow === 6)       numEl.style.color = 'var(--saturday)';
    cell.appendChild(numEl);

    if (mobile) {
      // 모바일: 컬러 도트로 일정 표시 (최대 3개)
      if (dayEvts.length > 0 && !other) {
        const dotRow = document.createElement('div');
        dotRow.className = 'mobile-dot-row';
        dayEvts.slice(0, 3).forEach(ev => {
          const cat = getCat(ev.type);
          const dot = document.createElement('span');
          dot.className = 'mobile-dot';
          dot.style.background = cat.color;
          dotRow.appendChild(dot);
        });
        if (dayEvts.length > 3) {
          const more = document.createElement('span');
          more.className = 'mobile-dot-more';
          more.textContent = '+' + (dayEvts.length - 3);
          dotRow.appendChild(more);
        }
        cell.appendChild(dotRow);
      }
    } else {
      // PC: 기존 텍스트 칩 표시
      dayEvts.slice(0, 3).forEach(ev => {
        const cat  = getCat(ev.type);
        const chip = document.createElement('div');
        chip.className = 'event-chip';
        chip.style.cssText = `background:${hexToRgba(cat.color,alpha)};color:${cat.color};border-left:2px solid ${cat.color};`;
        chip.textContent   = `[${cat.name}] ` + (ev.time ? ev.time + ' ' : '') + ev.title;
        cell.appendChild(chip);
      });
      if (dayEvts.length > 3) {
        const more = document.createElement('div');
        more.className   = 'more-events';
        more.textContent = `+${dayEvts.length - 3}개 더`;
        cell.appendChild(more);
      }
    }

    cell.addEventListener('click', () => openDayModal(dateStr));
    grid.appendChild(cell);
  }
}

// ── 날짜 유틸 ────────────────────────────────────
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function formatDateKo(s) {
  const [y, m, d] = s.split('-').map(Number);
  const w = ['일','월','화','수','목','금','토'][new Date(y, m-1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${w})`;
}

// ═════════════════════════════════════════════════
// 미니 달력 팝업
// ═════════════════════════════════════════════════
function openMiniCal() {
  miniCalYear = currentYear;
  renderMiniCal();
  document.getElementById('miniCalPopup').classList.remove('hidden');
}
function closeMiniCal() {
  document.getElementById('miniCalPopup').classList.add('hidden');
}
function renderMiniCal() {
  document.getElementById('miniCalYear').textContent = miniCalYear + '년';
  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const grid   = document.getElementById('miniMonthGrid');
  grid.innerHTML = '';
  MONTHS.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className  = 'mini-month-btn'
      + (i === currentMonth && miniCalYear === currentYear ? ' current' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      currentYear  = miniCalYear;
      currentMonth = i;
      switchView('calendar');
      closeMiniCal();
    });
    grid.appendChild(btn);
  });
}

// ═════════════════════════════════════════════════
// 날짜 팝업 – 뷰 시스템
// ═════════════════════════════════════════════════
function openDayModal(dateStr) {
  modalDate      = dateStr;
  viewingEventId = null;
  editingEventId = null;
  document.getElementById('dayOverlay').classList.remove('hidden');
  switchDayView('list');
}

function closeDayModal() {
  document.getElementById('dayOverlay').classList.add('hidden');
  modalDate      = null;
  viewingEventId = null;
  editingEventId = null;
}

function switchDayView(view) {
  ['list','detail','form'].forEach(v => {
    const el = document.getElementById('view' + cap(v));
    el.classList.toggle('active', v === view);
  });

  const backBtn = document.getElementById('btnDayBack');
  const titleEl = document.getElementById('dayModalTitle');

  if (view === 'list') {
    backBtn.classList.add('hidden');
    titleEl.textContent = formatDateKo(modalDate);
    renderListView();
  } else if (view === 'detail') {
    backBtn.classList.remove('hidden');
    titleEl.textContent = '일정 상세';
    renderDetailView();
  } else if (view === 'form') {
    backBtn.classList.remove('hidden');
    titleEl.textContent = editingEventId ? '일정 수정' : '일정 추가';
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function handleDayBack() {
  const active = document.querySelector('.day-view.active')?.id;
  if (active === 'viewDetail') {
    viewingEventId = null;
    switchDayView('list');
  } else if (active === 'viewForm') {
    if (formPrevView === 'detail' && viewingEventId) {
      editingEventId = null;
      switchDayView('detail');
    } else {
      editingEventId = null;
      switchDayView('list');
    }
  }
}

// ── 뷰 1 : 목록 ──────────────────────────────────
function renderListView() {
  const dayEvts = events
    .filter(e => e.date === modalDate)
    .sort((a, b) => (a.time||'').localeCompare(b.time||''));

  const body  = document.getElementById('listBody');
  const alpha = isDark() ? 0.22 : 0.15;
  body.innerHTML = '';

  if (!dayEvts.length) {
    body.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-icon">📋</div>
        <div class="list-empty-main">이 날은 등록된 일정이 없어요.</div>
        <div class="list-empty-sub">아래 버튼을 눌러 추가해보세요.</div>
      </div>`;
    return;
  }

  dayEvts.forEach(ev => {
    const cat  = getCat(ev.type);
    const item = document.createElement('div');
    item.className = 'list-event-item';
    item.innerHTML = `
      <span class="list-event-badge"
        style="background:${hexToRgba(cat.color,alpha)};color:${cat.color}">
        ${esc(cat.name)}
      </span>
      <div class="list-event-info">
        <div class="list-event-title">${esc(ev.title)}</div>
        ${ev.time ? `<div class="list-event-time">⏰ ${esc(ev.time)}</div>` : ''}
      </div>
      <span class="list-event-arrow">›</span>`;

    item.addEventListener('click', () => {
      viewingEventId = ev.id;
      switchDayView('detail');
    });
    body.appendChild(item);
  });
}

// ── 뷰 2 : 상세 ──────────────────────────────────
function renderDetailView() {
  const ev  = events.find(e => e.id === viewingEventId);
  const body = document.getElementById('detailBody');

  if (!ev) {
    body.innerHTML = '<div class="list-empty"><div class="list-empty-main">일정을 찾을 수 없습니다.</div></div>';
    return;
  }

  const cat   = getCat(ev.type);
  const alpha = isDark() ? 0.22 : 0.15;

  // 등록자 정보
  let creatorHtml = '';
  if (ev.createdBy) {
    const createdStr = formatShortDateTime(ev.createdAt);
    creatorHtml = `<div class="event-creator">등록: ${esc(ev.createdBy.name)}${createdStr ? ' · ' + createdStr : ''}`;
    if (ev.updatedBy) {
      const updatedStr = formatShortDateTime(ev.updatedAt);
      creatorHtml += `<br>수정: ${esc(ev.updatedBy.name)}${updatedStr ? ' · ' + updatedStr : ''}`;
    }
    creatorHtml += '</div>';
  }

  body.innerHTML = `
    <div class="detail-section">
      <div class="detail-top-row">
        <span class="event-type-badge"
          style="background:${hexToRgba(cat.color,alpha)};color:${cat.color}">
          ${esc(cat.name)}
        </span>
        ${ev.time ? `<span style="font-size:12px;color:var(--text-muted)">⏰ ${esc(ev.time)}</span>` : ''}
      </div>
      <div class="detail-event-title">${esc(ev.title)}</div>
      <div class="detail-meta">
        <span>📅 ${formatDateKo(ev.date)}</span>
      </div>
    </div>
    ${ev.desc ? `
    <div class="detail-section">
      <div class="detail-label">메모</div>
      <div class="detail-desc">${ev.desc}</div>
    </div>` : ''}
    ${creatorHtml ? `<div class="detail-section">${creatorHtml}</div>` : ''}`;
}

// ── 뷰 3 : 폼 ────────────────────────────────────
function openFormAdd(dateStr) {
  editingEventId = null;
  formPrevView   = 'list';
  document.getElementById('fDate').value     = dateStr || modalDate || toDateStr(new Date());
  document.getElementById('fTime').value     = '';
  document.getElementById('fTitle').value    = '';
  document.getElementById('fDesc').innerHTML = '';
  renderTypeBtns(settings.categories[0]?.id);
  switchDayView('form');
  setTimeout(() => document.getElementById('fTitle').focus(), 80);
}

function openFormEdit(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  editingEventId = id;
  formPrevView   = 'detail';
  document.getElementById('fDate').value     = ev.date;
  document.getElementById('fTime').value     = ev.time  || '';
  document.getElementById('fTitle').value    = ev.title;
  document.getElementById('fDesc').innerHTML = ev.desc  || '';
  renderTypeBtns(ev.type);
  switchDayView('form');
}

function renderTypeBtns(activeId) {
  const wrap = document.getElementById('typeBtns');
  wrap.innerHTML = '';
  settings.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'type-btn' + (cat.id === activeId ? ' active' : '');
    btn.dataset.id  = cat.id;
    btn.innerHTML   = `<span class="dot" style="background:${cat.color}"></span>${esc(cat.name)}`;
    applyTypeBtnStyle(btn, cat, cat.id === activeId);
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.type-btn').forEach(b => {
        b.classList.remove('active');
        applyTypeBtnStyle(b, getCat(b.dataset.id), false);
      });
      btn.classList.add('active');
      applyTypeBtnStyle(btn, cat, true);
    });
    wrap.appendChild(btn);
  });
}

function applyTypeBtnStyle(btn, cat, active) {
  btn.style.borderColor = active ? cat.color : '';
  btn.style.color       = active ? cat.color : '';
  btn.style.background  = active ? hexToRgba(cat.color, isDark() ? 0.18 : 0.10) : '';
}

function getActiveTypeId() {
  return document.querySelector('#typeBtns .type-btn.active')?.dataset.id
      || settings.categories[0]?.id || 'other';
}

/** 일정 저장 */
function saveEvent() {
  const date  = document.getElementById('fDate').value;
  const title = document.getElementById('fTitle').value.trim();
  const time  = document.getElementById('fTime').value;
  const desc  = document.getElementById('fDesc').innerHTML.trim();
  const type  = getActiveTypeId();

  if (!date || !title) { showToast('날짜와 제목을 입력해주세요.'); return; }

  const now      = new Date().toISOString();
  const byUser   = currentUser || { id: 'admin', name: '관리자' };
  let   action   = '';
  let   changedEv = null;

  if (editingEventId) {
    const idx = events.findIndex(e => e.id === editingEventId);
    if (idx !== -1) {
      const old = events[idx];
      events[idx] = {
        ...old,
        date, title, time, desc, type,
        updatedBy: byUser,
        updatedAt: now,
      };
      changedEv = events[idx];
    }
    action = 'update';
    showToast('일정이 수정되었습니다.');
    viewingEventId = editingEventId;
    editingEventId = null;
    modalDate      = date;
    switchDayView('detail');
  } else {
    const newEv = {
      id:        crypto.randomUUID(),
      date, title, time, desc, type,
      createdBy: byUser,
      createdAt: now,
      updatedBy: null,
      updatedAt: null,
    };
    events.push(newEv);
    changedEv = newEv;
    action = 'add';
    showToast('일정이 추가되었습니다.');
    editingEventId = null;
    modalDate      = date;
    switchDayView('list');
  }

  // 이벤트 저장 + 활동 로그 전송
  localStorage.setItem('cc_events', JSON.stringify(events));
  if (syncEnabled) {
    clearTimeout(syncTimer);
    setSyncStatus('syncing', '동기화 중…');
    const payload = {
      events,
      action,
      changedEvent: changedEv,
      detail: `${title} (${date})`,
    };
    syncTimer = setTimeout(async () => {
      try {
        await apiPost('/api/sync/events', payload);
        setSyncStatus('online', '✅ 동기화됨');
      } catch {
        setSyncStatus('offline', '⚠️ 동기화 실패');
      }
    }, 300);
  }
  renderCurrentView();
}

/** 현재 상세 중인 일정 삭제 */
function deleteCurrentEvent() {
  if (!viewingEventId) return;
  if (!confirm('이 일정을 삭제할까요?')) return;

  const ev = events.find(e => e.id === viewingEventId);
  events = events.filter(e => e.id !== viewingEventId);
  const deletedEv = ev;

  viewingEventId = null;
  renderCurrentView();
  switchDayView('list');
  showToast('일정이 삭제되었습니다.');

  localStorage.setItem('cc_events', JSON.stringify(events));
  if (syncEnabled && deletedEv) {
    clearTimeout(syncTimer);
    const payload = {
      events,
      action:       'delete',
      changedEvent: deletedEv,
      detail:       `${deletedEv.title} (${deletedEv.date})`,
    };
    syncTimer = setTimeout(async () => {
      try {
        await apiPost('/api/sync/events', payload);
        setSyncStatus('online', '✅ 동기화됨');
      } catch {
        setSyncStatus('offline', '⚠️ 동기화 실패');
      }
    }, 300);
  }
}

// ═════════════════════════════════════════════════
// 설정
// ═════════════════════════════════════════════════
function openSettingsWithAuth() {
  if (settings.password && !settingsUnlocked) {
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordError').classList.add('hidden');
    document.getElementById('passwordOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('passwordInput').focus(), 80);
  } else {
    openSettings();
  }
}

function verifyPassword() {
  if (document.getElementById('passwordInput').value === settings.password) {
    settingsUnlocked = true;
    document.getElementById('passwordOverlay').classList.add('hidden');
    openSettings();
  } else {
    document.getElementById('passwordError').classList.remove('hidden');
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();
  }
}

function openSettings() {
  settingsDraft = JSON.parse(JSON.stringify(settings));
  document.getElementById('darkModeToggle').checked      = settingsDraft.darkMode;
  document.getElementById('lockDisabledToggle').checked  = settingsDraft.lockDisabled ?? false;
  document.getElementById('settingsCurrentPw').value     = '';
  document.getElementById('settingsNewPw').value         = '';

  // 관리자/일반 사용자 권한에 따라 섹션 노출 제어
  // sectionPassword: 슈퍼 관리자만 / 나머지: 관리자 또는 서브 관리자
  ['sectionAppShare', 'sectionSync', 'adminSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !isAdminMode && !isSubAdmin);
  });
  const pwSection = document.getElementById('sectionPassword');
  if (pwSection) pwSection.classList.toggle('hidden', !isAdminMode);

  const sdot = document.getElementById('syncDot');
  const stxt = document.getElementById('syncStatusText');
  if (sdot) sdot.className = 'sync-dot ' + (syncEnabled ? 'online' : 'offline');
  if (stxt) stxt.textContent = syncEnabled
    ? '✅ 서버 연결됨 — 모든 기기 동일 데이터'
    : '⚠️ 오프라인 — 로컬 데이터만 저장됨';

  renderCategoryList();

  // PIN 변경 섹션: 사용자 계정으로 로그인된 경우에만 표시
  const pinSection = document.getElementById('sectionPinChange');
  if (pinSection) {
    pinSection.classList.toggle('hidden', !currentUser);
    if (currentUser) {
      document.getElementById('currentPinInput').value = '';
      document.getElementById('newPinInput').value = '';
      document.getElementById('pinChangeError')?.classList.add('hidden');
    }
  }

  // 관리자 패널 초기 상태
  const adminSection = document.getElementById('adminSection');
  if (adminSection) {
    if (isAdminMode) {
      // 슈퍼 관리자: 저장된 비밀번호로 자동 진입
      const savedPw = localStorage.getItem('cc_admin_pw') || '';
      const pwInput = document.getElementById('adminPwInput');
      if (pwInput) pwInput.value = savedPw;
      if (savedPw) showAdminPanel();
      else hideAdminPanel();
    } else if (isSubAdmin) {
      // 서브 관리자: 패스워드 없이 패널 직접 표시
      document.getElementById('adminLoginArea')?.classList.add('hidden');
      document.getElementById('adminPanelArea')?.classList.remove('hidden');
      document.getElementById('btnAdminLock')?.classList.add('hidden');
      loadAdminUsers();
    }
  }

  document.getElementById('settingsOverlay').classList.remove('hidden');
}

function logout() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  localStorage.removeItem('cc_user_id');
  localStorage.removeItem('cc_user_name');
  localStorage.removeItem('cc_username');
  localStorage.removeItem('cc_pin');
  localStorage.removeItem('cc_autologin');
  localStorage.removeItem('cc_admin_pw');
  localStorage.removeItem('cc_is_subadmin');
  currentUser = null;
  isAdminMode = false;
  isSubAdmin  = false;
  adminPw = '';
  syncEnabled = false;
  document.getElementById('settingsOverlay').classList.add('hidden');
  document.getElementById('appMain').classList.add('hidden');
  showAuthScreen('login');
}

async function refreshSync() {
  const btn = document.getElementById('btnRefresh');
  if (btn) { btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none'; }
  setSyncStatus('syncing', '새로고침 중…');
  try {
    const resp = await apiGet('/api/sync');
    if (resp.ok) {
      const data = await resp.json();
      events = data.events || [];
      settings.categories = data.categories || settings.categories;
      settings.darkMode   = data.darkMode   ?? settings.darkMode;
      syncEnabled = true;
      localStorage.setItem('cc_events', JSON.stringify(events));
      saveSettings();
      applyTheme(settings.darkMode);
      renderCurrentView();
      setSyncStatus('online', '✅ 동기화됨');
    } else if (resp.status === 401) {
      logout();
    }
  } catch {
    setSyncStatus('offline', '⚠️ 오프라인');
  }
  if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.add('hidden');
  settingsDraft    = null;
  settingsUnlocked = false;
  applyTheme(settings.darkMode);
}

function renderCategoryList() {
  const el = document.getElementById('categoryList');
  el.innerHTML = '';
  settingsDraft.categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <span class="cat-color-dot" style="background:${cat.color}"></span>
      <input class="cat-name-input"  type="text"  value="${esc(cat.name)}" />
      <input class="cat-color-input" type="color" value="${cat.color}" />
      <button class="btn-cat-delete">×</button>`;

    row.querySelector('.cat-name-input').addEventListener('input', e => { cat.name  = e.target.value; });
    row.querySelector('.cat-color-input').addEventListener('input', e => {
      cat.color = e.target.value;
      row.querySelector('.cat-color-dot').style.background = e.target.value;
    });
    row.querySelector('.btn-cat-delete').addEventListener('click', () => {
      if (settingsDraft.categories.length <= 1) { showToast('카테고리는 최소 1개 이상이어야 합니다.'); return; }
      settingsDraft.categories = settingsDraft.categories.filter(c => c !== cat);
      renderCategoryList();
    });
    el.appendChild(row);
  });
}

function addCategory() {
  const name  = document.getElementById('newCatName').value.trim();
  const color = document.getElementById('newCatColor').value;
  if (!name) { showToast('카테고리 이름을 입력하세요.'); return; }
  settingsDraft.categories.push({ id: crypto.randomUUID(), name, color });
  document.getElementById('newCatName').value = '';
  renderCategoryList();
}

function saveSettingsData() {
  const curPw = document.getElementById('settingsCurrentPw').value;
  const newPw = document.getElementById('settingsNewPw').value;
  if (curPw !== '' || newPw !== '') {
    if (settings.password && curPw !== settings.password) {
      showToast('현재 비밀번호가 올바르지 않습니다.'); return;
    }
    settingsDraft.password = newPw;
  }

  settingsDraft.darkMode     = document.getElementById('darkModeToggle').checked;
  settingsDraft.lockDisabled = document.getElementById('lockDisabledToggle')?.checked ?? false;

  settings = settingsDraft;
  saveSettings();
  applyTheme(settings.darkMode);
  syncSettingsToServer(settings);
  renderCurrentView();
  showToast('설정이 저장되었습니다.');
  document.getElementById('settingsOverlay').classList.add('hidden');
  settingsDraft    = null;
  settingsUnlocked = false;
}

// ═════════════════════════════════════════════════
// 관리자 패널
// ═════════════════════════════════════════════════
async function verifyAdminPanel() {
  const pw = document.getElementById('adminPwInput')?.value?.trim();
  if (!pw) return;

  try {
    const resp = await fetch('/api/admin/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: pw }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      adminPw     = pw;
      isAdminMode = true;
      localStorage.setItem('cc_admin_pw', pw);
      showAdminPanel();
      loadAdminUsers();
      showToast('관리자 패널이 열렸습니다.');
    } else {
      showToast('비밀번호가 올바르지 않습니다.');
    }
  } catch {
    showToast('서버에 연결할 수 없습니다.');
  }
}

function lockAdminPanel() {
  adminPw     = '';
  isAdminMode = false;
  localStorage.removeItem('cc_admin_pw');
  hideAdminPanel();
  showToast('관리자 패널이 잠겼습니다.');
}

function showAdminPanel() {
  document.getElementById('adminLoginArea')?.classList.add('hidden');
  document.getElementById('adminPanelArea')?.classList.remove('hidden');
  loadAdminUsers();
}

function hideAdminPanel() {
  document.getElementById('adminLoginArea')?.classList.remove('hidden');
  document.getElementById('adminPanelArea')?.classList.add('hidden');
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  ['Users','Invites','Activity'].forEach(name => {
    const el = document.getElementById('adminTab' + name);
    if (el) el.classList.toggle('hidden', name.toLowerCase() !== tab);
  });

  if (tab === 'users')    loadAdminUsers();
  if (tab === 'activity') loadAdminActivity();
}

// ── 앱 링크 복사 ────────────────────────────────────
function copyAppLink() {
  const url      = location.origin;
  const resultEl = document.getElementById('generatedInviteResult');
  const urlEl    = document.getElementById('generatedInviteUrl');
  if (resultEl) resultEl.classList.remove('hidden');
  if (urlEl)    urlEl.textContent = url;

  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 앱 링크가 클립보드에 복사되었습니다!');
  }).catch(() => {
    showToast('링크를 직접 복사하세요.');
  });
}


async function loadAdminUsers() {
  const container = document.getElementById('adminTabUsers');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">불러오는 중…</div>';

  try {
    const resp = await fetch('/api/admin/users', {
      headers: adminHeaders()
    });
    if (!resp.ok) { container.innerHTML = '<div class="admin-error">불러오기 실패</div>'; return; }
    const data = await resp.json();
    renderAdminUsers(data.users || []);
  } catch {
    container.innerHTML = '<div class="admin-error">서버 오류</div>';
  }
}

function renderAdminUsers(users) {
  const container = document.getElementById('adminTabUsers');
  const pending   = users.filter(u => u.status === 'pending');
  const approved  = users.filter(u => u.status === 'approved');

  // 배지 업데이트
  pendingBadge = pending.length;
  updateAdminBadge();
  const badge = document.querySelector('.admin-tab-btn[data-tab="users"] .tab-badge');
  if (badge) {
    badge.textContent   = pending.length || '';
    badge.style.display = pending.length ? 'inline-flex' : 'none';
  }

  let html = '';

  if (pending.length) {
    html += `<div class="admin-group-title">⏳ 승인 대기 (${pending.length}명)</div>`;
    pending.forEach(u => {
      const dt = u.registeredAt ? formatShortDateTime(u.registeredAt) : '';
      html += `
        <div class="admin-user-card pending">
          <div class="admin-user-info">
            <div class="admin-user-name">${esc(u.name)}</div>
            <div class="admin-user-meta">등록: ${dt}</div>
          </div>
          <div class="admin-user-actions">
            <button class="btn-approve" onclick="approveUser('${u.id}')">승인</button>
            <button class="btn-reject"  onclick="rejectUser('${u.id}')">거절</button>
          </div>
        </div>`;
    });
  }

  if (approved.length) {
    html += `<div class="admin-group-title" style="margin-top:16px">✅ 승인된 사용자 (${approved.length}명)</div>`;
    approved.forEach(u => {
      const dt        = u.approvedAt ? formatShortDateTime(u.approvedAt) : '';
      const hasAdmin  = u.role === 'admin';
      const roleBadge = hasAdmin ? `<span class="role-badge-admin">👑 관리자</span>` : '';
      // 관리자 지정/해제 버튼: 슈퍼 관리자 또는 서브 관리자 모두 표시
      const adminBtn  = (isAdminMode || isSubAdmin)
        ? (hasAdmin
            ? `<button class="btn-revoke-admin" onclick="revokeUserAdmin('${u.id}')">권한 해제</button>`
            : `<button class="btn-grant-admin"  onclick="grantUserAdmin('${u.id}')">관리자 지정</button>`)
        : '';
      // PIN 재설정 버튼 (PIN이 있는 사용자만 — username 있으면 표시)
      const pinResetBtn = u.username
        ? `<button class="btn-reset-pin" onclick="openPinResetModal('${u.id}', '${esc(u.name)}')">🔑 PIN 재설정</button>`
        : '';
      html += `
        <div class="admin-user-card approved">
          <div class="admin-user-info">
            <div class="admin-user-name">${esc(u.name)} ${roleBadge}</div>
            <div class="admin-user-meta">@${esc(u.username || '')} · 승인: ${dt}</div>
          </div>
          <div class="admin-user-actions">
            ${adminBtn}
            ${pinResetBtn}
            <button class="btn-delete-user" onclick="deleteUser('${u.id}')">삭제</button>
          </div>
        </div>`;
    });
  }

  if (!pending.length && !approved.length) {
    html = '<div class="admin-empty">등록된 사용자가 없습니다.</div>';
  }

  container.innerHTML = html;
}

async function approveUser(id) {
  try {
    const resp = await fetch('/api/admin/users/' + id + '/approve', {
      method:  'POST',
      headers: adminHeaders(),
    });
    if (resp.ok) { showToast('승인되었습니다.'); loadAdminUsers(); }
    else showToast('승인 실패');
  } catch { showToast('서버 오류'); }
}

async function rejectUser(id) {
  if (!confirm('이 사용자의 접근을 거절할까요?')) return;
  try {
    const resp = await fetch('/api/admin/users/' + id + '/reject', {
      method:  'POST',
      headers: adminHeaders(),
    });
    if (resp.ok) { showToast('거절되었습니다.'); loadAdminUsers(); }
    else showToast('거절 실패');
  } catch { showToast('서버 오류'); }
}

async function deleteUser(id) {
  if (!confirm('이 사용자를 삭제할까요?')) return;
  try {
    const resp = await fetch('/api/admin/users/' + id, {
      method:  'DELETE',
      headers: adminHeaders(),
    });
    if (resp.ok) { showToast('삭제되었습니다.'); loadAdminUsers(); }
    else showToast('삭제 실패');
  } catch { showToast('서버 오류'); }
}

async function grantUserAdmin(id) {
  if (!confirm('이 사용자에게 관리자 권한을 부여할까요?\n관리자로 지정되면 사용자 관리, 활동 기록 등을 볼 수 있습니다.')) return;
  try {
    const resp = await fetch('/api/admin/users/' + id + '/grant-admin', {
      method:  'POST',
      headers: adminHeaders(),
    });
    if (resp.ok) { showToast('✅ 관리자 권한이 부여되었습니다.'); loadAdminUsers(); }
    else { const d = await resp.json().catch(() => ({})); showToast(d.message || '권한 부여 실패'); }
  } catch { showToast('서버 오류'); }
}

async function revokeUserAdmin(id) {
  if (!confirm('이 사용자의 관리자 권한을 해제할까요?')) return;
  try {
    const resp = await fetch('/api/admin/users/' + id + '/revoke-admin', {
      method:  'POST',
      headers: adminHeaders(),
    });
    if (resp.ok) { showToast('관리자 권한이 해제되었습니다.'); loadAdminUsers(); }
    else { const d = await resp.json().catch(() => ({})); showToast(d.message || '권한 해제 실패'); }
  } catch { showToast('서버 오류'); }
}

// ── 서버 상태 확인 (헬스체크) ────────────────────
async function checkServerHealth() {
  const btn = document.getElementById('btnCheckHealth');
  const box = document.getElementById('serverHealthBox');
  if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }
  try {
    const resp = await fetch('/api/health');
    const data = await resp.json();

    const storageEl = document.getElementById('healthStorage');
    const dbEl      = document.getElementById('healthDb');
    const evEl      = document.getElementById('healthEvents');
    const usEl      = document.getElementById('healthUsers');

    if (storageEl) {
      if (data.storage === 'postgresql') {
        storageEl.textContent = '🐘 PostgreSQL (영구 저장)';
        storageEl.style.color = 'var(--accent)';
      } else {
        storageEl.textContent = '⚠️ /tmp 파일 (배포 시 삭제됨)';
        storageEl.style.color = '#e03050';
      }
    }
    if (dbEl) {
      if (data.storage === 'postgresql') {
        const ok = data.db === 'connected';
        dbEl.textContent = ok ? '✅ 연결됨' : `❌ 오류: ${data.dbError || '연결 실패'}`;
        dbEl.style.color = ok ? 'var(--accent)' : '#e03050';
      } else {
        dbEl.textContent = '해당 없음 (파일 모드)';
        dbEl.style.color = 'var(--text-muted)';
      }
    }
    if (evEl) evEl.textContent = `${data.events}건`;
    if (usEl) usEl.textContent = `${data.users}명`;

    if (box) box.classList.remove('hidden');

    if (!data.persistent) {
      showToast('⚠️ 파일 모드입니다. Railway에서 DATABASE_URL을 설정하세요!');
    } else if (data.db === 'connected') {
      showToast('✅ PostgreSQL 연결 정상 — 데이터가 영구 보존됩니다.');
    }
  } catch {
    showToast('서버 상태 확인 실패');
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔍 서버 상태 확인'; }
}

// ── 서버 DB 백업 다운로드 (관리자용) ─────────────
async function downloadServerBackup() {
  if (!isAdminMode && !isSubAdmin) {
    showToast('관리자만 서버 백업을 다운로드할 수 있습니다.');
    return;
  }
  const btn = document.getElementById('btnServerBackup');
  if (btn) { btn.disabled = true; btn.textContent = '다운로드 중…'; }
  try {
    const resp = await fetch('/api/admin/backup', {
      headers: adminHeaders(),
    });
    if (!resp.ok) { showToast('백업 다운로드 실패'); return; }
    const blob = await resp.blob();
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `jstudio-server-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('✅ 서버 백업 다운로드 완료');
  } catch {
    showToast('서버 백업 다운로드 실패');
  }
  if (btn) { btn.disabled = false; btn.textContent = '🐘 서버 백업'; }
}

// ── 관리자 PIN 강제 재설정 ────────────────────────
let pinResetTargetId = null;

function openPinResetModal(userId, userName) {
  pinResetTargetId = userId;
  const nameEl = document.getElementById('pinResetUserName');
  const input  = document.getElementById('pinResetInput');
  const errEl  = document.getElementById('pinResetError');
  const doneEl = document.getElementById('pinResetDone');
  const formEl = document.getElementById('pinResetForm');
  if (nameEl) nameEl.textContent = userName;
  if (input)  input.value = '';
  if (errEl)  errEl.classList.add('hidden');
  if (doneEl) doneEl.classList.add('hidden');
  if (formEl) formEl.classList.remove('hidden');
  document.getElementById('pinResetOverlay')?.classList.remove('hidden');
  setTimeout(() => input?.focus(), 100);
}

async function submitPinReset() {
  const newPin = document.getElementById('pinResetInput')?.value.trim();
  const errEl  = document.getElementById('pinResetError');
  const btn    = document.getElementById('btnPinResetConfirm');

  errEl.classList.add('hidden');
  if (!newPin || newPin.length < 4) {
    errEl.textContent = 'PIN은 4자리 이상이어야 합니다.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true; btn.textContent = '처리 중…';
  try {
    const resp = await fetch(`/api/admin/users/${pinResetTargetId}/reset-pin`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body:    JSON.stringify({ newPin }),
    });
    const data = await resp.json();
    if (resp.ok) {
      // 성공: 폼 숨기고 새 PIN 안내
      document.getElementById('pinResetForm')?.classList.add('hidden');
      const doneEl = document.getElementById('pinResetDone');
      const newPinDisplay = document.getElementById('pinResetNewPin');
      if (newPinDisplay) newPinDisplay.textContent = newPin;
      doneEl?.classList.remove('hidden');
    } else {
      errEl.textContent = data.message || 'PIN 재설정 실패';
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = '서버에 연결할 수 없습니다.';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false; btn.textContent = '재설정';
}

function closePinResetModal() {
  document.getElementById('pinResetOverlay')?.classList.add('hidden');
  pinResetTargetId = null;
}

// ── PIN 변경 ──────────────────────────────────────
async function submitPinChange() {
  const currentPin = document.getElementById('currentPinInput')?.value.trim();
  const newPin     = document.getElementById('newPinInput')?.value.trim();
  const errEl      = document.getElementById('pinChangeError');
  const btn        = document.getElementById('btnChangePinSave');

  errEl.classList.add('hidden');
  if (!currentPin || !newPin) {
    errEl.textContent = '현재 PIN과 새 PIN을 모두 입력해주세요.';
    errEl.classList.remove('hidden'); return;
  }
  if (newPin.length < 4) {
    errEl.textContent = 'PIN은 4자리 이상이어야 합니다.';
    errEl.classList.remove('hidden'); return;
  }
  btn.disabled = true; btn.textContent = '변경 중…';
  try {
    const resp = await fetch('/api/user/change-pin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
      body:    JSON.stringify({ currentPin, newPin }),
    });
    const data = await resp.json();
    if (resp.ok) {
      // 자동 로그인이 켜져 있으면 저장된 PIN도 갱신
      if (localStorage.getItem('cc_autologin') === '1') {
        localStorage.setItem('cc_pin', newPin);
      }
      showToast('✅ PIN이 변경되었습니다.');
      document.getElementById('currentPinInput').value = '';
      document.getElementById('newPinInput').value = '';
    } else {
      errEl.textContent = data.message || 'PIN 변경에 실패했습니다.';
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = '서버에 연결할 수 없습니다.';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false; btn.textContent = 'PIN 변경';
}

async function loadAdminActivity() {
  const container = document.getElementById('adminTabActivity');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">불러오는 중…</div>';

  try {
    const resp = await fetch('/api/admin/activity', {
      headers: adminHeaders()
    });
    if (!resp.ok) { container.innerHTML = '<div class="admin-error">불러오기 실패</div>'; return; }
    const data = await resp.json();
    renderAdminActivity(data.logs || []);
  } catch {
    container.innerHTML = '<div class="admin-error">서버 오류</div>';
  }
}

function renderAdminActivity(logs) {
  const container = document.getElementById('adminTabActivity');

  if (!logs.length) {
    container.innerHTML = '<div class="admin-empty">활동 기록이 없습니다.</div>';
    return;
  }

  const actionLabel = { add: '추가', update: '수정', delete: '삭제' };

  const html = logs.map(log => {
    const dt    = formatShortDateTime(log.timestamp);
    const label = actionLabel[log.action] || log.action;
    return `
      <div class="activity-log-item">
        <div class="activity-log-dot action-${log.action}"></div>
        <div class="activity-log-body">
          <div class="activity-log-text">
            <strong>${esc(log.userName)}</strong>님이
            <span class="action-badge action-${log.action}">${label}</span>
            ${log.eventTitle ? `"${esc(log.eventTitle)}"` : ''}
          </div>
          <div class="activity-log-meta">${dt}${log.eventDate ? ' · ' + log.eventDate : ''}</div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

// ═════════════════════════════════════════════════
// 리치 텍스트 에디터
// ═════════════════════════════════════════════════
function setupRichEditor() {
  const editor       = document.getElementById('fDesc');
  const colorPalette = document.querySelector('.color-palette');
  const emojiPalette = document.querySelector('.emoji-palette');
  const colorBtnBar  = document.getElementById('colorBtnBar');
  let   activeColor  = PALETTE_COLORS[0];

  function saveSelection() {
    const sel = window.getSelection();
    if (sel?.rangeCount > 0) savedSel = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    if (!savedSel) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedSel);
  }

  editor.addEventListener('mouseup', saveSelection);
  editor.addEventListener('keyup',   saveSelection);

  document.querySelector('[data-cmd="bold"]').addEventListener('mousedown', e => {
    e.preventDefault();
    restoreSelection();
    document.execCommand('bold');
  });

  PALETTE_COLORS.forEach(color => {
    const sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'color-swatch';
    sw.style.background = color;
    if (color === '#ffffff') sw.style.border = '2px solid #ccc';
    sw.addEventListener('mousedown', e => {
      e.preventDefault();
      activeColor = color;
      colorBtnBar.style.background = color;
      restoreSelection();
      document.execCommand('foreColor', false, color);
      colorPalette.classList.add('hidden');
    });
    colorPalette.appendChild(sw);
  });
  colorBtnBar.style.background = activeColor;

  document.querySelector('.color-btn').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    colorPalette.classList.toggle('hidden');
    emojiPalette.classList.add('hidden');
  });

  EMOJI_LIST.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'emoji-btn'; btn.textContent = emoji;
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      editor.focus();
      restoreSelection();
      document.execCommand('insertText', false, emoji);
      emojiPalette.classList.add('hidden');
      saveSelection();
    });
    emojiPalette.appendChild(btn);
  });

  document.querySelector('.emoji-trigger').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    emojiPalette.classList.toggle('hidden');
    colorPalette.classList.add('hidden');
  });
}

// ═════════════════════════════════════════════════
// 정적 이벤트 바인딩
// ═════════════════════════════════════════════════
function bindStaticEvents() {

  // ── 인증 화면 (로그인/회원가입) ──
  document.getElementById('tabLogin')?.addEventListener('click',    () => switchAuthTab('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('btnLoginSubmit')?.addEventListener('click', submitLogin);
  document.getElementById('loginUsernameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPinInput')?.focus(); });
  document.getElementById('loginPinInput')?.addEventListener('keydown',      e => { if (e.key === 'Enter') submitLogin(); });
  document.getElementById('btnRegSubmit')?.addEventListener('click', submitRegistration);
  document.getElementById('regNameInput')?.addEventListener('keydown',     e => { if (e.key === 'Enter') document.getElementById('regUsernameInput')?.focus(); });
  document.getElementById('regUsernameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('regPinInput')?.focus(); });
  document.getElementById('regPinInput')?.addEventListener('keydown',      e => { if (e.key === 'Enter') submitRegistration(); });
  document.getElementById('btnGoToLogin')?.addEventListener('click', () => {
    document.getElementById('rejectedScreen')?.classList.add('hidden');
    showAuthScreen('login');
  });

  // ── 관리자 로그인 (숨김) ──
  document.getElementById('btnShowAdminLogin')?.addEventListener('click', () => {
    const panel = document.getElementById('adminLoginPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden'))
      setTimeout(() => document.getElementById('adminLoginPwInput')?.focus(), 50);
  });
  document.getElementById('btnAdminLoginSubmit')?.addEventListener('click', submitAdminLogin);
  document.getElementById('adminLoginPwInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAdminLogin();
  });

  // ── 승인 대기 화면 ──
  const btnCheckStatus = document.getElementById('btnCheckStatus');
  if (btnCheckStatus) btnCheckStatus.addEventListener('click', refreshPendingStatus);

  // ── 관리자 헤더 버튼 ──
  const btnAdminPanelOpen = document.getElementById('btnAdminPanelOpen');
  if (btnAdminPanelOpen) btnAdminPanelOpen.addEventListener('click', () => {
    // 설정 패널 열고 관리자 섹션으로 스크롤
    openSettingsWithAuth();
    setTimeout(() => {
      document.getElementById('adminSection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  });


  // ── 앱 잠금 화면 ──
  document.getElementById('btnAppLockVerify').addEventListener('click', verifyAppLock);
  document.getElementById('appLockInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyAppLock();
  });

  // ── 월 이동 ──
  document.getElementById('btnPrev').addEventListener('click', () => {
    if (--currentMonth < 0) { currentMonth = 11; currentYear--; }
    switchView('calendar');
  });
  document.getElementById('btnNext').addEventListener('click', () => {
    if (++currentMonth > 11) { currentMonth = 0; currentYear++; }
    switchView('calendar');
  });
  document.getElementById('btnToday').addEventListener('click', () => {
    const n = new Date(); currentYear = n.getFullYear(); currentMonth = n.getMonth();
    switchView('calendar');
  });

  // ── 뷰 전환 ──
  document.getElementById('btnViewCalendar')?.addEventListener('click', () => switchView('calendar'));
  document.getElementById('btnViewList')?.addEventListener('click',     () => switchView('list'));

  // ── 미니 달력 ──
  document.getElementById('monthTitle').addEventListener('click', openMiniCal);
  document.getElementById('miniPrevYear').addEventListener('click', () => { miniCalYear--; renderMiniCal(); });
  document.getElementById('miniNextYear').addEventListener('click', () => { miniCalYear++; renderMiniCal(); });

  // ── 날짜 팝업 ──
  document.getElementById('btnDayClose').addEventListener('click', closeDayModal);
  document.getElementById('btnDayBack').addEventListener('click', handleDayBack);
  document.getElementById('dayOverlay').addEventListener('click', e => {
    if (e.target.id === 'dayOverlay') closeDayModal();
  });

  document.getElementById('btnListAdd').addEventListener('click', () => openFormAdd(modalDate));
  document.getElementById('btnDetailEdit').addEventListener('click', () => openFormEdit(viewingEventId));
  document.getElementById('btnDetailDelete').addEventListener('click', deleteCurrentEvent);
  document.getElementById('btnFormCancel').addEventListener('click', handleDayBack);
  document.getElementById('btnFormSave').addEventListener('click', saveEvent);

  // ── 새로고침 ──
  document.getElementById('btnRefresh').addEventListener('click', refreshSync);

  // ── 설정 ──
  document.getElementById('btnSettings').addEventListener('click', openSettingsWithAuth);
  document.getElementById('btnSettingsClose').addEventListener('click', closeSettings);
  document.getElementById('btnCancelSettings').addEventListener('click', closeSettings);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettingsData);
  document.getElementById('btnAddCategory').addEventListener('click', addCategory);
  document.getElementById('btnLogout')?.addEventListener('click', logout);
  document.getElementById('btnChangePinSave')?.addEventListener('click', submitPinChange);
  document.getElementById('newPinInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitPinChange(); });

  // ── 관리자 패널 ──
  const btnAdminVerify = document.getElementById('btnAdminVerify');
  if (btnAdminVerify) btnAdminVerify.addEventListener('click', verifyAdminPanel);
  const btnAdminLock = document.getElementById('btnAdminLock');
  if (btnAdminLock) btnAdminLock.addEventListener('click', lockAdminPanel);
  const adminPwInput = document.getElementById('adminPwInput');
  if (adminPwInput) adminPwInput.addEventListener('keydown', e => { if (e.key === 'Enter') verifyAdminPanel(); });

  // 관리자 탭 전환
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
  });

  // ── 앱 링크 복사 ──
  document.getElementById('btnCopyAppLink')?.addEventListener('click', copyAppLink);
  document.getElementById('btnGenerateInvite')?.addEventListener('click', copyAppLink);


  // ── 데이터 백업 내보내기 (로컬) ──
  document.getElementById('btnExportData').addEventListener('click', () => {
    const backup = { events, settings: { categories: settings.categories, darkMode: settings.darkMode }, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jstudio_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast('백업 파일이 다운로드되었습니다.');
  });

  // ── 서버 상태 확인 ──
  document.getElementById('btnCheckHealth')?.addEventListener('click', checkServerHealth);

  // ── 서버 DB 백업 다운로드 ──
  document.getElementById('btnServerBackup')?.addEventListener('click', downloadServerBackup);

  // ── 데이터 백업 불러오기 ──
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const backup = JSON.parse(ev.target.result);
        if (!Array.isArray(backup.events)) throw new Error();
        if (!confirm(`백업 파일에서 일정 ${backup.events.length}건을 불러올까요?\n현재 데이터는 덮어씌워집니다.`)) return;
        events = backup.events;
        if (backup.settings?.categories) settings.categories = backup.settings.categories;
        saveEvents();
        saveSettings();
        renderCurrentView();
        showToast('백업 데이터를 불러왔습니다.');
      } catch { showToast('올바른 백업 파일이 아닙니다.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('settingsOverlay').addEventListener('click', e => {
    if (e.target.id === 'settingsOverlay') closeSettings();
  });
  document.getElementById('darkModeToggle').addEventListener('change', e => {
    applyTheme(e.target.checked);
    if (settingsDraft) settingsDraft.darkMode = e.target.checked;
  });

  // ── 비밀번호 ──
  document.getElementById('btnPasswordVerify').addEventListener('click', verifyPassword);
  document.getElementById('btnPasswordCancel').addEventListener('click', () => {
    document.getElementById('passwordOverlay').classList.add('hidden');
  });
  document.getElementById('passwordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyPassword();
  });
  document.getElementById('passwordOverlay').addEventListener('click', e => {
    if (e.target.id === 'passwordOverlay')
      document.getElementById('passwordOverlay').classList.add('hidden');
  });

  // ── 카테고리 추가 Enter ──
  document.getElementById('newCatName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCategory();
  });

  // ── PIN 재설정 모달 ──
  document.getElementById('btnPinResetConfirm')?.addEventListener('click', submitPinReset);
  document.getElementById('btnPinResetCancel')?.addEventListener('click',  closePinResetModal);
  document.getElementById('btnPinResetClose')?.addEventListener('click',   closePinResetModal);
  document.getElementById('pinResetInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPinReset();
  });
  document.getElementById('pinResetOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'pinResetOverlay') closePinResetModal();
  });

  // ── ESC ──
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeDayModal();
    closeSettings();
    closeMiniCal();
    closePinResetModal();
    document.getElementById('passwordOverlay').classList.add('hidden');
  });

  // ── 팝업 외부 클릭 닫기 ──
  document.addEventListener('click', e => {
    if (!document.getElementById('miniCalPopup').classList.contains('hidden') &&
        !e.target.closest('#miniCalPopup') &&
        e.target.id !== 'monthTitle') {
      closeMiniCal();
    }
    if (!e.target.closest('.emoji-picker-wrap'))
      document.querySelector('.emoji-palette')?.classList.add('hidden');
    if (!e.target.closest('.color-picker-wrap'))
      document.querySelector('.color-palette')?.classList.add('hidden');
  });
}

// ═════════════════════════════════════════════════
// 토스트
// ═════════════════════════════════════════════════
function showToast(msg) {
  const t = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// ── 시작 ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

// ── 서비스워커 ────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  );
}
