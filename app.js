/* ═══════════════════════════════════════════════
   센터 캘린더 v3 – app.js
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

// ── 동기화 상태 ───────────────────────────────────
let storedInviteCode = '';  // localStorage에 저장된 초대코드
let syncEnabled      = false; // 서버 동기화 가능 여부
let syncTimer        = null;  // 디바운스 타이머

function setSyncStatus(state, text) {
  const dot  = document.getElementById('headerSyncDot');
  const sdot = document.getElementById('syncDot');
  const stxt = document.getElementById('syncStatusText');
  if (dot)  { dot.className  = 'header-sync-dot ' + state; }
  if (sdot) { sdot.className = 'sync-dot ' + state; }
  if (stxt && text) stxt.textContent = text;
}

// ── 서버 API 헬퍼 ─────────────────────────────────
async function apiGet(path) {
  const resp = await fetch(path, {
    headers: storedInviteCode ? { 'x-invite-code': storedInviteCode } : {}
  });
  return resp;
}

async function apiPost(path, body) {
  const resp = await fetch(path, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/json',
      'x-invite-code':  storedInviteCode,
    },
    body: JSON.stringify(body),
  });
  return resp;
}

// ── 상태 ──────────────────────────────────────────
let currentYear, currentMonth;
let miniCalYear   = 0;

// 날짜 팝업 상태
let modalDate      = null;   // 현재 팝업에 표시 중인 날짜
let viewingEventId = null;   // 상세 뷰에서 보고 있는 이벤트 ID
let editingEventId = null;   // 폼 뷰에서 수정 중인 이벤트 ID
let formPrevView   = 'list'; // 폼에서 취소 시 돌아갈 뷰

// 설정 상태
let settingsUnlocked = false;
let settingsDraft    = null;
let savedSel         = null;  // 리치 에디터 selection 복원용

let events   = [];
let settings = {
  password:   '',
  darkMode:   false,
  categories: DEFAULT_CATS.map(c => ({ ...c })),
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

// ═════════════════════════════════════════════════
// 초기화
// ═════════════════════════════════════════════════
async function init() {
  const now   = new Date();
  currentYear = now.getFullYear();
  currentMonth= now.getMonth();
  miniCalYear = currentYear;

  // 로컬 데이터 먼저 로드 (오프라인 대비)
  loadAll();
  applyTheme(settings.darkMode);

  // UI 먼저 그리기
  renderCalendar();
  bindStaticEvents();
  setupRichEditor();

  // URL 파라미터로 넘어온 초대코드 자동 처리 (초대 페이지 → 앱 열기 버튼)
  const urlParams = new URLSearchParams(window.location.search);
  const urlInvite = urlParams.get('invite');
  if (urlInvite) {
    localStorage.setItem('cc_invite', urlInvite);
    window.history.replaceState({}, '', window.location.pathname);
  }

  // 저장된 초대코드 불러오기
  storedInviteCode = localStorage.getItem('cc_invite') || '';

  // 서버 동기화 시도
  setSyncStatus('syncing', '서버 연결 중…');
  try {
    const resp = await apiGet('/api/sync');

    if (resp.status === 401) {
      // 초대코드 필요
      setSyncStatus('error', '초대코드 필요');
      showInviteScreen();
      return;
    }

    if (resp.ok) {
      const data = await resp.json();
      syncEnabled = true;

      // 서버 데이터로 덮어쓰기
      events = data.events || [];
      settings.categories = data.categories || settings.categories;
      settings.darkMode   = data.darkMode   ?? settings.darkMode;
      // 초대코드 갱신 (관리자 확인용)
      if (data.inviteCode !== undefined)
        localStorage.setItem('cc_invite_current', data.inviteCode);

      saveEvents();
      saveSettings();
      applyTheme(settings.darkMode);
      renderCalendar();
      setSyncStatus('online', '✅ 동기화됨 — 모든 기기에서 동일한 데이터');
    }
  } catch {
    // 오프라인 → 로컬 데이터 사용
    syncEnabled = false;
    setSyncStatus('offline', '⚠️ 오프라인 — 로컬 데이터 사용 중');
  }

  // 비밀번호 잠금
  if (settings.password) showAppLock();
}

// ── 초대코드 화면 ─────────────────────────────────
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
      // 승인 후 재초기화
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
function syncEventsToServer() {
  if (!syncEnabled) return;
  clearTimeout(syncTimer);
  setSyncStatus('syncing', '동기화 중…');
  syncTimer = setTimeout(async () => {
    try {
      await apiPost('/api/sync/events', { events });
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
    // 화면 흔들기 애니메이션
    const card = document.querySelector('.app-lock-card');
    card.style.animation = 'none';
    card.offsetHeight; // reflow
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

    // 날짜 숫자
    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = d;
    if (dateStr === todayStr) numEl.style.color = 'var(--accent)';
    else if (dow === 0)       numEl.style.color = 'var(--sunday)';
    else if (dow === 6)       numEl.style.color = 'var(--saturday)';
    cell.appendChild(numEl);

    // 이벤트 칩
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

/** 날짜 팝업 열기 (기본: 목록 뷰) */
function openDayModal(dateStr) {
  modalDate      = dateStr;
  viewingEventId = null;
  editingEventId = null;
  document.getElementById('dayOverlay').classList.remove('hidden');
  switchDayView('list');
}

/** 날짜 팝업 닫기 */
function closeDayModal() {
  document.getElementById('dayOverlay').classList.add('hidden');
  modalDate      = null;
  viewingEventId = null;
  editingEventId = null;
}

/** 뷰 전환 핵심 함수 */
function switchDayView(view) {
  // 모든 뷰 숨기고 대상만 활성화
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

/** 뒤로 / 취소 버튼 공통 핸들러 */
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
    </div>` : ''}`;
}

// ── 뷰 3 : 폼 ────────────────────────────────────

/** 새 일정 추가 폼 열기 */
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

/** 기존 일정 수정 폼 열기 */
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

/** 유형 버튼 렌더링 */
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

  if (editingEventId) {
    const idx = events.findIndex(e => e.id === editingEventId);
    if (idx !== -1) events[idx] = { ...events[idx], date, title, time, desc, type };
    showToast('일정이 수정되었습니다.');
    viewingEventId = editingEventId;
    editingEventId = null;
    modalDate      = date;   // 날짜가 바뀌었을 수도 있으므로 갱신
    switchDayView('detail'); // 수정 후 → 상세로 이동
  } else {
    events.push({ id: crypto.randomUUID(), date, title, time, desc, type });
    showToast('일정이 추가되었습니다.');
    editingEventId = null;
    modalDate      = date;
    switchDayView('list');   // 추가 후 → 목록으로 이동
  }

  saveEvents();
  renderCalendar();
}

/** 현재 상세 중인 일정 삭제 */
function deleteCurrentEvent() {
  if (!viewingEventId) return;
  if (!confirm('이 일정을 삭제할까요?')) return;
  events = events.filter(e => e.id !== viewingEventId);
  viewingEventId = null;
  saveEvents();
  renderCalendar();
  switchDayView('list');
  showToast('일정이 삭제되었습니다.');
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
  document.getElementById('darkModeToggle').checked  = settingsDraft.darkMode;
  document.getElementById('settingsCurrentPw').value = '';
  document.getElementById('settingsNewPw').value     = '';

  // 초대코드 표시 (서버에서 가져온 값)
  const inviteField = document.getElementById('settingsInviteCode');
  if (inviteField) {
    inviteField.value = localStorage.getItem('cc_invite_current') || storedInviteCode || '';
  }

  // 동기화 상태 표시
  const sdot = document.getElementById('syncDot');
  const stxt = document.getElementById('syncStatusText');
  if (sdot) sdot.className = 'sync-dot ' + (syncEnabled ? 'online' : 'offline');
  if (stxt) stxt.textContent = syncEnabled
    ? '✅ 서버 연결됨 — 모든 기기 동일 데이터'
    : '⚠️ 오프라인 — 로컬 데이터만 저장됨';

  renderCategoryList();
  document.getElementById('settingsOverlay').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.add('hidden');
  settingsDraft    = null;
  settingsUnlocked = false;
  applyTheme(settings.darkMode); // 미리보기 취소 시 원래 테마 복원
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
  // 비밀번호 처리
  const curPw = document.getElementById('settingsCurrentPw').value;
  const newPw = document.getElementById('settingsNewPw').value;
  if (curPw !== '' || newPw !== '') {
    if (settings.password && curPw !== settings.password) {
      showToast('현재 비밀번호가 올바르지 않습니다.'); return;
    }
    settingsDraft.password = newPw; // 빈칸이면 비밀번호 삭제
  }

  settingsDraft.darkMode   = document.getElementById('darkModeToggle').checked;
  settingsDraft.inviteCode = (document.getElementById('settingsInviteCode')?.value ?? '').trim();

  settings = settingsDraft;
  saveSettings();
  applyTheme(settings.darkMode);

  // 서버에 공유 설정 동기화 (초대코드 포함)
  syncSettingsToServer(settings);

  // 초대코드가 바뀌면 이 기기의 승인도 갱신
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

  // Bold
  document.querySelector('[data-cmd="bold"]').addEventListener('mousedown', e => {
    e.preventDefault();
    restoreSelection();
    document.execCommand('bold');
  });

  // 색상 팔레트 생성
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

  // 색상 버튼 토글
  document.querySelector('.color-btn').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    colorPalette.classList.toggle('hidden');
    emojiPalette.classList.add('hidden');
  });

  // 이모지 팔레트 생성
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

  // 이모지 버튼 토글
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

  // 목록 뷰 – 추가 버튼
  document.getElementById('btnListAdd').addEventListener('click', () => openFormAdd(modalDate));

  // 상세 뷰 – 수정 / 삭제
  document.getElementById('btnDetailEdit').addEventListener('click', () => openFormEdit(viewingEventId));
  document.getElementById('btnDetailDelete').addEventListener('click', deleteCurrentEvent);

  // 폼 뷰 – 취소 / 저장
  document.getElementById('btnFormCancel').addEventListener('click', handleDayBack);
  document.getElementById('btnFormSave').addEventListener('click', saveEvent);

  // ── 설정 ──
  document.getElementById('btnSettings').addEventListener('click', openSettingsWithAuth);
  document.getElementById('btnSettingsClose').addEventListener('click', closeSettings);
  document.getElementById('btnCancelSettings').addEventListener('click', closeSettings);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettingsData);
  document.getElementById('btnAddCategory').addEventListener('click', addCategory);

  // ── 초대 링크 복사 ──
  document.getElementById('btnCopyInviteLink').addEventListener('click', () => {
    const code = (document.getElementById('settingsInviteCode')?.value || '').trim()
              || (localStorage.getItem('cc_invite_current') || '');
    if (!code) {
      showToast('먼저 초대코드를 입력하고 저장하세요.');
      return;
    }
    const inviteUrl = `${location.origin}/invite.html?code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast('초대 링크가 복사되었습니다! 카카오톡·이메일로 보내세요.');
    });
  });

  // ── 모든 기기 접근 취소 ──
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
    // 미니 달력
    if (!document.getElementById('miniCalPopup').classList.contains('hidden') &&
        !e.target.closest('#miniCalPopup') &&
        e.target.id !== 'monthTitle') {
      closeMiniCal();
    }
    // 팔레트들
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
