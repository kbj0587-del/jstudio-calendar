/* ══ J.SMS 발송센터 — 공용 로직 (인증·API·헤더·유틸) ══ */

/* 캘린더 앱과 동일한 localStorage 키를 재사용 → 같은 브라우저에서 자동 인증 */
const SMS_ADMIN_PW = () => localStorage.getItem('cc_admin_pw') || '';
const SMS_USER_ID  = () => localStorage.getItem('cc_user_id')  || '';

function smsHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (SMS_ADMIN_PW()) h['x-admin-password'] = SMS_ADMIN_PW();
  else if (SMS_USER_ID()) h['x-user-id'] = SMS_USER_ID();
  return h;
}

async function smsApi(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: smsHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403 || res.status === 401) {
    showGate();
    throw new Error('auth');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
  return data;
}
const api = {
  get:  (p) => smsApi('GET', p),
  post: (p, b) => smsApi('POST', p, b),
  put:  (p, b) => smsApi('PUT', p, b),
  del:  (p) => smsApi('DELETE', p),
};

/* ── 유틸 ── */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function digits(s){ return String(s||'').replace(/\D/g,''); }
function fmtPhone(s){
  const d = digits(s);
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/,'$1-$2-$3');
  if (d.length === 10 && d.startsWith('02')) return d.replace(/(\d{2})(\d{4})(\d{4})/,'$1-$2-$3');
  if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3');
  if (d.length === 9 && d.startsWith('02')) return d.replace(/(\d{2})(\d{3})(\d{4})/,'$1-$2-$3');
  return s || '';
}
/* SMS 바이트: 한글/전각 2바이트, 그 외 1바이트 (EUC-KR 기준) */
function smsBytes(str){
  let b = 0;
  for (const ch of String(str||'')) b += (ch.charCodeAt(0) > 0x7f) ? 2 : 1;
  return b;
}
function msgTypeByBytes(bytes, hasImage){
  if (hasImage) return 'MMS';
  return bytes <= 90 ? 'SMS' : 'LMS';
}
function relTime(iso){
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return Math.floor(diff/60) + '분 전';
  if (diff < 86400 && d.getDate() === now.getDate()) return d.toTimeString().slice(0,5);
  if (diff < 172800) return '어제';
  return (d.getMonth()+1) + '/' + d.getDate();
}
function fmtDateTime(iso){
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const AVATAR_COLORS = ['#0071e3','#34c759','#ff9500','#af52de','#ff2d55','#5ac8fa','#ffcc00','#ff3b30'];
function avatarColor(seed){
  let h = 0; for (const c of String(seed||'')) h = (h*31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initial(name){ return (String(name||'?').trim()[0] || '?').toUpperCase(); }

/* ── 토스트 ── */
function toast(msg){
  let t = document.getElementById('toast');
  if (!t){ t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ── 모달 ── */
function openModal(html){
  let ov = document.getElementById('modalHost');
  if (!ov){ ov = document.createElement('div'); ov.id = 'modalHost'; document.body.appendChild(ov); }
  ov.innerHTML =
    `<div class="overlay"><div class="overlay-bg" onclick="closeModal()"></div>
     <div class="modal">${html}</div></div>`;
}
function closeModal(){ const ov = document.getElementById('modalHost'); if (ov) ov.innerHTML = ''; }

/* ── 인증 게이트 ── */
function showGate(){
  if (document.getElementById('gate')) return;
  const g = document.createElement('div');
  g.id = 'gate';
  g.innerHTML =
    `<div class="overlay"><div class="overlay-bg"></div>
      <div class="modal">
        <div class="hdr-logo" style="margin:0 auto 4px">J</div>
        <h3>발송센터 관리자 인증</h3>
        <p style="color:var(--muted);font-size:13px;margin:-6px 0 4px">관리자 비밀번호를 입력하세요.</p>
        <input id="gatePw" class="inp" type="password" placeholder="관리자 비밀번호" autofocus>
        <button class="btn" onclick="submitGate()">확인</button>
        <div id="gateErr" style="color:var(--red);font-size:12.5px;min-height:16px"></div>
      </div></div>`;
  document.body.appendChild(g);
  const inp = document.getElementById('gatePw');
  inp.focus();
  inp.addEventListener('keydown', (e)=>{ if (e.key==='Enter') submitGate(); });
}
async function submitGate(){
  const pw = document.getElementById('gatePw').value.trim();
  if (!pw) return;
  // 검증: bootstrap 시도
  const res = await fetch('/api/sms/bootstrap', { headers: { 'x-admin-password': pw } });
  if (res.ok){
    localStorage.setItem('cc_admin_pw', pw);
    document.getElementById('gate').remove();
    if (window.onAuthReady) window.onAuthReady();
  } else {
    document.getElementById('gateErr').textContent = '비밀번호가 올바르지 않습니다.';
  }
}

/* ── 공통 헤더/탭바 렌더 ── */
const SMS_PAGES = [
  { key:'index',     href:'index.html',     label:'발송센터', icon:'send' },
  { key:'contacts',  href:'contacts.html',  label:'연락처',   icon:'users' },
  { key:'groups',    href:'groups.html',    label:'그룹',     icon:'grid' },
  { key:'templates', href:'templates.html', label:'템플릿',   icon:'file' },
  { key:'history',   href:'history.html',   label:'이력',     icon:'clock' },
  { key:'autoreply', href:'autoreply.html', label:'자동응답', icon:'chat' },
];
const ICONS = {
  send:'<path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>',
  grid:'<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path>',
  clock:'<circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>',
  chat:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',
};
function svgIcon(name, size){
  return `<svg width="${size||22}" height="${size||22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;
}

function renderHeader(active, rightHtml){
  const nav = SMS_PAGES.filter(p=>p.key!=='index').map(p =>
    `<a class="nav-link ${p.key===active?'active':''}" href="${p.href}">${p.label}</a>`).join('');
  const el = document.getElementById('hdr');
  el.className = 'hdr';
  el.innerHTML =
    `<a class="hdr-brand" href="index.html" style="color:inherit">
       <div class="hdr-logo">J</div>
       <div><div class="hdr-title">메시지 발송센터</div><div class="hdr-sub">J.SMS 게이트웨이</div></div>
     </a>
     <div class="hdr-nav">${nav}${rightHtml||''}<span class="pill pill-gray" id="pushPill" onclick="togglePush()" style="cursor:pointer;display:none">🔔</span></div>`;
  // 모바일 탭바
  let tb = document.getElementById('tabbar');
  if (!tb){ tb = document.createElement('div'); tb.id='tabbar'; tb.className='tabbar'; document.body.appendChild(tb); }
  tb.innerHTML = SMS_PAGES.map(p =>
    `<a class="${p.key===active?'active':''}" href="${p.href}">${svgIcon(p.icon,22)}<span>${p.label}</span></a>`).join('');
  initPushUi();
}

/* ══ PWA: /sms/ 전용 서비스워커 등록 ══
   scope를 /sms/ 로 명시해 루트 캘린더 SW와 분리한다.
   이게 있어야 Chrome이 J.SMS를 "별도 앱"으로 설치 제안한다. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sms/sw.js', { scope: '/sms/' })
      .then(r => console.log('[J.SMS] SW 등록됨, scope=', r.scope))
      .catch(e => console.warn('[J.SMS] SW 등록 실패', e));
  });
}

/* ══ Web Push: 새 문자 알림 + 앱 배지 (윈도우·맥·아이폰 공용) ══
   ⚠️ 아이폰은 "홈 화면에 추가"로 설치한 상태에서만 알림·배지가 동작한다
   (사파리 탭 상태로는 iOS가 지원 안 함 — Apple 정책, 우리 쪽에서 우회 불가). */
function _b64ToUint8(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function _pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function updatePushPill(state) {
  const el = document.getElementById('pushPill');
  if (!el) return;
  if (state === 'on') { el.textContent = '🔔 알림 켜짐'; el.className = 'pill pill-blue'; }
  else { el.textContent = '🔕 알림'; el.className = 'pill pill-gray'; }
}
async function initPushUi() {
  const el = document.getElementById('pushPill');
  if (!el || !_pushSupported()) { if (el) el.style.display = 'none'; return; }
  el.style.display = '';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    updatePushPill(sub ? 'on' : 'off');
  } catch (_) { updatePushPill('off'); }
}
async function togglePush() {
  if (!_pushSupported()) return toast('이 브라우저에서는 알림을 지원하지 않습니다');
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    try { await api.post('/api/sms/push/unsubscribe', { endpoint: existing.endpoint }); } catch (_) {}
    await existing.unsubscribe();
    updatePushPill('off');
    return toast('알림을 껐습니다');
  }
  if (Notification.permission === 'denied') {
    return toast('알림 권한이 차단돼 있습니다 — 브라우저 설정에서 허용해주세요');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast('알림 권한이 필요합니다');
  try {
    const { publicKey } = await api.get('/api/sms/push/vapid-public-key');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _b64ToUint8(publicKey),
    });
    const j = sub.toJSON();
    await api.post('/api/sms/push/subscribe', {
      endpoint: j.endpoint, keys: j.keys,
      deviceLabel: (navigator.platform || navigator.userAgent || '').slice(0, 60),
    });
    updatePushPill('on');
    toast('알림을 켰습니다');
  } catch (e) {
    toast('알림 등록 실패: ' + e.message);
  }
}
/* 화면을 다시 보게 되면(포그라운드 복귀) 알림·배지 정리 */
async function clearBadgeAndNotifications() {
  if ('clearAppBadge' in navigator) { try { await navigator.clearAppBadge(); } catch (_) {} }
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      (await reg.getNotifications()).forEach((n) => n.close());
    } catch (_) {}
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') clearBadgeAndNotifications(); });
window.addEventListener('focus', clearBadgeAndNotifications);
window.addEventListener('load', clearBadgeAndNotifications);

/* ══ 공용: 이모티콘 · 특수문자 (발송센터·자동응답 공용) ══ */
const EMOJIS = ('😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 '+
'😋 😛 😜 🤪 😝 🤗 🤭 🤔 🤐 😐 😑 😶 😏 😒 🙄 😬 😔 😪 😴 😷 '+
'🤒 🤕 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 '+
'😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 '+
'👍 👎 👌 ✌️ 🤞 🤝 👏 🙏 💪 🤙 👋 ✋ 🖐️ 👇 👆 👉 👈 ☝️ ✍️ 💅 '+
'❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💗 💓 💞 💯 💢 💥 ✨ ⭐ 🌟 '+
'🎉 🎊 🎁 🎂 🍰 ☕ 🍵 🍺 🍻 🥂 🌸 🌺 🌷 🌹 🌻 🌱 🌿 🍀 🌈 ☀️ '+
'☁️ 🌧️ ❄️ ⛄ 🔥 💧 ⚡ 🎯 🏆 🥇 📱 💻 ⌚ 📷 🎵 🎶 📢 🔔 ⏰ 📅 '+
'✅ ❌ ⭕ ❗ ❓ ⚠️ 🚫 💤 🙌 🤲 🧘 🤸 🏃 🚶 💃 🕺 🧖 💆 💇 🛀').split(' ');

const SYMBOLS = ('· … ~ ∼ ㆍ 「 」 『 』 【 】 〈 〉 《 》 （ ） ［ ］ ｛ ｝ 〔 〕 “ ” ‘ ’ '+
'→ ← ↑ ↓ ↔ ↕ ⇒ ⇐ ⇔ ⇧ ⇩ ↗ ↘ ↙ ↖ '+
'★ ☆ ♥ ♡ ◆ ◇ ■ □ ● ○ ▲ △ ▼ ▽ ◈ ※ ◎ ☞ ☜ ♣ ♠ ♤ ♧ ☎ ✆ ✔ ✓ ✗ ✘ ◐ '+
'± × ÷ ≠ ≤ ≥ ≒ ∞ √ ∑ ∏ ∫ ∵ ∴ ∝ ° ℃ ℉ ㎜ ㎝ ㎞ ㎡ ㎥ ㎏ ㎖ ％ ‰ № ㏊ Å '+
'₩ ＄ ￥ ￡ € ¢ ฿ ₫ ₽ ₴ '+
'① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ㉠ ㉡ ㉢ ㉣ ㉤ ㈜ ™ © ® ℠ '+
'Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ Ⅵ Ⅶ Ⅷ Ⅸ Ⅹ').split(' ').filter(Boolean);

function buildCharGrid(gridElId, kind, targetId){
  const el = document.getElementById(gridElId);
  if(!el || el.dataset.built) return;
  el.dataset.built = '1';
  const list = kind === 'emoji' ? EMOJIS : SYMBOLS;
  const cls  = kind === 'emoji' ? 'big' : '';
  el.innerHTML = list.map(c =>
    `<button type="button" class="charBtn ${cls}" onclick="insertCharTo('${targetId}','${c.replace(/'/g,"\\'")}')">${c}</button>`
  ).join('');
}

/* 지정한 textarea의 커서 위치에 삽입(선택 영역이 있으면 대체) */
function insertCharTo(targetId, ch){
  const ta = document.getElementById(targetId);
  if(!ta) return;
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd   ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + ch + ta.value.slice(e);
  const pos = s + ch.length;
  ta.setSelectionRange(pos, pos);
  ta.focus();
  ta.dispatchEvent(new Event('input', {bubbles:true}));
}

