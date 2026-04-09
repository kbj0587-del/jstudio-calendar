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
let currentUser  = null;   // { id, name }
let isAdminMode  = false;  // 관리자 모드 여부
let adminPw      = '';     // 관리자 비밀번호
let pendingBadge = 0;      // 대기 중 사용자 수

// ── 동기화 상태 ───────────────────────────────────
let storedInviteCode = '';
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
  if (storedInviteCode) h['x-invite-code'] = storedInviteCode;
  return Object.assign(h, extra || {});
}

async function apiGet(path) {
  const h = {};
  if (isAdminMode && adminPw) {
    h['x-admin-password'] = adminPw;
  } else if (currentUser) {
    h['x-user-id'] = currentUser.id;
  }
  if (storedInviteCode) h['x-invite-code'] = storedInviteCode;
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

  // ── 잠금 화면: 네트워크 이전에 즉시 표시 ──────────────
  if (settings.password && !settings.lockDisabled) showAppLock();

  renderCalendar();
  bindStaticEvents();
  setupRichEditor();

  // URL 파라미터 처리
  const urlParams = new URLSearchParams(window.location.search);
  const urlInvite = urlParams.get('invite');
  const urlUid    = urlParams.get('uid');

  if (urlInvite) {
    localStorage.setItem('cc_invite', urlInvite);
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (urlUid) {
    localStorage.setItem('cc_user_id', urlUid);
    window.history.replaceState({}, '', window.location.pathname);
  }

  // 저장된 사용자 정보 로드
  const savedUserId   = localStorage.getItem('cc_user_id')   || '';
  const savedUserName = localStorage.getItem('cc_user_name') || '';
  if (savedUserId) {
    currentUser = { id: savedUserId, name: savedUserName };
  }

  // 관리자 비밀번호 로드
  adminPw = localStorage.getItem('cc_admin_pw') || '';
  if (adminPw) isAdminMode = true;

  // 초대코드 로드
  storedInviteCode = localStorage.getItem('cc_invite') || '';

  // 서버 동기화 시도
  setSyncStatus('syncing', '서버 연결 중…');
  try {
    const resp = await apiGet('/api/sync');

    if (resp.status === 401) {
      const data = await resp.json().catch(() => ({}));
      if (data.error === 'needsRegistration') {
        setSyncStatus('error', '등록 필요');
        showRegistrationScreen();
        return;
      }
      setSyncStatus('error', '초대코드 필요');
      showInviteScreen();
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

      if (data.inviteCode !== undefined)
        localStorage.setItem('cc_invite_current', data.inviteCode);

      // 대기 중 배지 설정 (관리자 모드)
      if (isAdminMode && data.pendingCount > 0) {
        pendingBadge = data.pendingCount;
        updateAdminBadge();
      }

      saveEvents();
      saveSettings();
      applyTheme(settings.darkMode);
      renderCalendar();
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
    if (isAdminMode) headerBtn.classList.remove('hidden');
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
function showRegistrationScreen() {
  const sc = document.getElementById('registrationScreen');
  if (sc) {
    sc.classList.remove('hidden');
    setTimeout(() => {
      const inp = document.getElementById('regNameInput');
      if (inp) inp.focus();
    }, 150);
  }
}

async function submitRegistration() {
  const nameEl = document.getElementById('regNameInput');
  const errEl  = document.getElementById('regScreenError');
  const name   = nameEl?.value.trim();
  if (!name) {
    if (errEl) { errEl.textContent = '이름을 입력해주세요.'; errEl.classList.remove('hidden'); }
    return;
  }
  if (errEl) errEl.classList.add('hidden');

  const btn = document.getElementById('btnRegSubmit');
  if (btn) { btn.disabled = true; btn.textContent = '요청 중…'; }

  try {
    const resp = await fetch('/api/invite/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, userId: currentUser?.id }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      if (errEl) { errEl.textContent = data.message || '오류가 발생했습니다.'; errEl.classList.remove('hidden'); }
      if (btn) { btn.disabled = false; btn.textContent = '접근 요청하기'; }
      return;
    }

    const user = data.user;
    localStorage.setItem('cc_user_id',   user.id);
    localStorage.setItem('cc_user_name', user.name);
    currentUser = { id: user.id, name: user.name };

    const sc = document.getElementById('registrationScreen');
    if (sc) sc.classList.add('hidden');

    if (user.status === 'approved') {
      await init();
    } else {
      showPendingScreen();
    }
  } catch {
    if (errEl) { errEl.textContent = '서버에 연결할 수 없습니다.'; errEl.classList.remove('hidden'); }
    if (btn) { btn.disabled = false; btn.textContent = '접근 요청하기'; }
  }
}

// ── 승인 대기 화면 ─────────────────────────────────
function showPendingScreen() {
  document.getElementById('registrationScreen')?.classList.add('hidden');
  const sc = document.getElementById('pendingScreen');
  if (sc) sc.classList.remove('hidden');
}

async function refreshPendingStatus() {
  if (!currentUser) return;
  try {
    const resp = await fetch('/api/user/' + currentUser.id + '/status');
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.user.status === 'approved') {
      document.getElementById('pendingScreen')?.classList.add('hidden');
      await init();
    } else if (data.user.status === 'rejected') {
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

// ── 초대코드 화면 (기존 유지) ─────────────────────
function showInviteScreen() {
  document.getElementById('inviteScreen').classList.remove('hidden');
  setTimeout(() => document.getElementById('inviteInput').focus(), 150);
}

async function verifyInvite() {
  const code  = document.getElementById('inviteInput').value.trim();
  const error = document.getElementById('inviteError');
  if (!code) return;

  try {
    const resp = await fetch('/api/invite/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code }),
    });
    const { valid } = await resp.json();

    if (valid) {
      storedInviteCode = code;
      localStorage.setItem('cc_invite', code);
      document.getElementById('inviteScreen').classList.add('hidden');
      await init();
    } else {
      error.classList.remove('hidden');
      document.getElementById('inviteInput').value = '';
      document.getElementById('inviteInput').focus();
      const card = document.querySelector('#inviteScreen .app-lock-card');
      card.style.animation = 'none';
      card.offsetHeight;
      card.style.animation = 'lockShake 0.4s ease';
    }
  } catch {
    showToast('서버에 연결할 수 없습니다.');
  }
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
      inviteCode: draft.inviteCode,
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
  } else {
    error.classList.remove('hidden');
    input.value = '';
    input.focus();
    const card = document.querySelector('.app-lock-card');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'lockShake 0.4s ease';
  }
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

    dayEvts.slice(0, 3).forEach(ev => {
      const cat  = getCat(ev.type);
      const chip = document.createElement('div');
      chip.className = 'event-chip';
      chip.style.cssText = `background:${hexToRgba(cat.color,alpha)};color:${cat.color};border-left:2px solid ${cat.color};`;
      chip.textContent   = (ev.time ? ev.time + ' ' : '') + ev.title;
      cell.appendChild(chip);
    });
    if (dayEvts.length > 3) {
      const more = document.createElement('div');
      more.className   = 'more-events';
      more.textContent = `+${dayEvts.length - 3}개 더`;
      cell.appendChild(more);
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
      renderCalendar();
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
  renderCalendar();
}

/** 현재 상세 중인 일정 삭제 */
function deleteCurrentEvent() {
  if (!viewingEventId) return;
  if (!confirm('이 일정을 삭제할까요?')) return;

  const ev = events.find(e => e.id === viewingEventId);
  events = events.filter(e => e.id !== viewingEventId);
  const deletedEv = ev;

  viewingEventId = null;
  renderCalendar();
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

  const inviteField = document.getElementById('settingsInviteCode');
  if (inviteField) {
    inviteField.value = localStorage.getItem('cc_invite_current') || storedInviteCode || '';
  }

  const sdot = document.getElementById('syncDot');
  const stxt = document.getElementById('syncStatusText');
  if (sdot) sdot.className = 'sync-dot ' + (syncEnabled ? 'online' : 'offline');
  if (stxt) stxt.textContent = syncEnabled
    ? '✅ 서버 연결됨 — 모든 기기 동일 데이터'
    : '⚠️ 오프라인 — 로컬 데이터만 저장됨';

  renderCategoryList();

  // 관리자 패널 초기 상태
  const adminSection = document.getElementById('adminSection');
  if (adminSection) {
    const savedPw = localStorage.getItem('cc_admin_pw') || '';
    const pwInput = document.getElementById('adminPwInput');
    if (pwInput) pwInput.value = savedPw;
    if (savedPw) {
      showAdminPanel();
    } else {
      hideAdminPanel();
    }
  }

  document.getElementById('settingsOverlay').classList.remove('hidden');
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
  settingsDraft.inviteCode   = (document.getElementById('settingsInviteCode')?.value ?? '').trim();

  settings = settingsDraft;
  saveSettings();
  applyTheme(settings.darkMode);
  syncSettingsToServer(settings);

  if (settings.inviteCode) {
    storedInviteCode = settings.inviteCode;
    localStorage.setItem('cc_invite', settings.inviteCode);
  }

  renderCalendar();
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
  if (tab === 'invites')  loadAdminInvites();
  if (tab === 'activity') loadAdminActivity();
}

// ── 초대장 관리 함수 ────────────────────────────────
async function generateInvite() {
  const btn = document.getElementById('btnGenerateInvite');
  if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; btn.style.opacity = '0.7'; }

  try {
    const resp = await apiPost('/api/admin/invites/generate', {});
    if (!resp.ok) { showToast('초대장 생성 실패'); return; }
    const { invite } = await resp.json();

    const url      = `${location.origin}/invite.html?code=${invite.token}`;
    const resultEl = document.getElementById('generatedInviteResult');
    const urlEl    = document.getElementById('generatedInviteUrl');
    if (resultEl) resultEl.classList.remove('hidden');
    if (urlEl)    urlEl.textContent = url;

    // 자동 클립보드 복사
    navigator.clipboard.writeText(url).then(() => {
      showToast('🎫 초대 링크가 클립보드에 복사되었습니다!');
    }).catch(() => {
      showToast('초대장이 생성되었습니다. 링크를 직접 복사하세요.');
    });

    loadAdminInvites();
  } catch {
    showToast('서버에 연결할 수 없습니다.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔗 초대 링크 복사'; btn.style.opacity = ''; }
  }
}

async function loadAdminInvites() {
  const el = document.getElementById('adminInviteList');
  if (!el) return;
  el.innerHTML = '<p class="setting-hint">불러오는 중…</p>';

  try {
    const resp = await apiGet('/api/admin/invites');
    if (!resp.ok) { el.innerHTML = '<p class="setting-hint">불러오기 실패</p>'; return; }
    const { invites } = await resp.json();
    renderAdminInvites(invites || []);
  } catch {
    el.innerHTML = '<p class="setting-hint">서버 오류</p>';
  }
}

function renderAdminInvites(invites) {
  const el = document.getElementById('adminInviteList');
  if (!el) return;

  if (!invites.length) {
    el.innerHTML = '<p class="setting-hint">생성된 초대장이 없습니다.</p>';
    return;
  }

  el.innerHTML = '';
  invites.forEach(inv => {
    const card     = document.createElement('div');
    const isActive = inv.status === 'active';
    card.className = 'invite-card invite-' + inv.status;

    const icon       = isActive ? '🟢' : inv.status === 'used' ? '🔴' : '⚫';
    const statusText = isActive
      ? '활성 — 미사용'
      : inv.status === 'used'
        ? `만료됨 · ${esc(inv.usedByName || '')} 사용`
        : '취소됨';
    const date = formatShortDateTime(inv.createdAt);

    card.innerHTML = `
      <span class="invite-status-icon">${icon}</span>
      <div class="invite-info">
        <span class="invite-token">${esc(inv.token)}</span>
        <span class="invite-meta">${statusText} · ${date}</span>
      </div>
      ${isActive ? `
        <div class="invite-actions">
          <button class="btn-approve btn-copy-inv" data-token="${esc(inv.token)}">복사</button>
          <button class="btn-reject btn-cancel-inv" data-token="${esc(inv.token)}">취소</button>
        </div>` : ''}
    `;

    // 복사
    card.querySelector('.btn-copy-inv')?.addEventListener('click', () => {
      const url = `${location.origin}/invite.html?code=${inv.token}`;
      navigator.clipboard.writeText(url).then(() => showToast('초대 링크가 복사되었습니다!'));
    });
    // 취소
    card.querySelector('.btn-cancel-inv')?.addEventListener('click', async () => {
      if (!confirm('이 초대장을 취소할까요?\n이미 공유된 링크는 더 이상 사용할 수 없게 됩니다.')) return;
      const r = await apiDelete(`/api/admin/invites/${inv.token}`);
      if (r.ok) { showToast('초대장이 취소되었습니다.'); loadAdminInvites(); }
      else showToast('취소 실패');
    });

    el.appendChild(card);
  });
}

async function loadAdminUsers() {
  const container = document.getElementById('adminTabUsers');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">불러오는 중…</div>';

  try {
    const resp = await fetch('/api/admin/users', {
      headers: { 'x-admin-password': adminPw }
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
      const dt = u.approvedAt ? formatShortDateTime(u.approvedAt) : '';
      html += `
        <div class="admin-user-card approved">
          <div class="admin-user-info">
            <div class="admin-user-name">${esc(u.name)}</div>
            <div class="admin-user-meta">승인: ${dt}</div>
          </div>
          <div class="admin-user-actions">
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
      headers: { 'x-admin-password': adminPw },
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
      headers: { 'x-admin-password': adminPw },
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
      headers: { 'x-admin-password': adminPw },
    });
    if (resp.ok) { showToast('삭제되었습니다.'); loadAdminUsers(); }
    else showToast('삭제 실패');
  } catch { showToast('서버 오류'); }
}

async function loadAdminActivity() {
  const container = document.getElementById('adminTabActivity');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">불러오는 중…</div>';

  try {
    const resp = await fetch('/api/admin/activity', {
      headers: { 'x-admin-password': adminPw }
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

  // ── 등록 화면 ──
  const btnRegSubmit = document.getElementById('btnRegSubmit');
  if (btnRegSubmit) btnRegSubmit.addEventListener('click', submitRegistration);
  const regNameInput = document.getElementById('regNameInput');
  if (regNameInput) regNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitRegistration(); });

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

  // ── 초대코드 화면 ──
  document.getElementById('btnInviteVerify').addEventListener('click', verifyInvite);
  document.getElementById('inviteInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyInvite();
  });

  // ── 앱 잠금 화면 ──
  document.getElementById('btnAppLockVerify').addEventListener('click', verifyAppLock);
  document.getElementById('appLockInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyAppLock();
  });

  // ── 월 이동 ──
  document.getElementById('btnPrev').addEventListener('click', () => {
    if (--currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });
  document.getElementById('btnNext').addEventListener('click', () => {
    if (++currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });
  document.getElementById('btnToday').addEventListener('click', () => {
    const n = new Date(); currentYear = n.getFullYear(); currentMonth = n.getMonth();
    renderCalendar();
  });

  // ── 미니 달력 ──
  document.getElementById('monthTitle').addEventListener('click', openMiniCal);
  document.getElementById('miniPrevYear').addEventListener('click', () => { miniCalYear--; renderMiniCal(); });
  document.getElementById('miniNextYear').addEventListener('click', () => { miniCalYear++; renderMiniCal(); });

  // ── 헤더 일정 추가 ──
  document.getElementById('btnAddHeader').addEventListener('click', () => {
    modalDate      = toDateStr(new Date());
    viewingEventId = null;
    editingEventId = null;
    document.getElementById('dayOverlay').classList.remove('hidden');
    openFormAdd(modalDate);
  });

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

  // ── 설정 ──
  document.getElementById('btnSettings').addEventListener('click', openSettingsWithAuth);
  document.getElementById('btnSettingsClose').addEventListener('click', closeSettings);
  document.getElementById('btnCancelSettings').addEventListener('click', closeSettings);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettingsData);
  document.getElementById('btnAddCategory').addEventListener('click', addCategory);

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

  // ── 초대 링크 복사 (새 토큰 자동 생성) ──
  document.getElementById('btnCopyInviteLink').addEventListener('click', async () => {
    if (!isAdminMode) {
      showToast('초대장은 관리자만 생성할 수 있습니다.');
      return;
    }
    await generateInvite();
  });

  // ── 모든 기기 접근 취소 ──
  // ── 초대장 생성 ──
  document.getElementById('btnGenerateInvite')?.addEventListener('click', generateInvite);
  document.getElementById('btnCopyGenerated')?.addEventListener('click', () => {
    const url = document.getElementById('generatedInviteUrl')?.textContent || '';
    if (url) navigator.clipboard.writeText(url).then(() => showToast('복사됨!'));
  });

  document.getElementById('btnRevokeAll').addEventListener('click', () => {
    if (!confirm('모든 기기의 초대코드 승인을 취소할까요?\n기존 기기는 새 초대코드를 입력해야 합니다.')) return;
    const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    document.getElementById('settingsInviteCode').value = newCode;
    showToast(`새 초대코드: ${newCode} — 저장 후 적용됩니다.`);
  });

  // ── 데이터 백업 내보내기 ──
  document.getElementById('btnExportData').addEventListener('click', () => {
    const backup = { events, settings: { categories: settings.categories, darkMode: settings.darkMode }, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jstudio_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast('백업 파일이 다운로드되었습니다.');
  });

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
        renderCalendar();
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

  // ── ESC ──
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeDayModal();
    closeSettings();
    closeMiniCal();
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
