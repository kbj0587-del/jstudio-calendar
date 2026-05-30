/* ═══════════════════════════════════════════════
   센터 캘린더 v4 – app.js
   ═══════════════════════════════════════════════ */

// ── 상수 ──────────────────────────────────────────
const SYSTEM_CAT_IDS = ['daeggang','incentive','trial','review','classnoshow','sales','consult'];
// 일정 상태(취소/변경)를 지원하는 카테고리
const STATUS_CAT_IDS = ['trial','review','consult'];

const DEFAULT_CATS = [
  { id: 'daeggang',    name: '대강',      color: '#e07b20', system: true },
  { id: 'incentive',  name: '인센티브',   color: '#7c3aed', system: true },
  { id: 'trial',      name: '체험수업',   color: '#0891b2', system: true },
  { id: 'review',     name: '리뷰체험',   color: '#e91e8c', system: true },
  { id: 'classnoshow',name: '수업노쇼',   color: '#e03050', system: true },
  { id: 'sales',      name: '매출/등록',  color: '#059669', system: true },
  { id: 'consult',    name: '상담',       color: '#0d9488', system: true },
  { id: 'noshow',     name: '노쇼',      color: '#e03050' },
  { id: 'makeup',     name: '보강',      color: '#1a8fc7' },
  { id: 'info',       name: '중요정보',   color: '#c88a00' },
  { id: 'other',      name: '기타',      color: '#2e9e4f' },
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

// ── 공휴일 ────────────────────────────────────────
const holidaysMap    = {};  // { 'YYYY-MM-DD': '공휴일명' }
const holidaysLoaded = {};  // { year: true }

async function loadHolidaysForYear(year) {
  if (holidaysLoaded[year]) return;
  holidaysLoaded[year] = true; // 중복 호출 방지
  try {
    const resp = await fetch(`/api/holidays/${year}`);
    if (!resp.ok) return;
    const data = await resp.json();
    (data.holidays || []).forEach(h => { holidaysMap[h.date] = h.name; });
    renderCurrentView(); // 로드 후 재렌더
  } catch { /* 오프라인 — 무시 */ }
}

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
let incentiveDefaults = { trialAmount: 10000, consultRate: 5 }; // 서버에서 로드됨

let settings = {
  password:     '',
  lockDisabled: false,
  darkMode:     false,
  categories:   DEFAULT_CATS.map(c => ({ ...c })),
};

// ── 저장 / 로드 ───────────────────────────────────
function ensureSystemCats() {
  // 시스템 카테고리가 항상 맨 앞에 존재하도록 보장
  const sysDefs = DEFAULT_CATS.filter(c => c.system);
  sysDefs.slice().reverse().forEach(def => {
    const existing = settings.categories.find(c => c.id === def.id);
    if (!existing) {
      settings.categories.unshift({ ...def });
    } else {
      existing.name   = def.name;   // 이름 고정
      existing.system = true;
    }
  });
}

async function loadIncentiveDefaults() {
  try {
    const resp = await apiGet('/api/admin/incentive-defaults');
    if (resp.ok) {
      const data = await resp.json();
      if (data.defaults) incentiveDefaults = { ...incentiveDefaults, ...data.defaults };
    }
  } catch { /* 오프라인 — 기본값 유지 */ }
}

function loadAll() {
  try { events = JSON.parse(localStorage.getItem('cc_events')) || []; } catch { events = []; }
  try {
    const s = JSON.parse(localStorage.getItem('cc_settings'));
    if (s) {
      settings = { ...settings, ...s };
      if (!settings.categories?.length) settings.categories = DEFAULT_CATS.map(c => ({ ...c }));
    }
  } catch {}
  ensureSystemCats(); // 시스템 카테고리 항상 보장
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

// ── 시스템 카테고리 extraFields 헬퍼 ──────────────
function collectExtraFields(type) {
  const f = {};
  switch (type) {
    case 'daeggang':
      f.instructorA = document.getElementById('fInstructorA')?.value.trim() || '';
      f.instructorB = document.getElementById('fInstructorB')?.value.trim() || '';
      break;
    case 'incentive': {
      const iType = document.querySelector('input[name="incentiveType"]:checked')?.value || '체험등록';
      f.incentiveType = iType;
      f.staffName     = document.getElementById('fStaffName')?.value.trim() || '';
      f.memberName    = document.getElementById('fMemberName')?.value.trim() || '';
      if (iType === '체험등록') {
        const perAmt    = parseAmt('fTrialIncentiveAmt');
        const persons   = Math.max(1, Number(document.getElementById('fTrialPersonCount')?.value) || 1);
        const totalAmt  = perAmt * persons;
        f.trialIncentiveAmt = perAmt;
        f.personCount       = persons;
        f.incentiveAmt      = String(totalAmt);
      } else {
        const regAmt  = parseAmt('fRegisterAmt');
        const persons = Math.max(1, Number(document.getElementById('fConsultPersonCount')?.value) || 1);
        const rate    = Number(document.getElementById('fConsultRate')?.value) || incentiveDefaults.consultRate;
        const totalReg = regAmt * persons;
        const calcAmt  = Math.round(totalReg * rate / 100);
        f.registerAmt         = regAmt;
        f.personCount         = persons;
        f.consultRate         = rate;
        f.consultIncentiveAmt = calcAmt;
        f.incentiveAmt        = String(calcAmt);
      }
      // 매출 연동 정보
      const salesLink = document.getElementById('fIncSalesLink');
      if (salesLink?.checked) {
        f.linkedSales = {
          regType:  document.querySelector('input[name="incSalesRegType"]:checked')?.value  || '신규',
          duration: document.querySelector('input[name="incSalesDuration"]:checked')?.value || '1개월',
          freq:     document.querySelector('input[name="incSalesFreq"]:checked')?.value     || '주3회',
          payment:  parseAmt('fIncSalesPayment'),
        };
      }
      break;
    }
    case 'trial': {
      f.clientName    = document.getElementById('fClientName')?.value.trim() || '';
      f.clientContact = document.getElementById('fClientContact')?.value.trim() || '';
      f.noshow        = document.getElementById('fNoshow')?.checked || false;
      f.reserved      = document.getElementById('fReserved')?.checked || false;
      f.reserveName   = document.getElementById('fReserveName')?.value.trim() || '';
      f.status        = document.querySelector('input[name="apptStatus"]:checked')?.value || '';
      const trialFee  = parseAmt('fTrialFee');
      const persons   = Math.max(1, Number(document.getElementById('fPersonCount')?.value) || 1);
      f.trialFee      = trialFee;
      f.personCount   = persons;
      f.trialTotal    = trialFee > 0 ? trialFee * persons : 0;
      // 체험 후 등록
      const trialRegLink = document.getElementById('fTrialRegLink');
      if (trialRegLink?.checked) {
        const trLType = document.querySelector('input[name="trialLinkedLessonType"]:checked')?.value || '그룹';
        const trIsP   = trLType === '개인레슨';
        f.linkedRegistration = {
          regType:      document.querySelector('input[name="trialLinkedRegType"]:checked')?.value || '신규',
          lessonType:   trLType,
          duration:     trIsP ? '' : (document.querySelector('input[name="trialLinkedDuration"]:checked')?.value || '3개월'),
          freq:         trIsP ? '' : (document.querySelector('input[name="trialLinkedFreq"]:checked')?.value || '주3회'),
          sessionCount: trIsP ? (Number(document.getElementById('fTrialLinkedSessionCount')?.value) || 0) : 0,
          payment:      parseAmt('fTrialLinkedPayment'),
        };
        const trialIncLink = document.getElementById('fTrialIncLink');
        if (trialIncLink?.checked) {
          f.linkedIncentive = {
            staffName:  document.getElementById('fTrialLinkedStaff')?.value.trim() || '',
            memberName: document.getElementById('fTrialLinkedMember')?.value.trim() || '',
            amt:        parseAmt('fTrialLinkedIncAmt'),
          };
        } else { delete f.linkedIncentive; }
      } else { delete f.linkedRegistration; delete f.linkedIncentive; }
      break;
    }
    case 'review':
      f.clientName    = document.getElementById('fClientName')?.value.trim() || '';
      f.clientContact = document.getElementById('fClientContact')?.value.trim() || '';
      f.noshow        = document.getElementById('fNoshow')?.checked || false;
      f.reserved      = document.getElementById('fReserved')?.checked || false;
      f.reserveName   = document.getElementById('fReserveName')?.value.trim() || '';
      f.status        = document.querySelector('input[name="apptStatus"]:checked')?.value || '';
      break;
    case 'consult': {
      f.clientName    = document.getElementById('fClientName')?.value.trim() || '';
      f.clientContact = document.getElementById('fClientContact')?.value.trim() || '';
      f.status        = document.querySelector('input[name="apptStatus"]:checked')?.value || '';
      // 상담 후 등록
      const consultRegLink = document.getElementById('fConsultRegLink');
      if (consultRegLink?.checked) {
        const csLType = document.querySelector('input[name="consultLinkedLessonType"]:checked')?.value || '그룹';
        const csIsP   = csLType === '개인레슨';
        f.linkedRegistration = {
          regType:      document.querySelector('input[name="consultLinkedRegType"]:checked')?.value || '신규',
          lessonType:   csLType,
          duration:     csIsP ? '' : (document.querySelector('input[name="consultLinkedDuration"]:checked')?.value || '3개월'),
          freq:         csIsP ? '' : (document.querySelector('input[name="consultLinkedFreq"]:checked')?.value || '주3회'),
          sessionCount: csIsP ? (Number(document.getElementById('fConsultLinkedSessionCount')?.value) || 0) : 0,
          payment:      parseAmt('fConsultLinkedPayment'),
        };
        const consultIncLink = document.getElementById('fConsultIncLink');
        if (consultIncLink?.checked) {
          f.linkedIncentive = {
            staffName:  document.getElementById('fConsultLinkedStaff')?.value.trim() || '',
            memberName: document.getElementById('fConsultLinkedMember')?.value.trim() || '',
            amt:        parseAmt('fConsultLinkedIncAmt'),
          };
        } else { delete f.linkedIncentive; }
      } else { delete f.linkedRegistration; delete f.linkedIncentive; }
      break;
    }
    case 'classnoshow':
      f.studentName    = document.getElementById('fStudentName')?.value.trim() || '';
      f.studentContact = document.getElementById('fStudentContact')?.value.trim() || '';
      f.className      = document.getElementById('fClassName')?.value.trim() || '';
      break;
    case 'sales': {
      f.clientName  = document.getElementById('fSalesClientName')?.value.trim() || '';
      f.regType     = document.querySelector('input[name="salesRegType"]:checked')?.value || '신규';
      f.lessonType  = document.querySelector('input[name="salesLessonType"]:checked')?.value || '그룹';
      f.payment     = parseAmt('fSalesPayment');
      if (f.lessonType === '개인레슨') {
        f.sessionCount = Number(document.getElementById('fSalesSessionCount')?.value) || 0;
        f.duration     = '';
        f.freq         = '';
      } else {
        f.duration     = document.querySelector('input[name="salesDuration"]:checked')?.value || '1개월';
        f.freq         = document.querySelector('input[name="salesFreq"]:checked')?.value || '주3회';
        f.sessionCount = 0;
      }
      break;
    }
  }
  return f;
}

function autoTitle(type, f) {
  switch (type) {
    case 'daeggang':
      return (f.instructorA || f.instructorB)
        ? `${f.instructorA || '?'} → ${f.instructorB || '?'} 대강`
        : '대강';
    case 'incentive': {
      const iType  = f.incentiveType || '체험등록';
      const staff  = f.staffName  ? ` · ${f.staffName}`  : '';
      const member = f.memberName ? ` · ${f.memberName}` : '';
      return `${iType}${staff}${member}`;
    }
    case 'trial': {
      const name = f.clientName || '체험수업';
      const cnt  = f.personCount || 1;
      return cnt > 1 ? `${name} 外 ${cnt - 1}명` : name;
    }
    case 'review':  return f.clientName || '리뷰체험';
    case 'consult': return f.clientName || '상담';
    case 'classnoshow': {
      const sName = f.studentName || '수업노쇼';
      const cls   = f.className   ? ` (${f.className})` : '';
      return `${sName}${cls}`;
    }
    case 'sales': {
      const name    = f.clientName || '매출등록';
      const isP     = f.lessonType === '개인레슨' || f.regType === '개인레슨';
      const effReg  = f.regType === '개인레슨' ? '신규' : (f.regType || '신규');
      const rtype   = ` · ${effReg}`;
      const ltype   = isP ? ' · 개인레슨' : (f.lessonType === '그룹' ? ' · 그룹' : '');
      const mem     = isP
        ? (f.sessionCount ? ` · ${f.sessionCount}회` : '')
        : (f.duration || f.freq) ? ` · ${f.duration||''}${f.freq ? ' '+f.freq : ''}` : '';
      const pay     = f.payment ? ` · ${Number(f.payment).toLocaleString()}원` : '';
      return `${name}${rtype}${ltype}${mem}${pay}`;
    }
    default: return '';
  }
}

// 시스템 카테고리는 extraFields로 제목을 재계산 (저장된 ev.title에 계산식이 들어있던 구버전 데이터 대응)
function getDisplayTitle(ev) {
  if (SYSTEM_CAT_IDS.includes(ev.type) && ev.extraFields) {
    return autoTitle(ev.type, ev.extraFields) || ev.title || '';
  }
  return ev.title || '';
}

function getChipText(ev) {
  const f = ev.extraFields;
  if (!f) return ev.title;
  switch (ev.type) {
    case 'daeggang':
      return f.instructorA ? `${f.instructorA}→${f.instructorB}` : ev.title;
    case 'incentive': {
      const iType  = f.incentiveType || '체험등록';
      const staff  = f.staffName  ? ` · ${f.staffName}`  : '';
      const member = f.memberName ? ` · ${f.memberName}` : '';
      return `${iType}${staff}${member}` || ev.title;
    }
    case 'trial': {
      const base = f.clientName || ev.title;
      const cnt  = f.personCount || 1;
      const ns   = f.noshow ? ' ⚠노쇼' : '';
      const res  = f.reserved ? (f.reserveName ? ` 📅${f.reserveName}` : ' 📅') : '';
      const st   = f.status === 'cancelled' ? ' 취소' : f.status === 'changed' ? ' 변경' : '';
      return (cnt > 1 ? `${base} 外${cnt - 1}명` : base) + ns + res + st;
    }
    case 'review':
      return (f.clientName || ev.title)
        + (f.noshow ? ' ⚠노쇼' : '')
        + (f.reserved ? (f.reserveName ? ` 📅${f.reserveName}` : ' 📅') : '')
        + (f.status === 'cancelled' ? ' 취소' : f.status === 'changed' ? ' 변경' : '');
    case 'consult':
      return (f.clientName || ev.title)
        + (f.status === 'cancelled' ? ' 취소' : f.status === 'changed' ? ' 변경' : '');
    case 'classnoshow': {
      const sName = f.studentName || ev.title;
      const cls   = f.className ? ` (${f.className})` : '';
      return `🚫${sName}${cls}`;
    }
    case 'sales': {
      const name = f.clientName || ev.title;
      const pay  = f.payment ? ` ${Number(f.payment).toLocaleString()}원` : '';
      return `${name}${pay}`;
    }
    default: return ev.title;
  }
}

function getExtraSummaryHtml(ev) {
  const f = ev.extraFields;
  if (!f) return '';
  switch (ev.type) {
    case 'daeggang':
      if (!f.instructorA && !f.instructorB) return '';
      return `<div class="lv-extra-info">🔄 ${esc(f.instructorA||'?')} → ${esc(f.instructorB||'?')}</div>`;
    case 'incentive': {
      const iType = f.incentiveType || '체험등록';
      const staff = f.staffName ? ` | ${esc(f.staffName)}` : '';
      if (!f.incentiveType && !f.staffName && !f.incentiveAmt) return '';
      let amtStr = '';
      if (iType === '체험등록') {
        const perAmt = f.trialIncentiveAmt || 0;
        const cnt    = f.personCount || 1;
        const total  = Number(f.incentiveAmt) || perAmt * cnt;
        if (perAmt > 0) {
          amtStr = cnt > 1
            ? ` | ${perAmt.toLocaleString()}×${cnt}=${total.toLocaleString()}원`
            : ` | ${total.toLocaleString()}원`;
        }
      } else {
        const reg  = f.registerAmt || 0;
        const cnt  = f.personCount || 1;
        const amt  = Number(f.incentiveAmt) || 0;
        const rate = f.consultRate !== undefined ? f.consultRate : incentiveDefaults.consultRate;
        if (reg > 0) {
          const totalReg = reg * cnt;
          amtStr = cnt > 1
            ? ` | ${reg.toLocaleString()}×${cnt}=${totalReg.toLocaleString()}원 → ${rate}% = ${amt.toLocaleString()}원`
            : ` | ${reg.toLocaleString()}원 → ${rate}% = ${amt.toLocaleString()}원`;
        } else if (amt > 0) {
          amtStr = ` | ${amt.toLocaleString()}원`;
        }
      }
      return `<div class="lv-extra-info">💰 ${esc(iType)}${staff}${amtStr}</div>`;
    }
    case 'trial': {
      if (!f.clientName && !f.clientContact) return '';
      const contact = f.clientContact ? ` | ${esc(f.clientContact)}` : '';
      const noshow  = f.noshow ? ` <span class="lv-noshow-tag">노쇼</span>` : '';
      const cnt     = f.personCount || 1;
      const cntStr  = cnt > 1 ? ` | ${cnt}명` : '';
      const feeStr  = f.trialTotal > 0 ? ` | ${f.trialTotal.toLocaleString()}원` : '';
      const regTag  = f.linkedRegistration ? ` <span class="lv-reg-tag">✅등록</span>` : '';
      const incTag  = f.linkedIncentive ? ` <span class="lv-inc-tag">💜인센티브</span>` : '';
      return `<div class="lv-extra-info${f.noshow ? ' lv-extra-noshow' : ''}">👤 ${esc(f.clientName||'-')}${contact}${cntStr}${feeStr}${noshow}${regTag}${incTag}</div>`;
    }
    case 'review': {
      if (!f.clientName && !f.clientContact) return '';
      const contact = f.clientContact ? ` | ${esc(f.clientContact)}` : '';
      const noshow  = f.noshow ? ` <span class="lv-noshow-tag">노쇼</span>` : '';
      return `<div class="lv-extra-info${f.noshow ? ' lv-extra-noshow' : ''}">👤 ${esc(f.clientName||'-')}${contact}${noshow}</div>`;
    }
    case 'consult': {
      if (!f.clientName && !f.clientContact && !f.linkedRegistration) return '';
      const contact  = f.clientContact ? ` | ${esc(f.clientContact)}` : '';
      const regTag   = f.linkedRegistration ? ` <span class="lv-reg-tag">✅등록</span>` : '';
      const incTag   = f.linkedIncentive ? ` <span class="lv-inc-tag">💜인센티브</span>` : '';
      return `<div class="lv-extra-info">🗣 ${esc(f.clientName||'-')}${contact}${regTag}${incTag}</div>`;
    }
    case 'classnoshow': {
      if (!f.studentName && !f.className) return '';
      const cls     = f.className ? ` | ${esc(f.className)}` : '';
      const contact = f.studentContact ? ` | ${esc(f.studentContact)}` : '';
      return `<div class="lv-extra-info lv-extra-noshow">🚫 ${esc(f.studentName||'-')}${cls}${contact}</div>`;
    }
    case 'sales': {
      if (!f.clientName && !f.payment) return '';
      const isP    = f.lessonType === '개인레슨' || f.regType === '개인레슨';
      const effReg = f.regType === '개인레슨' ? '신규' : (f.regType || '신규');
      const rtype  = ` | ${esc(effReg)}`;
      const ltype  = isP ? ' | 개인레슨' : (f.lessonType === '그룹' ? ' | 그룹' : '');
      const mem    = isP
        ? (f.sessionCount ? ` | ${f.sessionCount}회` : '')
        : (f.duration||f.freq) ? ` | ${esc((f.duration||'')+(f.freq?' '+f.freq:''))}` : '';
      const pay    = f.payment ? ` | ${Number(f.payment).toLocaleString()}원` : '';
      return `<div class="lv-extra-info lv-extra-sales">💵 ${esc(f.clientName||'-')}${rtype}${ltype}${mem}${pay}</div>`;
    }
    default: return '';
  }
}

function getExtraDetailHtml(ev) {
  const f = ev.extraFields;
  if (!f) return '';
  switch (ev.type) {
    case 'daeggang':
      return `
        <div class="detail-extra-section">
          <div class="detail-label">대강 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">원담당 강사 (A)</span>
            <span class="detail-extra-val">${esc(f.instructorA || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">대강 진행 강사 (B)</span>
            <span class="detail-extra-val">${esc(f.instructorB || '-')}</span>
          </div>
        </div>`;
    case 'incentive': {
      const iType = f.incentiveType || '체험등록';
      let extraRows = '';
      if (iType === '체험등록') {
        const perAmt = f.trialIncentiveAmt || Number(f.incentiveAmt) || 0;
        const cnt    = f.personCount || 1;
        const total  = Number(f.incentiveAmt) || perAmt * cnt;
        const amtStr = cnt > 1
          ? `${perAmt.toLocaleString()}원 × ${cnt}명 = <strong>${total.toLocaleString()}원</strong>`
          : `${total.toLocaleString()}원`;
        extraRows = `
          <div class="detail-extra-row">
            <span class="detail-extra-label">담당 강사</span>
            <span class="detail-extra-val">${esc(f.staffName || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">등록자 이름</span>
            <span class="detail-extra-val">${esc(f.memberName || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">인원</span>
            <span class="detail-extra-val">${cnt}명</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">인센티브</span>
            <span class="detail-extra-val detail-amt">${amtStr}</span>
          </div>`;
      } else {
        const rate    = f.consultRate !== undefined ? f.consultRate : incentiveDefaults.consultRate;
        const reg     = Number(f.registerAmt) || 0;
        const cnt     = f.personCount || 1;
        const totalReg= reg * cnt;
        const amt     = Number(f.incentiveAmt) || 0;
        const regStr  = reg > 0
          ? (cnt > 1
              ? `${reg.toLocaleString()}원 × ${cnt}명 = <strong>${totalReg.toLocaleString()}원</strong>`
              : `${reg.toLocaleString()}원`)
          : '-';
        const amtStr  = amt > 0 ? `${rate}% = <strong>${amt.toLocaleString()}원</strong>` : '-';
        extraRows = `
          <div class="detail-extra-row">
            <span class="detail-extra-label">담당 상담자</span>
            <span class="detail-extra-val">${esc(f.staffName || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">등록자 이름</span>
            <span class="detail-extra-val">${esc(f.memberName || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">인원</span>
            <span class="detail-extra-val">${cnt}명</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">등록 금액</span>
            <span class="detail-extra-val detail-amt">${regStr}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">인센티브</span>
            <span class="detail-extra-val detail-amt">${amtStr}</span>
          </div>`;
      }
      const linkedSalesHtml = f.linkedSales ? (() => {
        const ls  = f.linkedSales;
        const mem = `${ls.duration||''}${ls.freq ? ' '+ls.freq : ''}`.trim();
        const pay = ls.payment ? Number(ls.payment).toLocaleString()+'원' : '-';
        return `
        <div class="detail-extra-section">
          <div class="detail-label">매출/등록 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">등록구분</span>
            <span class="detail-extra-val"><span class="sales-badge sales-badge--${ls.regType||'신규'}">${esc(ls.regType||'신규')}</span></span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">회원권</span>
            <span class="detail-extra-val">${esc(mem||'-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">결제금액</span>
            <span class="detail-extra-val detail-amt">${pay}</span>
          </div>
        </div>`;
      })() : '';

      return `
        <div class="detail-extra-section">
          <div class="detail-label">인센티브 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">구분</span>
            <span class="detail-extra-val">${esc(iType)}</span>
          </div>
          ${extraRows}
        </div>${linkedSalesHtml}`;
    }
    case 'trial': {
      const cnt        = f.personCount || 1;
      const noshowHtml = f.noshow ? `<span class="detail-noshow-badge">🚫 노쇼</span>` : '';
      const feeRow     = f.trialFee > 0 ? `
          <div class="detail-extra-row">
            <span class="detail-extra-label">체험 금액</span>
            <span class="detail-extra-val detail-amt">${f.trialFee.toLocaleString()}원 × ${cnt}명 = <strong>${(f.trialTotal || f.trialFee * cnt).toLocaleString()}원</strong></span>
          </div>` : '';
      const resBadge   = f.reserved
        ? `<span class="review-res-badge review-res-badge--yes">📅 예약완료</span>`
        : `<span class="review-res-badge review-res-badge--no">⬜ 미예약</span>`;
      const trialLinkedHtml = f.linkedRegistration ? (() => {
        const lr  = f.linkedRegistration;
        const isP = lr.lessonType === '개인레슨';
        const mem = isP
          ? (lr.sessionCount ? `${lr.sessionCount}회` : '-')
          : `${lr.duration||''}${lr.freq ? ' '+lr.freq : ''}`.trim() || '-';
        const pay = lr.payment ? Number(lr.payment).toLocaleString()+'원' : '-';
        const incHtml = f.linkedIncentive ? `
          <div class="detail-extra-section">
            <div class="detail-label">💜 인센티브 정보</div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">담당 강사</span>
              <span class="detail-extra-val">${esc(f.linkedIncentive.staffName||'-')}</span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">회원 이름</span>
              <span class="detail-extra-val">${esc(f.linkedIncentive.memberName||'-')}</span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">인센티브 금액</span>
              <span class="detail-extra-val detail-amt"><strong>${f.linkedIncentive.amt ? Number(f.linkedIncentive.amt).toLocaleString()+'원' : '-'}</strong></span>
            </div>
          </div>` : '';
        return `
          <div class="detail-extra-section">
            <div class="detail-label">✅ 등록 정보</div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">등록 구분</span>
              <span class="detail-extra-val"><span class="sales-reg-badge sales-reg-${lr.regType||'신규'}">${esc(lr.regType||'신규')}</span></span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">수업 유형</span>
              <span class="detail-extra-val"><span class="sales-reg-badge sales-lesson-${lr.lessonType||'그룹'}">${esc(lr.lessonType||'그룹')}</span></span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">${isP ? '수업 횟수' : '회원권'}</span>
              <span class="detail-extra-val">${esc(mem)}</span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">결제 금액</span>
              <span class="detail-extra-val detail-amt"><strong>${pay}</strong></span>
            </div>
          </div>${incHtml}`;
      })() : '';
      return `
        <div class="detail-extra-section">
          <div class="detail-label">체험수업 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">체험자 이름</span>
            <span class="detail-extra-val">${esc(f.clientName || '-')} ${noshowHtml}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">연락처</span>
            <span class="detail-extra-val">${esc(f.clientContact || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">인원</span>
            <span class="detail-extra-val">${cnt}명</span>
          </div>
          ${feeRow}
          <div class="detail-extra-row">
            <span class="detail-extra-label">수업 예약</span>
            <span class="detail-extra-val">${resBadge}</span>
          </div>
          ${f.reserved && f.reserveName ? `
          <div class="detail-extra-row">
            <span class="detail-extra-label">예약자 이름</span>
            <span class="detail-extra-val"><strong>${esc(f.reserveName)}</strong></span>
          </div>` : ''}
          ${f.status ? `
          <div class="detail-extra-row">
            <span class="detail-extra-label">일정 상태</span>
            <span class="detail-extra-val">${getStatusBadge(f.status)}</span>
          </div>` : ''}
        </div>${trialLinkedHtml}`;
    }
    case 'review': {
      const noshowHtml = f.noshow ? `<span class="detail-noshow-badge">🚫 노쇼</span>` : '';
      const resBadge   = f.reserved
        ? `<span class="review-res-badge review-res-badge--yes">📅 예약완료</span>`
        : `<span class="review-res-badge review-res-badge--no">⬜ 미예약</span>`;
      return `
        <div class="detail-extra-section">
          <div class="detail-label">리뷰체험 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">체험단 이름</span>
            <span class="detail-extra-val">${esc(f.clientName || '-')} ${noshowHtml}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">연락처</span>
            <span class="detail-extra-val">${esc(f.clientContact || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">수업 예약</span>
            <span class="detail-extra-val">${resBadge}</span>
          </div>
          ${f.reserved && f.reserveName ? `
          <div class="detail-extra-row">
            <span class="detail-extra-label">예약자 이름</span>
            <span class="detail-extra-val"><strong>${esc(f.reserveName)}</strong></span>
          </div>` : ''}
          ${f.status ? `
          <div class="detail-extra-row">
            <span class="detail-extra-label">일정 상태</span>
            <span class="detail-extra-val">${getStatusBadge(f.status)}</span>
          </div>` : ''}
        </div>`;
    }
    case 'consult': {
      const consultLinkedHtml = f.linkedRegistration ? (() => {
        const lr  = f.linkedRegistration;
        const isP = lr.lessonType === '개인레슨';
        const mem = isP
          ? (lr.sessionCount ? `${lr.sessionCount}회` : '-')
          : `${lr.duration||''}${lr.freq ? ' '+lr.freq : ''}`.trim() || '-';
        const pay = lr.payment ? Number(lr.payment).toLocaleString()+'원' : '-';
        const incHtml = f.linkedIncentive ? `
          <div class="detail-extra-section">
            <div class="detail-label">💜 인센티브 정보</div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">담당 강사</span>
              <span class="detail-extra-val">${esc(f.linkedIncentive.staffName||'-')}</span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">회원 이름</span>
              <span class="detail-extra-val">${esc(f.linkedIncentive.memberName||'-')}</span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">인센티브 금액</span>
              <span class="detail-extra-val detail-amt"><strong>${f.linkedIncentive.amt ? Number(f.linkedIncentive.amt).toLocaleString()+'원' : '-'}</strong></span>
            </div>
          </div>` : '';
        return `
          <div class="detail-extra-section">
            <div class="detail-label">✅ 등록 정보</div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">등록 구분</span>
              <span class="detail-extra-val"><span class="sales-reg-badge sales-reg-${lr.regType||'신규'}">${esc(lr.regType||'신규')}</span></span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">수업 유형</span>
              <span class="detail-extra-val"><span class="sales-reg-badge sales-lesson-${lr.lessonType||'그룹'}">${esc(lr.lessonType||'그룹')}</span></span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">${isP ? '수업 횟수' : '회원권'}</span>
              <span class="detail-extra-val">${esc(mem)}</span>
            </div>
            <div class="detail-extra-row">
              <span class="detail-extra-label">결제 금액</span>
              <span class="detail-extra-val detail-amt"><strong>${pay}</strong></span>
            </div>
          </div>${incHtml}`;
      })() : '';
      return `
        <div class="detail-extra-section">
          <div class="detail-label">상담 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">이름</span>
            <span class="detail-extra-val">${esc(f.clientName || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">연락처</span>
            <span class="detail-extra-val">${esc(f.clientContact || '-')}</span>
          </div>
          ${f.status ? `
          <div class="detail-extra-row">
            <span class="detail-extra-label">일정 상태</span>
            <span class="detail-extra-val">${getStatusBadge(f.status)}</span>
          </div>` : ''}
        </div>${consultLinkedHtml}`;
    }
    case 'classnoshow':
      return `
        <div class="detail-extra-section">
          <div class="detail-label">🚫 수업노쇼 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">수강생 이름</span>
            <span class="detail-extra-val">${esc(f.studentName || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">연락처</span>
            <span class="detail-extra-val">${esc(f.studentContact || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">수업명</span>
            <span class="detail-extra-val">${esc(f.className || '-')}</span>
          </div>
        </div>`;
    case 'sales': {
      const isP    = f.lessonType === '개인레슨' || f.regType === '개인레슨';
      const effReg = f.regType === '개인레슨' ? '신규' : (f.regType || '신규');
      const lType  = isP ? '개인레슨' : (f.lessonType || '그룹');
      const memRow = isP
        ? `<div class="detail-extra-row">
            <span class="detail-extra-label">수업 횟수</span>
            <span class="detail-extra-val">${f.sessionCount ? f.sessionCount+'회' : '-'}</span>
          </div>`
        : `<div class="detail-extra-row">
            <span class="detail-extra-label">회원권</span>
            <span class="detail-extra-val">${esc(`${f.duration||'-'} ${f.freq||''}`.trim())}</span>
          </div>`;
      return `
        <div class="detail-extra-section">
          <div class="detail-label">💵 매출 정보</div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">고객 이름</span>
            <span class="detail-extra-val">${esc(f.clientName || '-')}</span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">등록 구분</span>
            <span class="detail-extra-val">
              <span class="sales-reg-badge sales-reg-${effReg}">${esc(effReg)}</span>
            </span>
          </div>
          <div class="detail-extra-row">
            <span class="detail-extra-label">수업 유형</span>
            <span class="detail-extra-val">
              <span class="sales-reg-badge sales-lesson-${lType}">${esc(lType)}</span>
            </span>
          </div>
          ${memRow}
          <div class="detail-extra-row">
            <span class="detail-extra-label">결제 금액</span>
            <span class="detail-extra-val detail-amt"><strong>${f.payment ? Number(f.payment).toLocaleString()+'원' : '-'}</strong></span>
          </div>
        </div>`;
    }
    default: return '';
  }
}
function hexToRgba(hex, a) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  const n = parseInt(hex, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// ── 일정 상태 헬퍼 ───────────────────────────────
function getStatusBadge(status) {
  if (status === 'cancelled') return `<span class="appt-status-badge appt-cancelled">❌ 취소</span>`;
  if (status === 'changed')   return `<span class="appt-status-badge appt-changed">🔄 일정변경</span>`;
  return '';
}
function renderStatusFieldHtml(status) {
  return [['','정상'],['changed','일정변경'],['cancelled','취소']].map(([v, l]) =>
    `<label class="sales-radio-label${(status||'')=== v?' active':''}">
      <input type="radio" name="apptStatus" value="${v}" ${(status||'')=== v?'checked':''}/>
      <span>${l}</span>
    </label>`
  ).join('');
}
function bindStatusRadios(container) {
  container.querySelectorAll('input[name="apptStatus"]').forEach(r => {
    r.addEventListener('change', () => {
      container.querySelectorAll('.status-radio-grp .sales-radio-label').forEach(l => l.classList.remove('active'));
      r.closest('.sales-radio-label')?.classList.add('active');
    });
  });
}

// ── 금액 입력: 천단위 콤마 ────────────────────────
function parseAmt(id) {
  const el = document.getElementById(id);
  return el ? (Number(el.value.replace(/,/g, '')) || 0) : 0;
}
function initAmtInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // 초기값 포맷
  const raw = el.value.replace(/,/g, '');
  if (raw && !isNaN(raw) && raw !== '') el.value = Number(raw).toLocaleString('ko-KR');
  if (el.readOnly) return;   // readonly(자동계산)는 이벤트 불필요
  el.addEventListener('input', () => {
    const digits = el.value.replace(/[^0-9]/g, '');
    el.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  });
}
// 콤마 포함 금액을 HTML value 속성용 문자열로 반환
function fmtAmt(v) {
  const n = Number(v);
  return (v !== '' && v !== undefined && v !== null && !isNaN(n) && n > 0)
    ? n.toLocaleString('ko-KR') : '';
}

// ── 전화번호: 자동 하이픈 ────────────────────────
function formatTel(d) {
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 6) return `${d.slice(0,2)}-${d.slice(2)}`;
    return `${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6,10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0,3)}-${d.slice(3)}`;
  return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7,11)}`;
}
function initTelInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const raw = el.value.replace(/[^0-9]/g, '');
  if (raw) el.value = formatTel(raw);
  el.addEventListener('input', () => {
    const digits = el.value.replace(/[^0-9]/g, '');
    el.value = formatTel(digits);
  });
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
    if (savedUsername && savedPin) {
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
          // 자동 로그인 실패 → 수동 로그인 화면
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
              ensureSystemCats(); // 재로그인 후에도 시스템 카테고리 보장
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
      ensureSystemCats(); // 서버 데이터로 덮어쓴 뒤에도 시스템 카테고리 보장

      if ((isAdminMode || isSubAdmin) && data.pendingCount > 0) {
        pendingBadge = data.pendingCount;
        updateAdminBadge();
      }

      saveEvents();
      saveSettings();
      applyTheme(settings.darkMode);
      renderCurrentView();
      setSyncStatus('online', '✅ 동기화됨 — 모든 기기에서 동일한 데이터');
      // 공휴일 + 인센티브 기본값 백그라운드 로드
      loadHolidaysForYear(currentYear);
      loadHolidaysForYear(currentYear + 1);
      loadIncentiveDefaults();
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

    // 로그인 성공 — 세션 유지를 위해 자격증명 항상 저장
    const user = data.user;

    localStorage.setItem('cc_user_id',   user.id);
    localStorage.setItem('cc_user_name', user.name);
    localStorage.setItem('cc_username',  username);
    localStorage.setItem('cc_pin',       pin);
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

// ── 어코디언 토글 ────────────────────────────────
function toggleAccordion(bodyId, headerEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const isNowCollapsed = body.classList.toggle('acc-collapsed');
  const chev = headerEl?.querySelector('.acc-chevron');
  if (chev) chev.style.transform = isNowCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
}

// ── 월별 인센티브 정산 요약 ───────────────────────
function renderIncentiveSummary(monthStr) {
  const incEvents = events.filter(ev =>
    ev.type === 'incentive' && ev.date.startsWith(monthStr) && ev.extraFields
  );
  // 체험수업/상담에 연결된 인센티브 이벤트
  const regIncEvents = events.filter(ev =>
    (ev.type === 'trial' || ev.type === 'consult') &&
    ev.date.startsWith(monthStr) && ev.extraFields?.linkedIncentive
  );
  if (!incEvents.length && !regIncEvents.length) return '';

  // 담당자별 이벤트 목록 수집
  const staffMap = {};
  incEvents.forEach(ev => {
    const name = ev.extraFields.staffName?.trim() || '(미입력)';
    if (!staffMap[name]) staffMap[name] = { list: [], total: 0 };
    const amt = Number(ev.extraFields.incentiveAmt) || 0;
    staffMap[name].list.push({ ev, amt, _kind: 'incentive' });
    staffMap[name].total += amt;
  });
  // 체험/상담 연동 인센티브
  regIncEvents.forEach(ev => {
    const li   = ev.extraFields.linkedIncentive;
    const name = li.staffName?.trim() || '(미입력)';
    if (!staffMap[name]) staffMap[name] = { list: [], total: 0 };
    const amt  = Number(li.amt) || 0;
    staffMap[name].list.push({ ev, amt, _kind: 'reglinked', li });
    staffMap[name].total += amt;
  });

  const staffNames = Object.keys(staffMap).sort();
  let grandTotal = 0;
  staffNames.forEach(n => { grandTotal += staffMap[n].total; });

  const bodyId  = `acc-inc-${monthStr}`;
  const DAYS    = ['일','월','화','수','목','금','토'];

  let content = '';
  staffNames.forEach(name => {
    const { list, total } = staffMap[name];

    // 날짜순 정렬
    list.sort((a, b) =>
      a.ev.date.localeCompare(b.ev.date) || (a.ev.time||'').localeCompare(b.ev.time||'')
    );

    // 구분 소계 뱃지
    const incOnlyCnt   = list.filter(e => e._kind === 'incentive' && e.ev.extraFields.incentiveType !== '상담등록').length;
    const incConsultCnt= list.filter(e => e._kind === 'incentive' && e.ev.extraFields.incentiveType === '상담등록').length;
    const regLinkedCnt = list.filter(e => e._kind === 'reglinked').length;
    const parts = [];
    if (incOnlyCnt   > 0) parts.push(`체험 ${incOnlyCnt}건`);
    if (incConsultCnt> 0) parts.push(`상담 ${incConsultCnt}건`);
    if (regLinkedCnt > 0) parts.push(`등록 ${regLinkedCnt}건`);

    // 세부 행 (날짜별)
    let details = '';
    list.forEach(({ ev, amt, _kind, li }) => {
      const f     = ev.extraFields;
      const [,, d] = ev.date.split('-');
      const dow   = DAYS[new Date(ev.date).getDay()];

      if (_kind === 'reglinked') {
        // 체험/상담에서 연결된 인센티브
        const iType   = ev.type === 'consult' ? '상담>등록' : '체험>등록';
        const memberStr = li.memberName ? `<span class="inc-detail-member">${esc(li.memberName)}</span>` : '';
        details += `
          <div class="inc-detail-row" onclick="openDayModalFromList('${ev.date}','${ev.id}')">
            <span class="inc-detail-date">${Number(d)}일(${dow})</span>
            <span class="inc-detail-type inc-type-trial">${esc(iType)}</span>
            ${memberStr}
            <span class="inc-detail-amt">${amt.toLocaleString()}원</span>
          </div>`;
        return;
      }

      const iType = f.incentiveType || '체험등록';
      const isConsult = iType === '상담등록';

      let calcStr = '';
      if (isConsult) {
        const reg  = Number(f.registerAmt) || 0;
        const cnt  = Number(f.personCount) || 1;
        const rate = f.consultRate !== undefined ? f.consultRate : 5;
        calcStr = cnt > 1
          ? `${reg.toLocaleString()}원×${cnt}명→${rate}%`
          : `${reg.toLocaleString()}원→${rate}%`;
      } else {
        const per = Number(f.trialIncentiveAmt) || 0;
        const cnt = Number(f.personCount) || 1;
        calcStr = (per > 0 && cnt > 1) ? `${per.toLocaleString()}원×${cnt}명` : '';
      }

      const memberStr = f.memberName ? `<span class="inc-detail-member">${esc(f.memberName)}</span>` : '';
      details += `
        <div class="inc-detail-row" onclick="openDayModalFromList('${ev.date}','${ev.id}')">
          <span class="inc-detail-date">${Number(d)}일(${dow})</span>
          <span class="inc-detail-type${isConsult ? ' inc-type-consult' : ' inc-type-trial'}">${esc(iType)}</span>
          ${memberStr}
          ${calcStr ? `<span class="inc-detail-calc">${esc(calcStr)}</span>` : ''}
          <span class="inc-detail-amt">${amt.toLocaleString()}원</span>
        </div>`;
    });

    content += `
      <div class="inc-staff-group">
        <div class="inc-staff-header">
          <span class="inc-staff-name">${esc(name)}</span>
          <span class="inc-staff-sub">${parts.join(' · ')}</span>
          <span class="inc-staff-total">${total.toLocaleString()}원</span>
        </div>
        <div class="inc-staff-details">${details}</div>
      </div>`;
  });

  return `
    <div class="inc-summary-section">
      <div class="inc-summary-header acc-trigger" onclick="toggleAccordion('${bodyId}',this)">
        <div class="acc-header-left">
          <span class="inc-summary-title">💰 인센티브 정산</span>
          <span class="acc-count-badge">${incEvents.length + regIncEvents.length}건</span>
        </div>
        <div class="acc-header-right">
          <span class="inc-summary-grand">${grandTotal.toLocaleString()}원</span>
          <span class="acc-chevron">▼</span>
        </div>
      </div>
      <div class="inc-summary-list acc-body" id="${bodyId}">${content}</div>
    </div>`;
}

// ── 월별 대강 현황 요약 ───────────────────────────
function renderDaeggangSummary(monthStr) {
  const dgEvents = events.filter(ev =>
    ev.type === 'daeggang' && ev.date.startsWith(monthStr)
  );
  if (!dgEvents.length) return '';

  const sorted = [...dgEvents].sort((a, b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  const bodyId = `acc-daeg-${monthStr}`;

  let rows = '';
  sorted.forEach(ev => {
    const f    = ev.extraFields || {};
    const [,, ed] = ev.date.split('-');
    const dow  = ['일','월','화','수','목','금','토'][new Date(ev.date).getDay()];
    const time = ev.time ? ` ${ev.time}` : '';
    rows += `
      <div class="ms-row">
        <span class="ms-date">${Number(ed)}일(${dow})${time}</span>
        <span class="ms-content">${esc(f.instructorA||'?')} → ${esc(f.instructorB||'?')}</span>
      </div>`;
  });

  return `
    <div class="ms-section ms-section--daeggang">
      <div class="ms-header acc-trigger" onclick="toggleAccordion('${bodyId}',this)">
        <div class="acc-header-left">
          <span class="ms-title">🔄 대강 현황</span>
          <span class="acc-count-badge">${dgEvents.length}건</span>
        </div>
        <span class="acc-chevron">▼</span>
      </div>
      <div class="ms-list acc-body" id="${bodyId}">${rows}</div>
    </div>`;
}

// ── 월별 수업노쇼 요약 ────────────────────────────
function renderClassNoshowSummary(monthStr) {
  const nsEvents = events.filter(ev =>
    ev.type === 'classnoshow' && ev.date.startsWith(monthStr)
  );
  if (!nsEvents.length) return '';

  const sorted = [...nsEvents].sort((a, b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  const bodyId = `acc-ns-${monthStr}`;

  let rows = '';
  sorted.forEach(ev => {
    const f    = ev.extraFields || {};
    const [,, ed] = ev.date.split('-');
    const dow  = ['일','월','화','수','목','금','토'][new Date(ev.date).getDay()];
    const time = ev.time ? ` ${ev.time}` : '';
    const cls  = f.className      ? ` · ${f.className}` : '';
    const tel  = f.studentContact ? ` · ${f.studentContact}` : '';
    rows += `
      <div class="ms-row">
        <span class="ms-date">${Number(ed)}일(${dow})${time}</span>
        <span class="ms-content ms-noshow">${esc(f.studentName||'-')}${esc(cls)}${esc(tel)}</span>
      </div>`;
  });

  return `
    <div class="ms-section ms-section--noshow">
      <div class="ms-header acc-trigger" onclick="toggleAccordion('${bodyId}',this)">
        <div class="acc-header-left">
          <span class="ms-title">🚫 수업노쇼 현황</span>
          <span class="acc-count-badge">${nsEvents.length}건</span>
        </div>
        <span class="acc-chevron">▼</span>
      </div>
      <div class="ms-list acc-body" id="${bodyId}">${rows}</div>
    </div>`;
}

// ── 월별 매출 요약 ────────────────────────────────
function renderSalesSummary(monthStr) {
  // 매출/등록 이벤트
  const salesEvents = events.filter(ev =>
    ev.type === 'sales' && ev.date.startsWith(monthStr) && ev.extraFields
  );
  // 체험수업 중 체험비가 입력된(결제된) 이벤트
  const trialEvents = events.filter(ev =>
    ev.type === 'trial' && ev.date.startsWith(monthStr) &&
    ev.extraFields && Number(ev.extraFields.trialFee) > 0
  );
  // 인센티브에 매출 연동 정보가 입력된 이벤트
  const linkedEvents = events.filter(ev =>
    ev.type === 'incentive' && ev.date.startsWith(monthStr) && ev.extraFields?.linkedSales
  );
  // 체험수업/상담에서 등록이 연결된 이벤트
  const regLinkedEvents = events.filter(ev =>
    (ev.type === 'trial' || ev.type === 'consult') &&
    ev.date.startsWith(monthStr) && ev.extraFields?.linkedRegistration
  );

  if (!salesEvents.length && !trialEvents.length && !linkedEvents.length && !regLinkedEvents.length) return '';

  // 날짜순 통합 정렬
  const allItems = [
    ...salesEvents.map(ev => ({ ...ev, _kind: 'sales' })),
    ...trialEvents.map(ev => ({ ...ev, _kind: 'trial' })),
    ...linkedEvents.map(ev => ({ ...ev, _kind: 'linked' })),
    ...regLinkedEvents.map(ev => ({ ...ev, _kind: 'reglinked' })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));

  const bodyId = `acc-sales-${monthStr}`;

  // 합계 계산
  let grandTotal = 0;
  salesEvents.forEach(ev => { grandTotal += Number(ev.extraFields?.payment) || 0; });
  trialEvents.forEach(ev => {
    const f = ev.extraFields;
    grandTotal += Number(f.trialTotal) || (Number(f.trialFee) * (Number(f.personCount) || 1));
  });
  linkedEvents.forEach(ev => { grandTotal += Number(ev.extraFields?.linkedSales?.payment) || 0; });
  regLinkedEvents.forEach(ev => { grandTotal += Number(ev.extraFields?.linkedRegistration?.payment) || 0; });

  // 구분별 소계 문자열
  const byRegType = {};
  salesEvents.forEach(ev => {
    const t = ev.extraFields?.regType || '신규';
    byRegType[t] = (byRegType[t] || 0) + 1;
  });
  const salesParts = Object.entries(byRegType).map(([t, c]) => `${t} ${c}건`);
  if (trialEvents.length)     salesParts.push(`체험 ${trialEvents.length}건`);
  if (linkedEvents.length)    salesParts.push(`연동등록 ${linkedEvents.length}건`);
  if (regLinkedEvents.length) salesParts.push(`상담/체험등록 ${regLinkedEvents.length}건`);
  const typeSummary = salesParts.join(' · ');

  // 행 생성
  let rows = '';
  allItems.forEach(item => {
    const f   = item.extraFields || {};
    const [,, ed] = item.date.split('-');
    const dow = ['일','월','화','수','목','금','토'][new Date(item.date).getDay()];

    if (item._kind === 'sales') {
      const isP    = f.lessonType === '개인레슨' || f.regType === '개인레슨';
      const effReg = f.regType === '개인레슨' ? '신규' : (f.regType || '신규');
      const mem    = isP
        ? (f.sessionCount ? `개인 ${f.sessionCount}회` : '개인레슨')
        : `${f.duration||''}${f.freq ? ' '+f.freq : ''}`.trim();
      const pay = f.payment ? Number(f.payment).toLocaleString()+'원' : '-';
      rows += `
        <div class="ms-row ms-row--sales ms-row-clickable" onclick="openDayModalFromList('${item.date}','${item.id}')">
          <span class="ms-date">${Number(ed)}일(${dow})</span>
          <span class="ms-content">
            <span class="ms-sales-name">${esc(f.clientName||'-')}</span>
            <span class="sales-badge sales-badge--${effReg}">${esc(effReg)}</span>
            ${mem ? `<span class="ms-sales-mem">${esc(mem)}</span>` : ''}
          </span>
          <span class="ms-sales-pay">${pay}</span>
        </div>`;
    } else if (item._kind === 'trial') {
      // 체험수업 유료 건
      const cnt    = Number(f.personCount) || 1;
      const total  = Number(f.trialTotal) || (Number(f.trialFee) * cnt);
      const pay    = total > 0 ? total.toLocaleString()+'원' : '-';
      const cntStr = cnt > 1 ? ` · ${cnt}명` : '';
      rows += `
        <div class="ms-row ms-row--sales ms-row-clickable" onclick="openDayModalFromList('${item.date}','${item.id}')">
          <span class="ms-date">${Number(ed)}일(${dow})</span>
          <span class="ms-content">
            <span class="ms-sales-name">${esc(f.clientName||'-')}</span>
            <span class="sales-badge sales-badge--trial">체험수업</span>
            ${cntStr ? `<span class="ms-sales-mem">${esc(cntStr)}</span>` : ''}
          </span>
          <span class="ms-sales-pay">${pay}</span>
        </div>`;
    } else if (item._kind === 'linked') {
      // 인센티브 연동 매출
      const ls    = f.linkedSales || {};
      const badge = f.incentiveType === '상담등록' ? '상담>등록' : '체험>등록';
      const mem   = `${ls.duration||''}${ls.freq ? ' '+ls.freq : ''}`.trim();
      const pay   = ls.payment ? Number(ls.payment).toLocaleString()+'원' : '-';
      rows += `
        <div class="ms-row ms-row--sales ms-row-clickable" onclick="openDayModalFromList('${item.date}','${item.id}')">
          <span class="ms-date">${Number(ed)}일(${dow})</span>
          <span class="ms-content">
            <span class="ms-sales-name">${esc(f.memberName||'-')}</span>
            <span class="sales-badge sales-badge--linked">${esc(badge)}</span>
            ${mem ? `<span class="ms-sales-mem">${esc(mem)}</span>` : ''}
          </span>
          <span class="ms-sales-pay">${pay}</span>
        </div>`;
    } else {
      // 체험수업/상담 등록 연동 매출
      const lr    = f.linkedRegistration || {};
      const badge = item.type === 'consult' ? '상담>등록' : '체험>등록';
      const isP   = lr.lessonType === '개인레슨';
      const mem   = isP
        ? (lr.sessionCount ? `개인 ${lr.sessionCount}회` : '개인레슨')
        : `${lr.duration||''}${lr.freq ? ' '+lr.freq : ''}`.trim();
      const regBadge = lr.regType || '신규';
      const pay   = lr.payment ? Number(lr.payment).toLocaleString()+'원' : '-';
      const clientName = f.clientName || '-';
      rows += `
        <div class="ms-row ms-row--sales ms-row-clickable" onclick="openDayModalFromList('${item.date}','${item.id}')">
          <span class="ms-date">${Number(ed)}일(${dow})</span>
          <span class="ms-content">
            <span class="ms-sales-name">${esc(clientName)}</span>
            <span class="sales-badge sales-badge--linked">${esc(badge)}</span>
            <span class="sales-badge sales-badge--${regBadge}">${esc(regBadge)}</span>
            ${mem ? `<span class="ms-sales-mem">${esc(mem)}</span>` : ''}
          </span>
          <span class="ms-sales-pay">${pay}</span>
        </div>`;
    }
  });

  return `
    <div class="ms-section ms-section--sales">
      <div class="ms-header acc-trigger" onclick="toggleAccordion('${bodyId}',this)">
        <div class="acc-header-left">
          <span class="ms-title">💵 매출 현황</span>
          <span class="acc-count-badge">${allItems.length}건</span>
          <span class="ms-type-summary">${typeSummary}</span>
        </div>
        <div class="acc-header-right">
          <span class="ms-grand">${grandTotal.toLocaleString()}원</span>
          <span class="acc-chevron">▼</span>
        </div>
      </div>
      <div class="ms-list acc-body" id="${bodyId}">${rows}</div>
    </div>`;
}

// ── 리스트 뷰용 시스템 카테고리 타이틀 (금액 제외) ──
function getSysListTitle(ev) {
  const f = ev.extraFields || {};
  switch (ev.type) {
    case 'sales': {
      const name   = f.clientName || '매출등록';
      const isP    = f.lessonType === '개인레슨' || f.regType === '개인레슨';
      const effReg = f.regType === '개인레슨' ? '신규' : (f.regType || '신규');
      const ltype  = isP ? ' · 개인레슨' : (f.lessonType === '그룹' ? ' · 그룹' : '');
      const mem    = isP
        ? (f.sessionCount ? ` · ${f.sessionCount}회` : '')
        : (f.duration || f.freq) ? ` · ${(f.duration||'')+(f.freq?' '+f.freq:'')}` : '';
      return `${name} · ${effReg}${ltype}${mem}`;
    }
    case 'incentive': {
      const iType  = f.incentiveType || '체험등록';
      const staff  = f.staffName  ? ` · ${f.staffName}`  : '';
      const member = f.memberName ? ` · ${f.memberName}` : '';
      return `${iType}${staff}${member}`;
    }
    case 'trial': {
      const name = f.clientName || '체험수업';
      const cnt  = Number(f.personCount) || 1;
      const ns   = f.noshow ? ' ⚠노쇼' : '';
      const res  = f.reserved ? (f.reserveName ? ` 📅${f.reserveName}` : ' 📅예약완료') : ' ⬜미예약';
      const st   = f.status === 'cancelled' ? ' ❌취소' : f.status === 'changed' ? ' 🔄변경' : '';
      const reg  = f.linkedRegistration ? ' ✅등록' : '';
      return (cnt > 1 ? `${name} 外 ${cnt - 1}명` : name) + ns + res + st + reg;
    }
    case 'review': {
      const rvName = f.clientName || '리뷰체험';
      const rvNs   = f.noshow ? ' ⚠노쇼' : '';
      const rvRes  = f.reserved ? (f.reserveName ? ` 📅${f.reserveName}` : ' 📅예약완료') : ' ⬜미예약';
      const rvSt   = f.status === 'cancelled' ? ' ❌취소' : f.status === 'changed' ? ' 🔄변경' : '';
      return `${rvName}${rvNs}${rvRes}${rvSt}`;
    }
    case 'consult': {
      const name = f.clientName || '상담';
      const st   = f.status === 'cancelled' ? ' ❌취소' : f.status === 'changed' ? ' 🔄변경' : '';
      const reg  = f.linkedRegistration ? ' ✅등록' : '';
      return `${name}${st}${reg}`;
    }
    case 'daeggang':
      return f.instructorA
        ? `${f.instructorA} → ${f.instructorB || '?'} 대강`
        : (ev.title || '대강');
    case 'classnoshow':
      return f.studentName
        ? `${f.studentName}${f.className ? ' · ' + f.className : ''}`
        : (ev.title || '수업노쇼');
    default:
      return ev.title || '';
  }
}

// ── 리스트 뷰 오른쪽 정렬 금액 ────────────────────
function getSysPayAmt(ev) {
  const f = ev.extraFields;
  if (!f) return 0;
  switch (ev.type) {
    case 'sales':     return Number(f.payment) || 0;
    case 'incentive': return Number(f.incentiveAmt) || 0;
    case 'trial':
      return Number(f.trialTotal) ||
             (Number(f.trialFee) * (Number(f.personCount) || 1)) || 0;
    default: return 0;
  }
}

// ── 목록 보기 렌더링 — 현재 달만 표시 ────────────
function renderListViewAll() {
  const body = document.getElementById('listViewBody');
  if (!body) return;

  const todayStr  = toDateStr(new Date());
  const alpha     = isDark() ? 0.22 : 0.15;
  const DAYS      = ['일','월','화','수','목','금','토'];
  const monthStr  = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  // 월 타이틀 업데이트 (목록 보기에서도 반영)
  const titleEl = document.getElementById('monthTitle');
  if (titleEl) titleEl.textContent = `${currentYear}년 ${currentMonth + 1}월`;

  // 현재 달 이벤트
  const monthEvents = events.filter(ev => ev.date.startsWith(monthStr));

  // 현재 달 공휴일 (대체공휴일 포함 — API가 자동 반영)
  const monthHolidays = Object.entries(holidaysMap)
    .filter(([date]) => date.startsWith(monthStr))
    .map(([date, name]) => ({ date, title: name, isHoliday: true }));

  // 병합 + 정렬 (같은 날은 공휴일 → 일정 순)
  const allItems = [
    ...monthEvents.map(ev => ({ ...ev, isHoliday: false })),
    ...monthHolidays,
  ].sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    if (a.isHoliday && !b.isHoliday) return -1;
    if (!a.isHoliday && b.isHoliday) return 1;
    return (a.time || '').localeCompare(b.time || '');
  });

  // 빈 달 처리
  if (!allItems.length) {
    body.innerHTML = `
      <div class="lv-empty">
        <div style="font-size:36px;margin-bottom:10px">📋</div>
        <div style="font-weight:600;margin-bottom:4px">${currentYear}년 ${currentMonth + 1}월 일정이 없습니다.</div>
        <div style="font-size:13px;color:var(--text-muted)">날짜를 눌러 일정을 추가해보세요.</div>
      </div>`;
    return;
  }

  // 월 헤더 (건수 요약)
  const evtCnt  = allItems.filter(i => !i.isHoliday).length;
  const holCnt  = allItems.filter(i =>  i.isHoliday).length;
  const countTxt = [evtCnt ? `${evtCnt}건` : '', holCnt ? `공휴일 ${holCnt}` : '']
    .filter(Boolean).join(' · ');

  let html = `
    <div class="lv-month-header">
      ${currentYear}년 ${currentMonth + 1}월
      <span class="lv-month-count">${countTxt}</span>
    </div>
    <div class="lv-items-grid">`;

  // 주 구분선용 — 각 항목의 주(週) 시작일(일요일) 계산
  const getWeekStart = dateStr => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  };
  let prevWeekStart = null;
  let todayHeaderInserted = false;

  allItems.forEach(item => {
    const [ey, em, ed] = item.date.split('-').map(Number);
    const dow     = new Date(ey, em-1, ed).getDay();
    const dowStr  = DAYS[dow];
    const isToday = item.date === todayStr;
    const isHol   = !!holidaysMap[item.date];
    const isSun   = dow === 0;
    const isSat   = dow === 6;
    const dateClr = isHol || isSun ? 'var(--sunday)'
                  : isSat          ? 'var(--saturday)' : '';

    // 주 구분선 삽입 (오늘 헤더가 없는 주에만)
    const wStart = getWeekStart(item.date);
    if (prevWeekStart !== null && wStart !== prevWeekStart && !isToday) {
      html += `<div class="lv-week-divider"></div>`;
    }
    prevWeekStart = wStart;

    // 오늘 날짜 헤더 (첫 번째 오늘 항목 앞에 한 번만)
    if (isToday && !todayHeaderInserted) {
      todayHeaderInserted = true;
      html += `<div class="lv-today-divider"><span>오늘</span></div>`;
    }

    // 오늘 날짜·요일 — 배지 형태
    const dateDow = isToday
      ? `<span class="lv-date-dow"><span class="lv-date-today-badge">${ed}${dowStr}</span></span>`
      : `<span class="lv-date-dow"${dateClr ? ` style="color:${dateClr}"` : ''}>${ed}${dowStr}</span>`;

    if (item.isHoliday) {
      html += `
        <div class="lv-holiday-item${isToday ? ' lv-item-today' : ''}">
          ${dateDow}
          <div class="lv-holiday-name">🎌 ${esc(item.title)}</div>
        </div>`;
    } else {
      const cat         = getCat(item.type);
      const isSys       = SYSTEM_CAT_IDS.includes(item.type);
      const isNoshow    = item.extraFields?.noshow === true;
      const evStatus    = STATUS_CAT_IDS.includes(item.type) ? (item.extraFields?.status || '') : '';
      const isCancelled = evStatus === 'cancelled';
      const isChanged   = evStatus === 'changed';
      const titleStr    = isSys ? getSysListTitle(item) : getDisplayTitle(item);
      const timeHtml    = item.time ? `<span class="lv-time">⏰ ${esc(item.time)}</span>` : '';
      const extraHtml   = isSys ? '' : getExtraSummaryHtml(item);
      const statusHtml  = isCancelled ? `<span class="lv-status-badge lv-status-cancelled">취소</span>`
                        : isChanged   ? `<span class="lv-status-badge lv-status-changed">일정변경</span>` : '';

      html += `
        <div class="lv-event-item${isToday ? ' lv-item-today' : ''}${isNoshow ? ' lv-item-noshow' : ''}${isCancelled ? ' lv-item-cancelled' : ''}" onclick="openDayModalFromList('${item.date}','${item.id}')">
          ${dateDow}
          <span class="lv-badge" style="background:${hexToRgba(cat.color,alpha)};color:var(--text)">${esc(cat.name)}</span>
          <span class="lv-title${isCancelled ? ' lv-title-strike' : ''}">${esc(titleStr)}</span>
          ${statusHtml}
          ${timeHtml}
          ${extraHtml}
        </div>`;
    }
  });

  html += '</div>'; // lv-items-grid

  // 월별 정산 섹션 추가
  html += renderSalesSummary(monthStr);
  html += renderIncentiveSummary(monthStr);
  html += renderDaeggangSummary(monthStr);
  html += renderClassNoshowSummary(monthStr);

  body.innerHTML = html;
}

function openDayModalFromList(dateStr, eventId) {
  openDayModal(dateStr);       // 내부에서 viewingEventId = null 리셋됨
  viewingEventId = eventId;    // 리셋 후 다시 설정
  setTimeout(() => switchDayView('detail'), 50);
}

// ═════════════════════════════════════════════════
// 검색
// ═════════════════════════════════════════════════

function openSearch() {
  const overlay = document.getElementById('searchOverlay');
  overlay.classList.remove('hidden');
  const inp = document.getElementById('searchInput');
  inp.value = '';
  document.getElementById('btnSearchClear').classList.add('hidden');
  document.getElementById('searchResults').innerHTML =
    '<div class="search-hint">회원이름, 연락처, 메모, 카테고리, 제목으로 검색할 수 있습니다.</div>';
  setTimeout(() => inp.focus(), 80);
}

function closeSearch() {
  document.getElementById('searchOverlay').classList.add('hidden');
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function highlightMatch(text, q) {
  if (!text || !q) return esc(String(text || ''));
  const idx = String(text).toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return esc(String(text));
  const s = String(text);
  return esc(s.slice(0, idx))
    + `<mark class="sr-mark">${esc(s.slice(idx, idx + q.length))}</mark>`
    + esc(s.slice(idx + q.length));
}

function performSearch() {
  const q = (document.getElementById('searchInput').value || '').trim();
  const clearBtn = document.getElementById('btnSearchClear');
  clearBtn.classList.toggle('hidden', !q);
  const resultsEl = document.getElementById('searchResults');

  if (!q) {
    resultsEl.innerHTML = '<div class="search-hint">회원이름, 연락처, 메모, 카테고리, 제목으로 검색할 수 있습니다.</div>';
    return;
  }

  const ql = q.toLowerCase();
  const matches = events.filter(ev => {
    const f = ev.extraFields || {};
    const catName = getCat(ev.type).name;
    const memo    = stripHtml(ev.desc || '');
    return [
      ev.title, getDisplayTitle(ev), catName, memo,
      f.clientName, f.clientContact,
      f.memberName, f.staffName,
      f.studentName, f.studentContact,
      f.instructorA, f.instructorB,
      f.className, f.regType, f.incentiveType,
    ].some(s => s && String(s).toLowerCase().includes(ql));
  }).sort((a, b) => b.date.localeCompare(a.date));

  if (!matches.length) {
    resultsEl.innerHTML = `<div class="search-empty">「${esc(q)}」 검색 결과가 없습니다.</div>`;
    return;
  }

  const DAYS  = ['일','월','화','수','목','금','토'];
  const alpha = isDark() ? 0.22 : 0.13;
  let html = `<div class="search-count">${matches.length}건 검색됨</div>`;

  matches.forEach(ev => {
    const [ey, em, ed] = ev.date.split('-').map(Number);
    const dow  = DAYS[new Date(ey, em - 1, ed).getDay()];
    const cat  = getCat(ev.type);
    const f    = ev.extraFields || {};
    const memo = stripHtml(ev.desc || '');

    // 매칭된 필드 강조 정보 줄
    const infoLines = [];
    const addIfMatch = (icon, val) => {
      if (val && String(val).toLowerCase().includes(ql))
        infoLines.push(`${icon} ${highlightMatch(String(val), q)}`);
    };
    addIfMatch('👤', f.clientName);
    addIfMatch('📞', f.clientContact);
    addIfMatch('👤', f.memberName);
    addIfMatch('🧑‍🏫', f.staffName);
    addIfMatch('👤', f.studentName);
    addIfMatch('📞', f.studentContact);
    addIfMatch('🔄', f.instructorA);
    addIfMatch('🔄', f.instructorB);
    addIfMatch('📚', f.className);
    addIfMatch('🏷️', f.regType);
    addIfMatch('🏷️', f.incentiveType);
    if (memo && memo.toLowerCase().includes(ql)) {
      const start = Math.max(0, memo.toLowerCase().indexOf(ql) - 15);
      const snip  = (start > 0 ? '…' : '') + memo.slice(start, start + 70) + (start + 70 < memo.length ? '…' : '');
      infoLines.push(`📝 ${highlightMatch(snip, q)}`);
    }

    const displayTitle = getDisplayTitle(ev);
    const titleHtml = displayTitle && displayTitle.toLowerCase().includes(ql)
      ? highlightMatch(displayTitle, q)
      : esc(displayTitle);

    html += `
      <div class="search-result-item" onclick="openDayModalFromList('${ev.date}','${ev.id}');closeSearch()">
        <div class="sr-date">${ey}년 ${String(em).padStart(2,'0')}월 ${String(ed).padStart(2,'0')}일(${dow})</div>
        <div class="sr-main">
          <span class="sr-badge" style="background:${hexToRgba(cat.color,alpha)};color:var(--text)">${esc(cat.name)}</span>
          <span class="sr-title">${titleHtml}</span>
        </div>
        ${infoLines.length ? `<div class="sr-info">${infoLines.join(' · ')}</div>` : ''}
      </div>`;
  });

  resultsEl.innerHTML = html;
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
    const holiday  = !other ? (holidaysMap[dateStr] || null) : null;

    const cell = document.createElement('div');
    cell.className = 'day-cell'
      + (other ? ' other-month' : '')
      + (dateStr === todayStr ? ' today' : '')
      + (dayEvts.length > 0 && !other ? ' has-event' : '')
      + (holiday ? ' has-holiday' : '');
    cell.dataset.date = dateStr;

    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = d;
    if      (dow === 0 || holiday)   numEl.style.color = 'var(--sunday)';
    else if (dow === 6)              numEl.style.color = 'var(--saturday)';
    cell.appendChild(numEl);

    // 공휴일 라벨
    if (holiday) {
      const hdEl = document.createElement('div');
      hdEl.className = 'holiday-label';
      hdEl.textContent = holiday;
      cell.appendChild(hdEl);
    }

    if (mobile) {
      // 모바일: 컬러 바로 일정 표시 (최대 3개)
      if (dayEvts.length > 0 && !other) {
        const barRow = document.createElement('div');
        barRow.className = 'mobile-bar-row';
        dayEvts.slice(0, 3).forEach(ev => {
          const cat = getCat(ev.type);
          const bar = document.createElement('span');
          bar.className = 'mobile-bar';
          bar.style.background = cat.color;
          barRow.appendChild(bar);
        });
        if (dayEvts.length > 3) {
          const more = document.createElement('span');
          more.className = 'mobile-bar-more';
          more.textContent = `+${dayEvts.length - 3}`;
          barRow.appendChild(more);
        }
        cell.appendChild(barRow);
      }
    } else {
      // PC: 기존 텍스트 칩 표시
      dayEvts.slice(0, 3).forEach(ev => {
        const cat        = getCat(ev.type);
        const cancelled  = STATUS_CAT_IDS.includes(ev.type) && ev.extraFields?.status === 'cancelled';
        const chip = document.createElement('div');
        chip.className = 'event-chip' + (cancelled ? ' chip-cancelled' : '');
        chip.style.cssText = `background:${hexToRgba(cat.color, cancelled ? 0.08 : alpha)};color:var(--text);`;
        chip.textContent   = `[${cat.name}] ` + (ev.time ? ev.time + ' ' : '') + getChipText(ev);
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
    const cat       = getCat(ev.type);
    const cancelled = STATUS_CAT_IDS.includes(ev.type) && ev.extraFields?.status === 'cancelled';
    const changed   = STATUS_CAT_IDS.includes(ev.type) && ev.extraFields?.status === 'changed';
    const item = document.createElement('div');
    item.className = 'list-event-item' + (cancelled ? ' item-cancelled' : '');
    item.innerHTML = `
      <span class="list-event-badge"
        style="background:${hexToRgba(cat.color, cancelled ? 0.08 : alpha)};color:var(--text)">
        ${esc(cat.name)}
      </span>
      <div class="list-event-info">
        <div class="list-event-title${cancelled ? ' title-strike' : ''}">${esc(getDisplayTitle(ev))}${cancelled ? ' <span class="appt-status-badge appt-cancelled" style="font-size:10px">취소</span>' : changed ? ' <span class="appt-status-badge appt-changed" style="font-size:10px">변경</span>' : ''}</div>
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
          style="background:${hexToRgba(cat.color,alpha)};color:var(--text)">
          ${esc(cat.name)}
        </span>
        ${ev.time ? `<span style="font-size:12px;color:var(--text-muted)">⏰ ${esc(ev.time)}</span>` : ''}
      </div>
      <div class="detail-event-title">${esc(getDisplayTitle(ev))}</div>
      <div class="detail-meta">
        <span>📅 ${formatDateKo(ev.date)}</span>
      </div>
    </div>
    ${getExtraDetailHtml(ev)}
    <div class="detail-section detail-memo-section">
      <div class="detail-label">메모</div>
      <div class="detail-memo-wrap">
        <div class="detail-memo-editor" id="detailMemoEditor" contenteditable="true"
          data-placeholder="메모를 입력하세요…">${ev.desc || ''}</div>
        <button class="detail-memo-save hidden" id="btnQuickMemoSave">저장</button>
      </div>
    </div>
    ${creatorHtml ? `<div class="detail-section">${creatorHtml}</div>` : ''}`;

  // 인라인 메모 에디터 이벤트 바인딩
  const memoEditor  = document.getElementById('detailMemoEditor');
  const memoSaveBtn = document.getElementById('btnQuickMemoSave');
  const origMemo    = ev.desc || '';
  if (memoEditor && memoSaveBtn) {
    memoEditor.addEventListener('input', () => {
      const changed = memoEditor.innerHTML !== origMemo;
      memoSaveBtn.classList.toggle('hidden', !changed);
      memoEditor.classList.toggle('has-changes', changed);
    });
    memoSaveBtn.addEventListener('click', saveQuickMemo);
  }
}

/** 상세 뷰에서 메모만 즉시 저장 */
async function saveQuickMemo() {
  if (!viewingEventId) return;
  const idx = events.findIndex(e => e.id === viewingEventId);
  if (idx === -1) return;

  const memoEditor = document.getElementById('detailMemoEditor');
  if (!memoEditor) return;

  const newDesc = memoEditor.innerHTML.trim();
  const now     = new Date().toISOString();
  const byUser  = currentUser || { id: 'admin', name: '관리자' };

  events[idx] = { ...events[idx], desc: newDesc, updatedBy: byUser, updatedAt: now };

  localStorage.setItem('cc_events', JSON.stringify(events));
  showToast('메모가 저장되었습니다.');

  if (syncEnabled) {
    clearTimeout(syncTimer);
    setSyncStatus('syncing', '동기화 중…');
    const changedEv = events[idx];
    const payload   = {
      events,
      action:       'update',
      changedEvent: changedEv,
      detail:       `${changedEv.title} (${changedEv.date})`,
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

  renderCurrentView();   // 달력/리스트 뷰 갱신
  renderDetailView();    // 상세 뷰 갱신 (타임스탬프 반영)
}

// ── 뷰 3 : 폼 ────────────────────────────────────
function openFormAdd(dateStr) {
  editingEventId = null;
  formPrevView   = 'list';
  const firstCatId = settings.categories[0]?.id || '';
  document.getElementById('fDate').value     = dateStr || modalDate || toDateStr(new Date());
  document.getElementById('fTime').value     = '';
  document.getElementById('fTitle').value    = '';
  document.getElementById('fDesc').innerHTML = '';
  renderTypeBtns(firstCatId);
  renderExtraFields(firstCatId, null);
  switchDayView('form');
  if (!SYSTEM_CAT_IDS.includes(firstCatId)) {
    setTimeout(() => document.getElementById('fTitle').focus(), 80);
  }
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
  renderExtraFields(ev.type, ev); // 기존 데이터로 폼 채우기
  switchDayView('form');
}

function renderExtraFields(catId, ev) {
  const container  = document.getElementById('extraFieldsContainer');
  const defGroup   = document.getElementById('defaultFieldsGroup');
  const isSystem   = SYSTEM_CAT_IDS.includes(catId);
  const f          = (ev && ev.extraFields) || {};

  // 메모는 항상 표시 — 제목 입력란만 시스템 카테고리에서 숨김
  if (defGroup) defGroup.style.display = '';
  const titleGroup = document.getElementById('titleGroup');
  if (titleGroup) titleGroup.style.display = isSystem ? 'none' : '';
  if (!container) return;

  if (!isSystem) { container.innerHTML = ''; return; }

  switch (catId) {
    case 'daeggang':
      container.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label>A강사 (원담당) <span class="required">*</span></label>
            <input type="text" id="fInstructorA" placeholder="원담당 강사명" value="${esc(f.instructorA||'')}"/>
          </div>
          <div class="form-group">
            <label>B강사 (대강) <span class="required">*</span></label>
            <input type="text" id="fInstructorB" placeholder="대강 진행 강사명" value="${esc(f.instructorB||'')}"/>
          </div>
        </div>`;
      setTimeout(() => document.getElementById('fInstructorA')?.focus(), 80);
      break;

    case 'incentive': {
      const isConsult   = f.incentiveType === '상담등록';
      const staffLabel  = isConsult ? '담당 상담자' : '담당 강사';
      const staffHolder = isConsult ? '상담자 이름' : '강사 이름';
      const staffVal    = esc(f.staffName || '');
      const trialAmt    = (f.trialIncentiveAmt !== undefined) ? f.trialIncentiveAmt
                        : (!isConsult && !f.incentiveType) ? incentiveDefaults.trialAmount
                        : (f.incentiveAmt && !isConsult) ? f.incentiveAmt : incentiveDefaults.trialAmount;
      const regAmt      = f.registerAmt !== undefined ? f.registerAmt : '';
      const cRate       = f.consultRate !== undefined ? f.consultRate : incentiveDefaults.consultRate;
      const calcAmt     = regAmt ? Math.round(Number(regAmt) * Number(cRate) / 100) : 0;
      const calcHtml    = calcAmt
        ? `<span class="calc-rate">${cRate}% = </span><span class="calc-amt">${calcAmt.toLocaleString()}원</span>`
        : `<span class="calc-placeholder">등록 금액을 입력하면 자동 계산됩니다</span>`;

      container.innerHTML = `
        <div class="form-group">
          <label>구분 <span class="required">*</span></label>
          <div class="incentive-radio-group">
            <label class="radio-label">
              <input type="radio" name="incentiveType" value="체험등록" ${!isConsult ? 'checked' : ''}/>
              <span>체험등록</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="incentiveType" value="상담등록" ${isConsult ? 'checked' : ''}/>
              <span>상담등록</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label id="fStaffLabel">${staffLabel} <span class="required">*</span></label>
          <input type="text" id="fStaffName" placeholder="${staffHolder}" value="${staffVal}"/>
        </div>
        <div class="form-group">
          <label>등록자 이름 <span class="required">*</span></label>
          <input type="text" id="fMemberName" placeholder="회원 이름" value="${esc(f.memberName||'')}"/>
        </div>
        <div id="incentiveTrialFields"${isConsult ? ' style="display:none"' : ''}>
          <div class="form-row">
            <div class="form-group">
              <label>인센티브 금액 (1인) <span class="required">*</span></label>
              <div class="input-with-unit">
                <input type="number" id="fTrialIncentiveAmt" placeholder="0" min="0" step="1000" value="${trialAmt}"/>
                <span class="input-unit">원</span>
              </div>
            </div>
            <div class="form-group" style="max-width:110px">
              <label>인원</label>
              <div class="input-with-unit">
                <input type="number" id="fTrialPersonCount" placeholder="1" min="1" step="1" value="${f.personCount || 1}"/>
                <span class="input-unit">명</span>
              </div>
            </div>
          </div>
          <div class="incentive-calc-info" id="incentiveTrialCalcInfo">
            <span class="calc-placeholder">금액과 인원을 입력하세요</span>
          </div>
        </div>
        <div id="incentiveConsultFields"${!isConsult ? ' style="display:none"' : ''}>
          <div class="form-row">
            <div class="form-group">
              <label>등록 금액 (1인) <span class="required">*</span></label>
              <div class="input-with-unit">
                <input type="number" id="fRegisterAmt" placeholder="0" min="0" step="10000" value="${regAmt}"/>
                <span class="input-unit">원</span>
              </div>
            </div>
            <div class="form-group" style="max-width:110px">
              <label>인원</label>
              <div class="input-with-unit">
                <input type="number" id="fConsultPersonCount" placeholder="1" min="1" step="1" value="${f.personCount || 1}"/>
                <span class="input-unit">명</span>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>인센티브 비율</label>
            <div class="input-with-unit" style="max-width:130px">
              <input type="number" id="fConsultRate" placeholder="${incentiveDefaults.consultRate}" min="0" max="100" step="0.5" value="${cRate}"/>
              <span class="input-unit">%</span>
            </div>
          </div>
          <div class="incentive-calc-info" id="incentiveCalcInfo">${calcHtml}</div>
        </div>
        <div class="inc-sales-divider"></div>
        <div class="form-group" style="margin-bottom:4px">
          <label class="inc-sales-toggle-label">
            <input type="checkbox" id="fIncSalesLink" ${f.linkedSales ? 'checked' : ''}/>
            <span>💵 매출/등록 정보 함께 입력</span>
          </label>
        </div>
        <div id="incSalesFields" style="display:${f.linkedSales ? '' : 'none'}">
          <div class="inc-sales-note">아래 정보는 매출 현황에도 함께 표시됩니다</div>
          <div class="form-group">
            <label>등록구분</label>
            <div class="sales-radio-group" id="incSalesRegGroup">
              ${['신규','재등록','휴면'].map(v => `<label class="sales-radio-label${(f.linkedSales?.regType||'신규')===v?' active':''}"><input type="radio" name="incSalesRegType" value="${v}" ${(f.linkedSales?.regType||'신규')===v?'checked':''}/>${v}</label>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>회원권 기간</label>
            <div class="sales-radio-group" id="incSalesDurGroup">
              ${['1개월','3개월','6개월'].map(v => `<label class="sales-radio-label${(f.linkedSales?.duration||'1개월')===v?' active':''}"><input type="radio" name="incSalesDuration" value="${v}" ${(f.linkedSales?.duration||'1개월')===v?'checked':''}/>${v}</label>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>수업 횟수</label>
            <div class="sales-radio-group" id="incSalesFreqGroup">
              ${['주1회','주2회','주3회','주5회'].map(v => `<label class="sales-radio-label${(f.linkedSales?.freq||'주3회')===v?' active':''}"><input type="radio" name="incSalesFreq" value="${v}" ${(f.linkedSales?.freq||'주3회')===v?'checked':''}/>${v}</label>`).join('')}
            </div>
          </div>
          <div class="form-group" id="incSalesPayGroup">
            <label>결제금액
              <span id="incSalesPayNote" class="inc-sales-auto-note"${isConsult ? '' : ' style="display:none"'}>⟳ 인센티브 등록금액 자동 반영</span>
            </label>
            <div class="input-with-unit">
              <input type="number" id="fIncSalesPayment" placeholder="0" min="0" step="10000"
                     value="${isConsult
                       ? ((Number(f.registerAmt||0) * Math.max(1, Number(f.personCount||1))) || '')
                       : (f.linkedSales?.payment||'')}"
                     ${isConsult ? 'readonly' : ''}/>
              <span class="input-unit">원</span>
            </div>
          </div>
        </div>`;

      // 체험등록 자동계산
      const updateTrialCalc = () => {
        const perAmt = parseAmt('fTrialIncentiveAmt');
        const cnt    = Math.max(1, Number(document.getElementById('fTrialPersonCount')?.value) || 1);
        const total  = perAmt * cnt;
        const el     = document.getElementById('incentiveTrialCalcInfo');
        if (!el) return;
        if (perAmt > 0) {
          el.innerHTML = cnt > 1
            ? `<span class="calc-rate">${perAmt.toLocaleString()}원 × ${cnt}명 = </span><span class="calc-amt">${total.toLocaleString()}원</span>`
            : `<span class="calc-amt">${total.toLocaleString()}원</span>`;
        } else {
          el.innerHTML = `<span class="calc-placeholder">금액과 인원을 입력하세요</span>`;
        }
      };

      // 상담등록 자동계산
      const updateCalc = () => {
        const reg  = parseAmt('fRegisterAmt');
        const cnt  = Math.max(1, Number(document.getElementById('fConsultPersonCount')?.value) || 1);
        const rt   = Number(document.getElementById('fConsultRate')?.value) || incentiveDefaults.consultRate;
        const totalReg = reg * cnt;
        const calc = Math.round(totalReg * rt / 100);
        const el   = document.getElementById('incentiveCalcInfo');
        if (!el) return;
        if (reg > 0) {
          const regPart = cnt > 1
            ? `<span class="calc-rate">${reg.toLocaleString()}원 × ${cnt}명 = ${totalReg.toLocaleString()}원 → ${rt}% = </span>`
            : `<span class="calc-rate">${reg.toLocaleString()}원 → ${rt}% = </span>`;
          el.innerHTML = regPart + `<span class="calc-amt">${calc.toLocaleString()}원</span>`;
        } else {
          el.innerHTML = `<span class="calc-placeholder">등록 금액을 입력하면 자동 계산됩니다</span>`;
        }
      };

      // 상담등록 결제금액 → 매출 연동 자동 반영
      const syncConsultPayment = () => {
        const payEl = document.getElementById('fIncSalesPayment');
        if (!payEl || !payEl.readOnly) return;
        const reg = parseAmt('fRegisterAmt');
        const cnt = Math.max(1, Number(document.getElementById('fConsultPersonCount')?.value) || 1);
        const tot = reg * cnt;
        payEl.value = tot ? tot.toLocaleString('ko-KR') : '';
      };

      // 라디오 버튼 변경 이벤트
      container.querySelectorAll('input[name="incentiveType"]').forEach(radio => {
        radio.addEventListener('change', () => {
          const toConsult = radio.value === '상담등록';
          const lbl = document.getElementById('fStaffLabel');
          const inp = document.getElementById('fStaffName');
          if (lbl) lbl.innerHTML = (toConsult ? '담당 상담자' : '담당 강사') + ' <span class="required">*</span>';
          if (inp) inp.placeholder = toConsult ? '상담자 이름' : '강사 이름';
          document.getElementById('incentiveTrialFields').style.display  = toConsult ? 'none' : '';
          document.getElementById('incentiveConsultFields').style.display = toConsult ? '' : 'none';
          if (!toConsult) {
            const ti = document.getElementById('fTrialIncentiveAmt');
            if (ti && !ti.value) ti.value = incentiveDefaults.trialAmount;
            updateTrialCalc();
          } else {
            updateCalc();
          }
          // 매출 연동 결제금액 readonly 처리
          const payEl   = document.getElementById('fIncSalesPayment');
          const payNote = document.getElementById('incSalesPayNote');
          if (payEl) {
            payEl.readOnly = toConsult;
            if (payNote) payNote.style.display = toConsult ? '' : 'none';
            if (toConsult) syncConsultPayment();
            else payEl.value = '';
          }
        });
      });

      document.getElementById('fTrialIncentiveAmt')?.addEventListener('input', updateTrialCalc);
      document.getElementById('fTrialPersonCount')?.addEventListener('input', updateTrialCalc);
      document.getElementById('fRegisterAmt')?.addEventListener('input', () => { updateCalc(); syncConsultPayment(); });
      document.getElementById('fConsultPersonCount')?.addEventListener('input', () => { updateCalc(); syncConsultPayment(); });
      document.getElementById('fConsultRate')?.addEventListener('input', updateCalc);

      // 초기 계산 표시
      updateTrialCalc();

      // 매출 연동 토글
      document.getElementById('fIncSalesLink')?.addEventListener('change', e => {
        document.getElementById('incSalesFields').style.display = e.target.checked ? '' : 'none';
      });
      // 매출 연동 라디오 그룹 active 클래스 처리
      ['incSalesRegGroup','incSalesDurGroup','incSalesFreqGroup'].forEach(grpId => {
        const grp = document.getElementById(grpId);
        if (!grp) return;
        grp.querySelectorAll('.sales-radio-label').forEach(lbl => {
          lbl.addEventListener('click', () => {
            grp.querySelectorAll('.sales-radio-label').forEach(l => l.classList.remove('active'));
            lbl.classList.add('active');
          });
        });
      });

      setTimeout(() => document.getElementById('fStaffName')?.focus(), 80);
      break;
    }

    case 'trial': {
      const trialFeeVal = f.trialFee !== undefined ? f.trialFee : '';
      const personVal   = f.personCount || 1;
      const initTotal   = (f.trialFee > 0 && personVal > 0) ? f.trialFee * personVal : 0;
      const initCalcHtml = initTotal > 0
        ? `<span class="calc-rate">${f.trialFee.toLocaleString()}원 × ${personVal}명 = </span><span class="calc-amt">${initTotal.toLocaleString()}원</span>`
        : `<span class="calc-placeholder">금액 입력 시 합계 표시</span>`;

      container.innerHTML = `
        <div class="form-group">
          <label>체험자 이름 <span class="required">*</span></label>
          <input type="text" id="fClientName" placeholder="체험자 이름" value="${esc(f.clientName||'')}"/>
        </div>
        <div class="form-group">
          <label>연락처</label>
          <input type="tel" id="fClientContact" placeholder="010-0000-0000" value="${esc(f.clientContact||'')}"/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>체험 금액 (1인)</label>
            <div class="input-with-unit">
              <input type="number" id="fTrialFee" placeholder="0" min="0" step="1000" value="${trialFeeVal}"/>
              <span class="input-unit">원</span>
            </div>
          </div>
          <div class="form-group" style="max-width:110px">
            <label>인원</label>
            <div class="input-with-unit">
              <input type="number" id="fPersonCount" placeholder="1" min="1" step="1" value="${personVal}"/>
              <span class="input-unit">명</span>
            </div>
          </div>
        </div>
        <div class="incentive-calc-info" id="trialCalcInfo">${initCalcHtml}</div>
        <div class="form-group" style="margin-top:6px">
          <label class="noshow-check-label">
            <input type="checkbox" id="fNoshow" ${f.noshow ? 'checked' : ''}/>
            <span class="noshow-check-text">🚫 노쇼</span>
          </label>
        </div>
        <div class="review-res-divider"></div>
        <div class="form-group" style="margin-bottom:6px">
          <label class="noshow-check-label">
            <input type="checkbox" id="fReserved" ${f.reserved ? 'checked' : ''}/>
            <span class="noshow-check-text">📅 수업 예약 완료</span>
          </label>
        </div>
        <div id="reserveNameGroup" style="display:${f.reserved ? '' : 'none'}">
          <div class="form-group">
            <label>예약자 이름</label>
            <input type="text" id="fReserveName" placeholder="예약 등록 이름" value="${esc(f.reserveName||'')}"/>
          </div>
        </div>
        <div class="review-res-divider"></div>
        <div class="form-group">
          <label>일정 상태</label>
          <div class="sales-radio-group status-radio-grp">${renderStatusFieldHtml(f.status||'')}</div>
        </div>
        <div class="inc-sales-divider"></div>
        <div class="form-group" style="margin-bottom:4px">
          <label class="inc-sales-toggle-label">
            <input type="checkbox" id="fTrialRegLink" ${f.linkedRegistration ? 'checked' : ''}/>
            <span>✅ 체험 후 등록</span>
          </label>
        </div>
        <div id="trialRegFields" style="display:${f.linkedRegistration ? '' : 'none'}">
          <div class="inc-sales-note">아래 정보는 매출 현황에도 함께 표시됩니다</div>
          <div class="form-group">
            <label>등록 구분</label>
            <div class="sales-radio-group" id="trialLinkedRegGroup">
              ${['신규','재등록','휴면'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.regType||'신규')===v?' active':''}"><input type="radio" name="trialLinkedRegType" value="${v}" ${(f.linkedRegistration?.regType||'신규')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>수업 유형</label>
            <div class="sales-radio-group" id="trialLinkedLessonGroup">
              ${['그룹','개인레슨'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.lessonType||'그룹')===v?' active':''}"><input type="radio" name="trialLinkedLessonType" value="${v}" ${(f.linkedRegistration?.lessonType||'그룹')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group" id="trialLinkedDurGroup" style="${(f.linkedRegistration?.lessonType==='개인레슨')?'display:none':''}">
            <label>회원권 기간</label>
            <div class="sales-radio-group" id="trialLinkedDurRadioGroup">
              ${['1개월','3개월','6개월'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.duration||'3개월')===v?' active':''}"><input type="radio" name="trialLinkedDuration" value="${v}" ${(f.linkedRegistration?.duration||'3개월')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group" id="trialLinkedFreqGroup" style="${(f.linkedRegistration?.lessonType==='개인레슨')?'display:none':''}">
            <label>회원권 횟수</label>
            <div class="sales-radio-group" id="trialLinkedFreqRadioGroup">
              ${['주1회','주2회','주3회','주5회'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.freq||'주3회')===v?' active':''}"><input type="radio" name="trialLinkedFreq" value="${v}" ${(f.linkedRegistration?.freq||'주3회')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group" id="trialLinkedSessionGroup" style="${(f.linkedRegistration?.lessonType==='개인레슨')?'':'display:none'}">
            <label>수업 횟수</label>
            <div class="input-with-unit">
              <input type="number" id="fTrialLinkedSessionCount" placeholder="0" min="1" step="1" value="${f.linkedRegistration?.sessionCount||''}"/>
              <span class="input-unit">회</span>
            </div>
          </div>
          <div class="form-group">
            <label>결제 금액</label>
            <div class="input-with-unit">
              <input type="text" inputmode="numeric" id="fTrialLinkedPayment" placeholder="0" value="${fmtAmt(f.linkedRegistration?.payment||'')}"/>
              <span class="input-unit">원</span>
            </div>
          </div>
          <div class="inc-sales-divider" style="margin:6px 0 4px"></div>
          <div class="form-group" style="margin-bottom:4px">
            <label class="inc-sales-toggle-label">
              <input type="checkbox" id="fTrialIncLink" ${f.linkedIncentive ? 'checked' : ''}/>
              <span>💜 인센티브 적용</span>
            </label>
          </div>
          <div id="trialIncFields" style="display:${f.linkedIncentive ? '' : 'none'}">
            <div class="form-group">
              <label>담당 강사</label>
              <input type="text" id="fTrialLinkedStaff" placeholder="강사 이름" value="${esc(f.linkedIncentive?.staffName||'')}"/>
            </div>
            <div class="form-group">
              <label>회원 이름</label>
              <input type="text" id="fTrialLinkedMember" placeholder="회원 이름" value="${esc(f.linkedIncentive?.memberName||'')}"/>
            </div>
            <div class="form-group">
              <label>인센티브 금액</label>
              <div class="input-with-unit">
                <input type="text" inputmode="numeric" id="fTrialLinkedIncAmt" placeholder="0" value="${fmtAmt(f.linkedIncentive?.amt||'')}"/>
                <span class="input-unit">원</span>
              </div>
            </div>
          </div>
        </div>`;

      const updateTrialFeeCalc = () => {
        const fee = Number(document.getElementById('fTrialFee')?.value) || 0;
        const cnt = Math.max(1, Number(document.getElementById('fPersonCount')?.value) || 1);
        const tot = fee * cnt;
        const el  = document.getElementById('trialCalcInfo');
        if (!el) return;
        el.innerHTML = fee > 0
          ? `<span class="calc-rate">${fee.toLocaleString()}원 × ${cnt}명 = </span><span class="calc-amt">${tot.toLocaleString()}원</span>`
          : `<span class="calc-placeholder">금액 입력 시 합계 표시</span>`;
      };
      document.getElementById('fTrialFee')?.addEventListener('input', updateTrialFeeCalc);
      document.getElementById('fPersonCount')?.addEventListener('input', updateTrialFeeCalc);
      document.getElementById('fReserved')?.addEventListener('change', e => {
        document.getElementById('reserveNameGroup').style.display = e.target.checked ? '' : 'none';
        if (e.target.checked) setTimeout(() => document.getElementById('fReserveName')?.focus(), 50);
      });
      bindStatusRadios(container);

      // 체험 후 등록 토글
      document.getElementById('fTrialRegLink')?.addEventListener('change', e => {
        document.getElementById('trialRegFields').style.display = e.target.checked ? '' : 'none';
      });
      // 인센티브 토글
      document.getElementById('fTrialIncLink')?.addEventListener('change', e => {
        document.getElementById('trialIncFields').style.display = e.target.checked ? '' : 'none';
        if (e.target.checked) setTimeout(() => document.getElementById('fTrialLinkedStaff')?.focus(), 50);
      });
      // 수업유형 전환
      container.querySelectorAll('input[name="trialLinkedLessonType"]').forEach(r => {
        r.addEventListener('change', () => {
          const isP = r.value === '개인레슨';
          document.getElementById('trialLinkedDurGroup').style.display     = isP ? 'none' : '';
          document.getElementById('trialLinkedFreqGroup').style.display    = isP ? 'none' : '';
          document.getElementById('trialLinkedSessionGroup').style.display = isP ? '' : 'none';
        });
      });
      // 라디오 active 처리
      ['trialLinkedRegGroup','trialLinkedLessonGroup','trialLinkedDurRadioGroup','trialLinkedFreqRadioGroup'].forEach(grpId => {
        const grp = document.getElementById(grpId);
        if (!grp) return;
        grp.querySelectorAll('.sales-radio-label').forEach(lbl => {
          lbl.addEventListener('click', () => {
            grp.querySelectorAll('.sales-radio-label').forEach(l => l.classList.remove('active'));
            lbl.classList.add('active');
          });
        });
      });
      // 금액 포맷
      initAmtInput('fTrialLinkedPayment');
      initAmtInput('fTrialLinkedIncAmt');

      setTimeout(() => document.getElementById('fClientName')?.focus(), 80);
      break;
    }
    case 'review': {
      container.innerHTML = `
        <div class="form-group">
          <label>체험단 이름 <span class="required">*</span></label>
          <input type="text" id="fClientName" placeholder="체험단 이름" value="${esc(f.clientName||'')}"/>
        </div>
        <div class="form-group">
          <label>연락처</label>
          <input type="tel" id="fClientContact" placeholder="010-0000-0000" value="${esc(f.clientContact||'')}"/>
        </div>
        <div class="form-group">
          <label class="noshow-check-label">
            <input type="checkbox" id="fNoshow" ${f.noshow ? 'checked' : ''}/>
            <span class="noshow-check-text">🚫 노쇼</span>
          </label>
        </div>
        <div class="review-res-divider"></div>
        <div class="form-group" style="margin-bottom:6px">
          <label class="noshow-check-label">
            <input type="checkbox" id="fReserved" ${f.reserved ? 'checked' : ''}/>
            <span class="noshow-check-text">📅 수업 예약 완료</span>
          </label>
        </div>
        <div id="reserveNameGroup" style="display:${f.reserved ? '' : 'none'}">
          <div class="form-group">
            <label>예약자 이름 <span class="required">*</span></label>
            <input type="text" id="fReserveName" placeholder="예약 등록 이름" value="${esc(f.reserveName||'')}"/>
          </div>
        </div>
        <div class="review-res-divider"></div>
        <div class="form-group">
          <label>일정 상태</label>
          <div class="sales-radio-group status-radio-grp">${renderStatusFieldHtml(f.status||'')}</div>
        </div>`;
      document.getElementById('fReserved')?.addEventListener('change', e => {
        document.getElementById('reserveNameGroup').style.display = e.target.checked ? '' : 'none';
        if (e.target.checked) setTimeout(() => document.getElementById('fReserveName')?.focus(), 50);
      });
      bindStatusRadios(container);
      setTimeout(() => document.getElementById('fClientName')?.focus(), 80);
      break;
    }
    case 'consult': {
      container.innerHTML = `
        <div class="form-group">
          <label>이름 <span class="required">*</span></label>
          <input type="text" id="fClientName" placeholder="상담자 이름" value="${esc(f.clientName||'')}"/>
        </div>
        <div class="form-group">
          <label>연락처</label>
          <input type="tel" id="fClientContact" placeholder="010-0000-0000" value="${esc(f.clientContact||'')}"/>
        </div>
        <div class="review-res-divider"></div>
        <div class="form-group">
          <label>일정 상태</label>
          <div class="sales-radio-group status-radio-grp">${renderStatusFieldHtml(f.status||'')}</div>
        </div>
        <div class="inc-sales-divider"></div>
        <div class="form-group" style="margin-bottom:4px">
          <label class="inc-sales-toggle-label">
            <input type="checkbox" id="fConsultRegLink" ${f.linkedRegistration ? 'checked' : ''}/>
            <span>✅ 상담 후 등록</span>
          </label>
        </div>
        <div id="consultRegFields" style="display:${f.linkedRegistration ? '' : 'none'}">
          <div class="inc-sales-note">아래 정보는 매출 현황에도 함께 표시됩니다</div>
          <div class="form-group">
            <label>등록 구분</label>
            <div class="sales-radio-group" id="consultLinkedRegGroup">
              ${['신규','재등록','휴면'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.regType||'신규')===v?' active':''}"><input type="radio" name="consultLinkedRegType" value="${v}" ${(f.linkedRegistration?.regType||'신규')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>수업 유형</label>
            <div class="sales-radio-group" id="consultLinkedLessonGroup">
              ${['그룹','개인레슨'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.lessonType||'그룹')===v?' active':''}"><input type="radio" name="consultLinkedLessonType" value="${v}" ${(f.linkedRegistration?.lessonType||'그룹')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group" id="consultLinkedDurGroup" style="${(f.linkedRegistration?.lessonType==='개인레슨')?'display:none':''}">
            <label>회원권 기간</label>
            <div class="sales-radio-group" id="consultLinkedDurRadioGroup">
              ${['1개월','3개월','6개월'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.duration||'3개월')===v?' active':''}"><input type="radio" name="consultLinkedDuration" value="${v}" ${(f.linkedRegistration?.duration||'3개월')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group" id="consultLinkedFreqGroup" style="${(f.linkedRegistration?.lessonType==='개인레슨')?'display:none':''}">
            <label>회원권 횟수</label>
            <div class="sales-radio-group" id="consultLinkedFreqRadioGroup">
              ${['주1회','주2회','주3회','주5회'].map(v=>`<label class="sales-radio-label${(f.linkedRegistration?.freq||'주3회')===v?' active':''}"><input type="radio" name="consultLinkedFreq" value="${v}" ${(f.linkedRegistration?.freq||'주3회')===v?'checked':''}/><span>${v}</span></label>`).join('')}
            </div>
          </div>
          <div class="form-group" id="consultLinkedSessionGroup" style="${(f.linkedRegistration?.lessonType==='개인레슨')?'':'display:none'}">
            <label>수업 횟수</label>
            <div class="input-with-unit">
              <input type="number" id="fConsultLinkedSessionCount" placeholder="0" min="1" step="1" value="${f.linkedRegistration?.sessionCount||''}"/>
              <span class="input-unit">회</span>
            </div>
          </div>
          <div class="form-group">
            <label>결제 금액</label>
            <div class="input-with-unit">
              <input type="text" inputmode="numeric" id="fConsultLinkedPayment" placeholder="0" value="${fmtAmt(f.linkedRegistration?.payment||'')}"/>
              <span class="input-unit">원</span>
            </div>
          </div>
          <div class="inc-sales-divider" style="margin:6px 0 4px"></div>
          <div class="form-group" style="margin-bottom:4px">
            <label class="inc-sales-toggle-label">
              <input type="checkbox" id="fConsultIncLink" ${f.linkedIncentive ? 'checked' : ''}/>
              <span>💜 인센티브 적용</span>
            </label>
          </div>
          <div id="consultIncFields" style="display:${f.linkedIncentive ? '' : 'none'}">
            <div class="form-group">
              <label>담당 강사</label>
              <input type="text" id="fConsultLinkedStaff" placeholder="강사 이름" value="${esc(f.linkedIncentive?.staffName||'')}"/>
            </div>
            <div class="form-group">
              <label>회원 이름</label>
              <input type="text" id="fConsultLinkedMember" placeholder="회원 이름" value="${esc(f.linkedIncentive?.memberName||'')}"/>
            </div>
            <div class="form-group">
              <label>인센티브 금액</label>
              <div class="input-with-unit">
                <input type="text" inputmode="numeric" id="fConsultLinkedIncAmt" placeholder="0" value="${fmtAmt(f.linkedIncentive?.amt||'')}"/>
                <span class="input-unit">원</span>
              </div>
            </div>
          </div>
        </div>`;
      initTelInput('fClientContact');
      bindStatusRadios(container);

      // 상담 후 등록 토글
      document.getElementById('fConsultRegLink')?.addEventListener('change', e => {
        document.getElementById('consultRegFields').style.display = e.target.checked ? '' : 'none';
      });
      // 인센티브 토글
      document.getElementById('fConsultIncLink')?.addEventListener('change', e => {
        document.getElementById('consultIncFields').style.display = e.target.checked ? '' : 'none';
        if (e.target.checked) setTimeout(() => document.getElementById('fConsultLinkedStaff')?.focus(), 50);
      });
      // 수업유형 전환
      container.querySelectorAll('input[name="consultLinkedLessonType"]').forEach(r => {
        r.addEventListener('change', () => {
          const isP = r.value === '개인레슨';
          document.getElementById('consultLinkedDurGroup').style.display     = isP ? 'none' : '';
          document.getElementById('consultLinkedFreqGroup').style.display    = isP ? 'none' : '';
          document.getElementById('consultLinkedSessionGroup').style.display = isP ? '' : 'none';
        });
      });
      // 라디오 active 처리
      ['consultLinkedRegGroup','consultLinkedLessonGroup','consultLinkedDurRadioGroup','consultLinkedFreqRadioGroup'].forEach(grpId => {
        const grp = document.getElementById(grpId);
        if (!grp) return;
        grp.querySelectorAll('.sales-radio-label').forEach(lbl => {
          lbl.addEventListener('click', () => {
            grp.querySelectorAll('.sales-radio-label').forEach(l => l.classList.remove('active'));
            lbl.classList.add('active');
          });
        });
      });
      // 금액 포맷
      initAmtInput('fConsultLinkedPayment');
      initAmtInput('fConsultLinkedIncAmt');

      setTimeout(() => document.getElementById('fClientName')?.focus(), 80);
      break;
    }
    case 'classnoshow': {
      container.innerHTML = `
        <div class="form-group">
          <label>수강생 이름 <span class="required">*</span></label>
          <input type="text" id="fStudentName" placeholder="수강생 이름" value="${esc(f.studentName||'')}"/>
        </div>
        <div class="form-group">
          <label>연락처</label>
          <input type="tel" id="fStudentContact" placeholder="010-0000-0000" value="${esc(f.studentContact||'')}"/>
        </div>
        <div class="form-group">
          <label>수업명</label>
          <input type="text" id="fClassName" placeholder="노쇼가 발생한 수업명" value="${esc(f.className||'')}"/>
        </div>`;
      setTimeout(() => document.getElementById('fStudentName')?.focus(), 80);
      break;
    }

    case 'sales': {
      // 구버전 호환: regType이 '개인레슨'이었던 경우 lessonType으로 마이그레이션
      const regType      = (f.regType === '개인레슨') ? '신규' : (f.regType || '신규');
      const lessonType   = f.lessonType || (f.regType === '개인레슨' ? '개인레슨' : '그룹');
      const duration     = f.duration     || '3개월';
      const freq         = f.freq         || '주3회';
      const sessionCount = f.sessionCount !== undefined ? f.sessionCount : '';
      const payment      = f.payment      !== undefined ? f.payment : '';
      const isPersonal   = lessonType === '개인레슨';

      const regOpts    = ['신규','재등록','휴면'].map(v =>
        `<label class="sales-radio-label${regType===v?' active':''}">
          <input type="radio" name="salesRegType" value="${v}" ${regType===v?'checked':''}/>
          <span>${v}</span>
        </label>`).join('');
      const lessonOpts = ['그룹','개인레슨'].map(v =>
        `<label class="sales-radio-label${lessonType===v?' active':''}">
          <input type="radio" name="salesLessonType" value="${v}" ${lessonType===v?'checked':''}/>
          <span>${v}</span>
        </label>`).join('');
      const durOpts    = ['1개월','3개월','6개월'].map(v =>
        `<label class="sales-radio-label${duration===v?' active':''}">
          <input type="radio" name="salesDuration" value="${v}" ${duration===v?'checked':''}/>
          <span>${v}</span>
        </label>`).join('');
      const freqOpts   = ['주1회','주2회','주3회','주5회'].map(v =>
        `<label class="sales-radio-label${freq===v?' active':''}">
          <input type="radio" name="salesFreq" value="${v}" ${freq===v?'checked':''}/>
          <span>${v}</span>
        </label>`).join('');

      container.innerHTML = `
        <div class="form-group">
          <label>고객 이름 <span class="required">*</span></label>
          <input type="text" id="fSalesClientName" placeholder="고객 이름" value="${esc(f.clientName||'')}"/>
        </div>
        <div class="form-group">
          <label>등록 구분 <span class="required">*</span></label>
          <div class="sales-radio-group">${regOpts}</div>
        </div>
        <div class="form-group">
          <label>수업 유형</label>
          <div class="sales-radio-group">${lessonOpts}</div>
        </div>
        <div class="form-group" id="salesDurationGroup" style="${isPersonal ? 'display:none' : ''}">
          <label>회원권 기간</label>
          <div class="sales-radio-group">${durOpts}</div>
        </div>
        <div class="form-group" id="salesFreqGroup" style="${isPersonal ? 'display:none' : ''}">
          <label>회원권 횟수</label>
          <div class="sales-radio-group">${freqOpts}</div>
        </div>
        <div class="form-group" id="salesSessionGroup" style="${isPersonal ? '' : 'display:none'}">
          <label>수업 횟수</label>
          <div class="input-with-unit">
            <input type="number" id="fSalesSessionCount" placeholder="0" min="1" step="1" value="${sessionCount}"/>
            <span class="input-unit">회</span>
          </div>
        </div>
        <div class="form-group">
          <label>결제 금액 <span class="required">*</span></label>
          <div class="input-with-unit">
            <input type="number" id="fSalesPayment" placeholder="0" min="0" step="10000" value="${payment}"/>
            <span class="input-unit">원</span>
          </div>
        </div>`;

      // 라디오 active 스타일 + 수업유형 전환 처리
      container.querySelectorAll('input[type="radio"]').forEach(r => {
        r.addEventListener('change', () => {
          const grp = r.closest('.sales-radio-group');
          if (grp) {
            grp.querySelectorAll('.sales-radio-label').forEach(l => l.classList.remove('active'));
            r.closest('.sales-radio-label')?.classList.add('active');
          }
          if (r.name === 'salesLessonType') {
            const personal = r.value === '개인레슨';
            document.getElementById('salesDurationGroup').style.display = personal ? 'none' : '';
            document.getElementById('salesFreqGroup').style.display     = personal ? 'none' : '';
            document.getElementById('salesSessionGroup').style.display  = personal ? '' : 'none';
            if (personal) setTimeout(() => document.getElementById('fSalesSessionCount')?.focus(), 50);
          }
        });
      });

      setTimeout(() => document.getElementById('fSalesClientName')?.focus(), 80);
      break;
    }

    default:
      container.innerHTML = '';
  }
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
      renderExtraFields(cat.id, null); // 카테고리 변경 시 동적 폼 교체
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
  const date     = document.getElementById('fDate').value;
  const time     = document.getElementById('fTime').value;
  const type     = getActiveTypeId();
  const isSysCat = SYSTEM_CAT_IDS.includes(type);

  // extraFields 수집 (시스템 카테고리)
  const extraFields = isSysCat ? collectExtraFields(type) : null;

  // 제목 결정: 시스템 카테고리는 자동 생성, 아니면 직접 입력
  const title = isSysCat
    ? autoTitle(type, extraFields)
    : document.getElementById('fTitle').value.trim();

  const desc = document.getElementById('fDesc').innerHTML.trim(); // 시스템 카테고리도 메모 저장

  if (!date) { showToast('날짜를 입력해주세요.'); return; }
  if (!title) { showToast('필수 항목을 입력해주세요.'); return; }

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
        extraFields: extraFields || old.extraFields || null,
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
      id:          crypto.randomUUID(),
      date, title, time, desc, type,
      extraFields: extraFields,
      createdBy:   byUser,
      createdAt:   now,
      updatedBy:   null,
      updatedAt:   null,
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

  // 인센티브 기본값 섹션 (관리자·서브 관리자)
  const incSection = document.getElementById('sectionIncentiveDefaults');
  if (incSection) {
    incSection.classList.toggle('hidden', !isAdminMode && !isSubAdmin);
    if (isAdminMode || isSubAdmin) {
      const trialInput = document.getElementById('incentiveDefaultTrialAmt');
      const rateInput  = document.getElementById('incentiveDefaultConsultRate');
      if (trialInput) trialInput.value = incentiveDefaults.trialAmount;
      if (rateInput)  rateInput.value  = incentiveDefaults.consultRate;
    }
  }

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

  // ── 드래그 상태 ──────────────────────────────────
  let dragSrc = null;   // 드래그 중인 category 객체

  settingsDraft.categories.forEach(cat => {
    const isSys = SYSTEM_CAT_IDS.includes(cat.id);
    const row = document.createElement('div');
    row.className = 'category-row' + (isSys ? ' category-row--system' : '');
    row.draggable = true;

    // 드래그 핸들
    const handle = document.createElement('span');
    handle.className = 'cat-drag-handle';
    handle.textContent = '⠿';
    handle.title = '드래그하여 순서 변경';
    row.appendChild(handle);

    if (isSys) {
      // 고정 카테고리: 이름 고정, 색상만 변경 가능
      const inner = document.createElement('span');
      inner.className = 'cat-row-inner';
      inner.innerHTML = `
        <span class="cat-lock-icon">🔒</span>
        <span class="cat-color-dot" style="background:${cat.color}"></span>
        <span class="cat-name-fixed">${esc(cat.name)}</span>
        <input class="cat-color-input" type="color" value="${cat.color}" title="색상 변경 가능"/>`;
      inner.querySelector('.cat-color-input').addEventListener('input', e => {
        cat.color = e.target.value;
        inner.querySelector('.cat-color-dot').style.background = e.target.value;
      });
      row.appendChild(inner);
    } else {
      // 사용자 카테고리: 이름·색상 변경 + 삭제 가능
      const inner = document.createElement('span');
      inner.className = 'cat-row-inner';
      inner.innerHTML = `
        <span class="cat-color-dot" style="background:${cat.color}"></span>
        <input class="cat-name-input"  type="text"  value="${esc(cat.name)}" />
        <input class="cat-color-input" type="color" value="${cat.color}" />
        <button class="btn-cat-delete">×</button>`;
      inner.querySelector('.cat-name-input').addEventListener('input', e => { cat.name = e.target.value; });
      inner.querySelector('.cat-color-input').addEventListener('input', e => {
        cat.color = e.target.value;
        inner.querySelector('.cat-color-dot').style.background = e.target.value;
      });
      inner.querySelector('.btn-cat-delete').addEventListener('click', () => {
        settingsDraft.categories = settingsDraft.categories.filter(c => c !== cat);
        renderCategoryList();
      });
      row.appendChild(inner);
    }

    // ── HTML5 Drag & Drop 이벤트 ─────────────────
    row.addEventListener('dragstart', e => {
      dragSrc = cat;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // Firefox 필수
      // 약간의 지연 후 스타일 적용 (캡처 이미지가 스타일 반영 전에 찍힘)
      requestAnimationFrame(() => row.classList.add('cat-dragging'));
    });

    row.addEventListener('dragend', () => {
      dragSrc = null;
      el.querySelectorAll('.cat-dragging, .cat-drag-over-top, .cat-drag-over-bot')
        .forEach(r => r.classList.remove('cat-dragging','cat-drag-over-top','cat-drag-over-bot'));
    });

    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === cat) return;
      e.dataTransfer.dropEffect = 'move';
      // 마우스 위치로 위/아래 삽입 구분
      const rect = row.getBoundingClientRect();
      const mid  = rect.top + rect.height / 2;
      el.querySelectorAll('.cat-drag-over-top,.cat-drag-over-bot')
        .forEach(r => r.classList.remove('cat-drag-over-top','cat-drag-over-bot'));
      row.classList.add(e.clientY < mid ? 'cat-drag-over-top' : 'cat-drag-over-bot');
    });

    row.addEventListener('dragleave', e => {
      // 자식 요소로 이동 시 무시
      if (row.contains(e.relatedTarget)) return;
      row.classList.remove('cat-drag-over-top','cat-drag-over-bot');
    });

    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === cat) return;
      const cats   = settingsDraft.categories;
      const srcIdx = cats.indexOf(dragSrc);
      let   dstIdx = cats.indexOf(cat);
      if (srcIdx < 0 || dstIdx < 0) return;

      // 아래쪽 절반에 드롭하면 대상 다음에 삽입
      const rect = row.getBoundingClientRect();
      const insertAfter = e.clientY >= rect.top + rect.height / 2;
      cats.splice(srcIdx, 1);
      dstIdx = cats.indexOf(cat); // splice 후 재계산
      cats.splice(insertAfter ? dstIdx + 1 : dstIdx, 0, dragSrc);

      dragSrc = null;
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

async function saveIncentiveDefaults() {
  const trialAmt  = Number(document.getElementById('incentiveDefaultTrialAmt')?.value);
  const consultRt = Number(document.getElementById('incentiveDefaultConsultRate')?.value);
  const btn       = document.getElementById('btnSaveIncentiveDefaults');

  if (isNaN(trialAmt) || trialAmt < 0) { showToast('체험등록 금액을 올바르게 입력해주세요.'); return; }
  if (isNaN(consultRt) || consultRt < 0 || consultRt > 100) { showToast('비율은 0~100 사이로 입력해주세요.'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
  try {
    const resp = await fetch('/api/admin/incentive-defaults', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body:    JSON.stringify({ trialAmount: trialAmt, consultRate: consultRt }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      incentiveDefaults = data.defaults;
      showToast(`✅ 저장됨 — 체험 ${trialAmt.toLocaleString()}원 / 상담 ${consultRt}%`);
    } else {
      showToast('저장 실패: 관리자 권한이 필요합니다.');
    }
  } catch {
    showToast('서버에 연결할 수 없습니다.');
  }
  if (btn) { btn.disabled = false; btn.textContent = '💾 인센티브 기본값 저장'; }
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
    loadHolidaysForYear(currentYear);
    renderCurrentView();
  });
  document.getElementById('btnNext').addEventListener('click', () => {
    if (++currentMonth > 11) { currentMonth = 0; currentYear++; }
    loadHolidaysForYear(currentYear);
    renderCurrentView();
  });
  document.getElementById('btnToday').addEventListener('click', () => {
    const n = new Date(); currentYear = n.getFullYear(); currentMonth = n.getMonth();
    renderCurrentView();
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

  // ── 로고 / 타이틀 클릭 → 새로고침 ──
  document.getElementById('headerBrand').addEventListener('click', () => location.reload());

  // ── 새로고침 ──
  document.getElementById('btnRefresh').addEventListener('click', refreshSync);

  // ── 설정 ──
  document.getElementById('btnSettings').addEventListener('click', openSettingsWithAuth);
  document.getElementById('btnSettingsClose').addEventListener('click', closeSettings);
  document.getElementById('btnCancelSettings').addEventListener('click', closeSettings);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettingsData);
  document.getElementById('btnAddCategory').addEventListener('click', addCategory);
  document.getElementById('btnSaveIncentiveDefaults')?.addEventListener('click', saveIncentiveDefaults);
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

  // ── 검색 ──
  document.getElementById('btnSearch')?.addEventListener('click', openSearch);
  document.getElementById('btnSearchClose')?.addEventListener('click', closeSearch);
  document.getElementById('btnSearchClear')?.addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    performSearch();
    document.getElementById('searchInput').focus();
  });
  document.getElementById('searchInput')?.addEventListener('input', performSearch);
  document.getElementById('searchOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'searchOverlay') closeSearch();
  });

  // ── ESC ──
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('searchOverlay').classList.contains('hidden')) {
      closeSearch(); return;
    }
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
