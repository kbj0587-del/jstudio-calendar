/* ===========================================================
   운동패스에서 불러오기 — 버튼과 확인 창
   -----------------------------------------------------------
   수업 내용의 주인은 운동패스다. 이 파일은 관리자에게 버튼 하나를 띄우고,
   "무엇이 바뀌는지" 를 먼저 보여 준 뒤 확인을 받아 반영한다.

   계산과 저장은 모두 서버에서 한다(`/api.php?action=undongpass_*`).
   이식해 온 앱은 빌드된 번들이라 바깥에서 화면 상태를 바꿀 수 없기 때문에,
   서버에서 저장한 뒤 화면을 새로 읽어 들이는 방식으로 반영한다.

   앱 번들은 건드리지 않는다. 버튼은 관리자로 로그인했을 때만 보인다.
   =========================================================== */
(function () {
  var API = '/api.php';
  var BTN_ID = 'undongpass-import-btn';
  var LOCK_ID = 'undongpass-lock-btn';

  function token() { try { return localStorage.getItem('jstudio_token') || ''; } catch (e) { return ''; } }

  function post(action, body) {
    return fetch(API + '?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token() }, body || {})),
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function el(tag, style, text) {
    var e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (text != null) e.textContent = text;
    return e;
  }

  /* ── 확인 창 ─────────────────────────────────────────── */
  var OVERLAY = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:99999;display:flex;'
              + 'align-items:center;justify-content:center;padding:16px';
  var CARD = 'background:#fff;border-radius:16px;width:100%;max-width:540px;max-height:90vh;'
           + 'overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.35);font-family:inherit';
  var BTN = 'padding:10px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;border:none';

  function closeModal() {
    var m = document.getElementById('undongpass-modal');
    if (m) m.remove();
  }

  var STATUS = {
    active:   { label: '활성', bg: '#ecfdf5', fg: '#047857' },
    draft:    { label: '임시', bg: '#eff6ff', fg: '#1d4ed8' },
    archived: { label: '보관', bg: '#f8fafc', fg: '#64748b' },
  };

  function badge(status) {
    var st = STATUS[status] || { label: status || '', bg: '#f8fafc', fg: '#64748b' };
    if (!st.label) return document.createTextNode('');
    return el('span', 'font-size:11px;font-weight:900;padding:2px 8px;border-radius:999px;'
      + 'background:' + st.bg + ';color:' + st.fg, st.label);
  }

  function monthCard(m, last) {
    var box = el('div', 'padding:11px 13px' + (last ? '' : ';border-bottom:1px solid #f1f5f9')
      + (m.isNew ? ';background:#eff6ff' : ''));

    var head = el('div', 'display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap');
    head.appendChild(el('span', 'font-size:13px;font-weight:900;color:#1e293b', m.label || m.key));
    head.appendChild(badge(m.status));
    if (m.isNew) head.appendChild(el('span', 'font-size:11px;font-weight:800;color:#1d4ed8', '새로 만듭니다'));
    box.appendChild(head);

    var n = m.stats.changed + m.stats.added + m.stats.removed;
    box.appendChild(el('p', 'margin:0;font-size:12px;font-weight:700;color:#64748b',
      m.isNew ? ('수업 ' + m.stats.added + '칸 · 지금 표 모양을 그대로 씁니다')
              : (n ? ('그대로 ' + m.stats.same + ' · 바뀜 ' + m.stats.changed
                      + (m.stats.added ? ' · 추가 ' + m.stats.added : '')
                      + (m.stats.removed ? ' · 빠짐 ' + m.stats.removed : ''))
                   : ('그대로 ' + m.stats.same + ' · 바꿀 내용 없음'))));

    (m.changes || []).slice(0, 6).forEach(function (c) {
      var line = el('p', 'margin:5px 0 0;font-size:12px;font-weight:700;color:#1e293b;line-height:1.5');
      line.appendChild(el('span', 'color:#94a3b8;font-weight:800', c.day + ' ' + c.time + '  '));
      line.appendChild(el('span', 'color:#94a3b8;text-decoration:line-through', c.before));
      line.appendChild(el('span', 'color:#94a3b8', '  →  '));
      line.appendChild(el('span', null, c.after));
      box.appendChild(line);
    });
    if ((m.changes || []).length > 6) {
      box.appendChild(el('p', 'margin:5px 0 0;font-size:11px;font-weight:700;color:#94a3b8',
        '외 ' + (m.changes.length - 6) + '칸'));
    }

    if ((m.timeShifts || []).length) {
      box.appendChild(el('p', 'margin:6px 0 0;font-size:11.5px;font-weight:800;color:#b45309;line-height:1.6',
        '시간이 바뀝니다 — ' + m.timeShifts.map(function (t) {
          return t.day + ' ' + t.before + '→' + t.after;
        }).join(', ')));
      box.appendChild(el('p', 'margin:2px 0 0;font-size:11px;font-weight:600;color:#a16207;line-height:1.6',
        '줄 옆 안내 문구(예: "토 10:30")는 직접 고쳐 주세요. 잠겨 있지 않습니다.'));
    }

    (m.newSlots || []).forEach(function (sl) {
      box.appendChild(el('p', 'margin:5px 0 0;font-size:11.5px;font-weight:700;color:#1d4ed8',
        '표에 없는 시간대 — ' + sl.day + ' ' + sl.time + ' ' + sl.title + ' (반영 안 됨)'));
    });
    (m.conflicts || []).forEach(function (c) {
      box.appendChild(el('p', 'margin:5px 0 0;font-size:11.5px;font-weight:800;color:#b91c1c',
        '한 칸에 두 수업 — ' + c.day + ' ' + c.time + ' ' + c.title + ' (반영 안 됨)'));
    });
    return box;
  }

  function showModal(p) {
    closeModal();
    var wrap = el('div', OVERLAY);
    wrap.id = 'undongpass-modal';
    wrap.className = 'print:hidden';
    var card = el('div', CARD);

    var head = el('div', 'padding:16px 18px;border-bottom:1px solid #e2e8f0');
    head.appendChild(el('p', 'margin:0;font-size:15px;font-weight:900;color:#1e293b', '운동패스에서 불러오기'));
    head.appendChild(el('p', 'margin:3px 0 0;font-size:12px;font-weight:700;color:#64748b',
      '미사 제이스튜디오 · 시간표 ' + p.months.length + '개'));
    card.appendChild(head);

    var listWrap = el('div', 'padding:12px 18px 4px');
    var list = el('div', 'border:1px solid #e2e8f0;border-radius:10px;overflow:hidden');
    p.months.forEach(function (m, i) { list.appendChild(monthCard(m, i === p.months.length - 1)); });
    listWrap.appendChild(list);
    card.appendChild(listWrap);

    if ((p.centerChanges || []).length) {
      var cc = el('div', 'margin:12px 18px 0;padding:10px 12px;background:#f8fafc;border-radius:10px');
      cc.appendChild(el('p', 'margin:0;font-size:12px;font-weight:800;color:#475569', '센터 정보'));
      p.centerChanges.forEach(function (c) {
        cc.appendChild(el('p', 'margin:4px 0 0;font-size:12px;font-weight:700;color:#1e293b',
          c.field + ' : ' + c.before + ' → ' + c.after));
      });
      card.appendChild(cc);
    }

    if ((p.orphans || []).length) {
      var orp = el('div', 'margin:12px 18px 0;padding:10px 12px;background:#fffbeb;border-radius:10px');
      orp.appendChild(el('p', 'margin:0;font-size:12px;font-weight:800;color:#92400e', '운동패스에 없는 달'));
      orp.appendChild(el('p', 'margin:4px 0 0;font-size:12px;font-weight:700;color:#78350f;line-height:1.6',
        p.orphans.map(function (o) { return o.label; }).join(' · ') + ' — 그대로 둡니다. 지우지 않습니다.'));
      card.appendChild(orp);
    }

    var keep = el('div', 'margin:12px 18px;padding:10px 12px;background:#f0fdfa;border-radius:10px');
    keep.appendChild(el('p', 'margin:0;font-size:12px;font-weight:800;color:#0f766e', '건드리지 않는 것'));
    keep.appendChild(el('p', 'margin:4px 0 0;font-size:12px;font-weight:600;color:#115e59;line-height:1.6',
      '디자인 · 글꼴 · 색 · 배너 · Notice 띠 · 안내문 · 프로그램 소개 설명표'));
    card.appendChild(keep);

    var logoBox = null;
    if (p.logoDifferent) {
      logoBox = el('label', 'display:flex;align-items:center;gap:8px;margin:0 18px 12px;padding:10px 12px;'
        + 'background:#f8fafc;border-radius:10px;cursor:pointer');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'undongpass-logo';
      cb.style.cssText = 'width:16px;height:16px;cursor:pointer';
      logoBox.appendChild(cb);
      logoBox.appendChild(el('span', 'font-size:12px;font-weight:700;color:#475569',
        '로고도 운동패스 것으로 바꾸기 (지금 시간표 로고와 다릅니다)'));
      card.appendChild(logoBox);
    }

    card.appendChild(el('p', 'margin:0 18px 10px;font-size:11px;font-weight:600;color:#94a3b8;line-height:1.6',
      '반영하면 곧바로 저장되고 ' + (p.activeLabel || '') + ' 시간표를 펼친 채 화면을 다시 불러옵니다.'));

    var foot = el('div', 'display:flex;gap:8px;padding:0 18px 18px');
    var cancel = el('button', BTN + ';flex:1;background:#fff;border:1px solid #e2e8f0;color:#64748b', '취소');
    cancel.onclick = closeModal;
    var hasWork = p.totalChanges > 0 || p.newMonths > 0;
    var ok = el('button', BTN + ';flex:2;background:#3b82f6;color:#fff',
      hasWork ? (p.months.length + '개 달 반영하기') : '확인');
    ok.onclick = function () {
      if (!hasWork) return closeModal();
      ok.disabled = true;
      ok.textContent = '반영하는 중…';
      post('undongpass_apply', { applyLogo: !!(logoBox && document.getElementById('undongpass-logo').checked) })
        .then(function (r) {
          if (!r || !r.success) throw new Error((r && r.error) || '반영에 실패했습니다.');
          ok.textContent = '반영 완료 — 다시 불러옵니다';
          setTimeout(function () { location.reload(); }, 600);
        })
        .catch(function (e) {
          ok.disabled = false;
          ok.textContent = '다시 시도';
          alert(e.message);
        });
    };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    card.appendChild(foot);

    wrap.appendChild(card);
    wrap.addEventListener('click', function (ev) { if (ev.target === wrap) closeModal(); });
    document.body.appendChild(wrap);
  }

  /* ── 수업 칸 잠금 ───────────────────────────────────────
     수업 내용의 주인은 운동패스다. 웹 시간표에서 고쳐도 운동패스로 올라가지
     않고 다음 불러오기 때 덮어써지므로, 실수로 고치는 일이 없도록 기본으로
     잠근다. 기능을 들어내지 않고 "읽기 전용" 으로만 바꾸므로 언제든 되돌아간다.

     잠그는 것   수업명·레벨·강사·칸 시간 입력칸, 브레이크 전환 버튼, 끌어 옮기기
     안 잠그는 것 안내문 문구, 줄 추가·삭제, 메인/보조 시간, 디자인, 설명표
       (운동패스에 없는 값이라 웹 시간표에서 고치는 게 맞다)
  ───────────────────────────────────────────────────── */
  var CELL_PLACEHOLDERS = ['수업명', '레벨', '강사', '시간'];
  var LOCK_MSG = '수업 내용은 운동패스에서 관리합니다.';
  var locked = true;   /* 새로고침하면 다시 잠기도록 메모리에만 둔다 */

  function canvas() { return document.getElementById('timetable-canvas'); }

  function cellInputs() {
    /* 위 네 가지 안내 글자는 수업 칸에만 쓰이므로, 표를 못 찾으면 문서 전체에서 찾는다 */
    var root = canvas() || document;
    return Array.prototype.filter.call(root.querySelectorAll('input[type="text"]'), function (i) {
      return CELL_PLACEHOLDERS.indexOf(i.getAttribute('placeholder') || '') >= 0
          || i.dataset.upPlaceholder;   /* 잠그며 치워 둔 것도 다시 찾는다 */
    });
  }

  function toast(msg) {
    var old = document.getElementById('up-toast');
    if (old) old.remove();
    var t = el('div', 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;'
      + 'background:#1e293b;color:#fff;font-size:13px;font-weight:800;padding:10px 16px;'
      + 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25)', msg);
    t.id = 'up-toast';
    t.className = 'print:hidden';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 2200);
  }

  function onLockedClick(ev) { ev.preventDefault(); toast(LOCK_MSG); }

  function applyLock() {
    var root = canvas() || document;

    cellInputs().forEach(function (i) {
      if (locked) {
        if (!i.dataset.upLocked) {
          i.dataset.upLocked = '1';
          i.dataset.upStyle = i.getAttribute('style') || '';
          /* 빈 칸에 안내 글자가 떠 보이지 않게 치워 두고, 풀 때 되돌린다 */
          i.dataset.upPlaceholder = i.getAttribute('placeholder') || '';
          i.setAttribute('placeholder', '');
          i.addEventListener('mousedown', onLockedClick);
        }
        i.readOnly = true;
        i.title = LOCK_MSG;
        i.style.backgroundColor = 'transparent';
        i.style.borderColor = 'transparent';
        i.style.cursor = 'default';
      } else if (i.dataset.upLocked) {
        i.readOnly = false;
        i.removeAttribute('title');
        i.setAttribute('style', i.dataset.upStyle);
        i.setAttribute('placeholder', i.dataset.upPlaceholder);
        i.removeEventListener('mousedown', onLockedClick);
        delete i.dataset.upLocked;
        delete i.dataset.upStyle;
        delete i.dataset.upPlaceholder;
      }
    });

    /* 브레이크 전환 버튼 */
    Array.prototype.forEach.call(root.querySelectorAll('button'), function (b) {
      if ((b.textContent || '').indexOf('⏸') !== 0) return;
      b.disabled = locked;
      b.style.opacity = locked ? '0.35' : '';
      b.style.cursor = locked ? 'not-allowed' : '';
      if (locked) b.title = LOCK_MSG; else b.removeAttribute('title');
    });

    /* 칸을 끌어서 옮기기 */
    Array.prototype.forEach.call(root.querySelectorAll('[draggable]'), function (d) {
      if (locked) {
        if (d.getAttribute('draggable') === 'true') d.dataset.upDrag = '1';
        if (d.dataset.upDrag) d.setAttribute('draggable', 'false');
      } else if (d.dataset.upDrag) {
        d.setAttribute('draggable', 'true');
      }
    });
  }

  function paintLockBtn(b) {
    b.textContent = locked ? '🔒 수업 칸 잠김' : '🔓 수업 칸 편집 중';
    b.style.cssText = locked
      ? 'border-color:#e2e8f0;background:#fff;color:#64748b'
      : 'border-color:#fcd34d;background:#fffbeb;color:#92400e';
    b.title = locked
      ? '수업 내용은 운동패스에서 관리합니다. 눌러서 잠시 편집할 수 있습니다.'
      : '새로고침하면 다시 잠깁니다. 여기서 고친 수업은 다음 불러오기 때 덮어써집니다.';
  }

  function makeLockButton() {
    var b = document.createElement('button');
    b.id = LOCK_ID;
    b.className = 'flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-sm border transition-all print:hidden';
    b.onclick = function () {
      locked = !locked;
      paintLockBtn(b);
      applyLock();
      if (!locked) toast('수업 칸을 열었습니다. 새로고침하면 다시 잠깁니다.');
    };
    paintLockBtn(b);
    return b;
  }

  /* ── 불러오기 버튼 ─────────────────────────────────── */
  function onClick(btn) {
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '불러오는 중…';
    post('undongpass_preview', {})
      .then(function (r) {
        if (!r || !r.success) throw new Error((r && r.error) || '불러오지 못했습니다.');
        showModal(r.preview);
      })
      .catch(function (e) { alert(e.message); })
      .finally(function () { btn.disabled = false; btn.textContent = label; });
  }

  function makeButton() {
    var b = document.createElement('button');
    b.id = BTN_ID;
    b.className = 'flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-sm border transition-all print:hidden';
    b.style.cssText = 'border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8';
    b.textContent = '⬇ 운동패스에서 불러오기';
    b.onclick = function () { onClick(b); };
    return b;
  }

  /* ── 달 상태 배지 ──────────────────────────────────────
     지금 펼쳐 둔 달이 운동패스에서 활성인지 임시인지 보관인지 알려 준다.
     상태는 저장해 두지 않고 운동패스에서 그때그때 읽는다(앱이 상태를 저장할 때
     우리가 끼워 넣은 값은 사라지므로, 들고 있어 봐야 어긋난다).
     화면에서만 보이고 인쇄물에는 나오지 않는다.
  ───────────────────────────────────────────────────── */
  var monthStatus = null;   /* { '10월': 'active', … } */

  function loadStatuses() {
    var base = 'https://young-gym.vercel.app/api/timetable-view/data?studioId=ST001&scope=all';
    return fetch(base).then(function (r) { return r.json(); }).then(function (d) {
      var out = {};
      Object.keys((d && d.months) || {}).forEach(function (k) {
        var label = ((d.monthsData || {})[k] || {}).monthLabel || '';
        if (label) out[label] = d.months[k].status;
      });
      monthStatus = out;
    }).catch(function () { monthStatus = {}; });
  }

  function paintBadge() {
    if (!monthStatus) return;
    var box = document.querySelector('[class*="min-w-[120px]"]');
    if (!box) return;
    var label = (box.innerText || '').match(/(\d{1,2}월)/);
    var old = document.getElementById('undongpass-month-badge');
    if (!label) { if (old) old.remove(); return; }
    var st = STATUS[monthStatus[label[1]]];
    if (!st) { if (old) old.remove(); return; }
    if (old && old.dataset.for === label[1]) return;
    if (old) old.remove();
    var b = badge(monthStatus[label[1]]);
    b.id = 'undongpass-month-badge';
    b.dataset.for = label[1];
    b.className = 'print:hidden';
    box.appendChild(b);
  }

  /* 탭 줄(시간표 / 프로그램 소개)의 오른쪽 묶음에 끼워 넣는다 */
  function place() {
    if (!document.getElementById(BTN_ID)) {
      var tab = Array.prototype.filter.call(document.querySelectorAll('button'), function (x) {
        return (x.textContent || '').indexOf('프로그램 소개') >= 0;
      })[0];
      var row = tab && tab.parentElement && tab.parentElement.parentElement;
      var right = row && row.lastElementChild;
      if (right && right !== tab.parentElement) {
        right.insertBefore(makeButton(), right.firstChild);
        right.insertBefore(makeLockButton(), right.firstChild);
      }
    }
    /* 앱이 화면을 다시 그리면 입력칸·배지가 새로 생기므로 다시 입힌다 */
    applyLock();
    paintBadge();
  }

  function isAdmin() {
    if (!token()) return Promise.resolve(false);
    return post('verify_token', {}).then(function (r) { return !!(r && r.valid); }).catch(function () { return false; });
  }

  /*
   * 로그인 여부를 한 번만 보면 안 된다.
   * 화면을 열어 둔 채로 관리자 로그인을 하는 경우가 보통이라, 그때 버튼이
   * 나타나야 한다(새로고침을 요구하면 안 된다). 로그아웃하면 다시 치운다.
   * 토큰이 바뀐 순간에만 서버에 확인하므로 평소에는 호출이 없다.
   */
  var lastToken = null;
  var armed = false;
  var watcher = null;

  function arm() {
    if (armed) return;
    armed = true;
    loadStatuses().then(paintBadge);
    place();
    /* 앱이 화면을 다시 그리면 버튼이 사라지므로 계속 지켜본다 */
    var pending = false;
    watcher = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; place(); });
    });
    watcher.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  }

  function disarm() {
    if (!armed) return;
    armed = false;
    if (watcher) { watcher.disconnect(); watcher = null; }
    [BTN_ID, LOCK_ID, 'undongpass-month-badge'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.remove();
    });
    locked = true;   /* 다음 로그인 때는 다시 잠긴 상태로 시작 */
    closeModal();
  }

  function sync() {
    var t = token();
    if (t === lastToken) return;
    lastToken = t;
    if (!t) return disarm();
    isAdmin().then(function (ok) {
      if (t !== lastToken) return;      /* 확인하는 사이에 또 바뀌었으면 버린다 */
      if (ok) arm(); else disarm();
    });
  }

  function start() {
    sync();
    setInterval(sync, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 800); });
  } else {
    setTimeout(start, 800);
  }
})();
