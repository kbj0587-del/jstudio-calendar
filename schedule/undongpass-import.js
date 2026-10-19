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

  function statCard(label, value, strong) {
    var d = el('div', 'background:' + (strong ? '#fef3c7' : '#f8fafc') + ';border-radius:10px;padding:10px 8px;text-align:center');
    d.appendChild(el('p', 'margin:0;font-size:11px;font-weight:800;color:' + (strong ? '#92400e' : '#64748b'), label));
    d.appendChild(el('p', 'margin:2px 0 0;font-size:20px;font-weight:900;color:' + (strong ? '#78350f' : '#1e293b'), String(value)));
    return d;
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
      '운동패스 ' + (p.undongpassMonth || '?') + ' → 웹 시간표 ' + (p.monthLabel || '?')));
    card.appendChild(head);

    if (p.monthMismatch) {
      var warn = el('div', 'margin:14px 18px 0;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px');
      warn.appendChild(el('p', 'margin:0;font-size:12px;font-weight:800;color:#b91c1c',
        '운동패스는 ' + p.undongpassMonth + ', 웹 시간표는 ' + p.monthLabel + ' 입니다.'));
      warn.appendChild(el('p', 'margin:4px 0 0;font-size:12px;font-weight:600;color:#991b1b;line-height:1.6',
        '운동패스에서 이번 달 시간표를 발행했는지 확인해 주세요. 그대로 반영하면 다른 달 내용이 들어갑니다.'));
      card.appendChild(warn);
    }

    var stats = el('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:14px 18px');
    stats.appendChild(statCard('그대로', p.stats.same, false));
    stats.appendChild(statCard('바뀜', p.stats.changed, p.stats.changed > 0));
    stats.appendChild(statCard('새 수업', p.stats.added, p.stats.added > 0));
    stats.appendChild(statCard('빠짐', p.stats.removed, p.stats.removed > 0));
    card.appendChild(stats);

    var all = (p.changes || []).concat((p.centerChanges || []).map(function (c) {
      return { kind: 'center', day: '', time: c.field, before: c.before, after: c.after };
    }));

    if (!all.length && !(p.newSlots || []).length) {
      card.appendChild(el('p', 'margin:0 18px 14px;padding:12px;background:#ecfdf5;border-radius:10px;'
        + 'font-size:13px;font-weight:700;color:#047857;text-align:center', '운동패스와 이미 같습니다. 바꿀 내용이 없습니다.'));
    } else {
      var listWrap = el('div', 'padding:0 18px');
      listWrap.appendChild(el('p', 'margin:0 0 8px;font-size:11px;font-weight:800;color:#64748b', '바뀌는 내용'));
      var list = el('div', 'border:1px solid #e2e8f0;border-radius:10px;overflow:hidden');
      all.forEach(function (c, i) {
        var tone = c.kind === 'removed' ? '#fef2f2' : (c.kind === 'added' ? '#eff6ff' : '#fff');
        var row = el('div', 'padding:9px 11px;background:' + tone
          + (i < all.length - 1 ? ';border-bottom:1px solid #f1f5f9' : ''));
        var label = c.kind === 'center' ? ('센터 · ' + c.time) : (c.day + ' ' + c.time);
        row.appendChild(el('p', 'margin:0;font-size:11px;font-weight:800;color:#94a3b8', label));
        var line = el('p', 'margin:2px 0 0;font-size:12.5px;font-weight:700;color:#1e293b;line-height:1.5');
        line.appendChild(el('span', 'color:#94a3b8;text-decoration:line-through', c.before));
        line.appendChild(el('span', 'color:#94a3b8', '  →  '));
        line.appendChild(el('span', null, c.after));
        row.appendChild(line);
        list.appendChild(row);
      });
      listWrap.appendChild(list);
      card.appendChild(listWrap);

      if ((p.newSlots || []).length) {
        var ns = el('div', 'margin:12px 18px 0;padding:10px 12px;background:#eff6ff;border-radius:10px');
        ns.appendChild(el('p', 'margin:0;font-size:12px;font-weight:800;color:#1d4ed8',
          '웹 시간표 표에 없는 시간대 ' + p.newSlots.length + '건 — 반영되지 않습니다'));
        p.newSlots.forEach(function (s) {
          ns.appendChild(el('p', 'margin:4px 0 0;font-size:12px;font-weight:600;color:#1e40af',
            '· ' + s.day + ' ' + s.time + ' ' + s.title + (s.level ? ' / ' + s.level : '')));
        });
        ns.appendChild(el('p', 'margin:6px 0 0;font-size:11px;font-weight:600;color:#3b82f6;line-height:1.6',
          '표에 줄을 먼저 만들어 두면 다음 불러오기 때 들어옵니다.'));
        card.appendChild(ns);
      }
    }

    var keep = el('div', 'margin:12px 18px;padding:10px 12px;background:#f0fdfa;border-radius:10px');
    keep.appendChild(el('p', 'margin:0;font-size:12px;font-weight:800;color:#0f766e', '건드리지 않는 것'));
    keep.appendChild(el('p', 'margin:4px 0 0;font-size:12px;font-weight:600;color:#115e59;line-height:1.6',
      '표의 줄 구조 · 디자인 · 글꼴 · 색 · 배너 · Notice 띠 · 안내문 · 프로그램 소개 설명표 · 지난 달 시간표'));
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
      '반영하면 곧바로 저장되고 화면을 다시 불러옵니다. 따로 저장 버튼을 누르지 않아도 됩니다.'));

    var foot = el('div', 'display:flex;gap:8px;padding:0 18px 18px');
    var cancel = el('button', BTN + ';flex:1;background:#fff;border:1px solid #e2e8f0;color:#64748b', '취소');
    cancel.onclick = closeModal;
    var ok = el('button', BTN + ';flex:2;background:#3b82f6;color:#fff',
      all.length ? (all.length + '건 반영하기') : '확인');
    ok.onclick = function () {
      if (!all.length) return closeModal();
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

  /* ── 버튼 ────────────────────────────────────────────── */
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

  /* 탭 줄(시간표 / 프로그램 소개)의 오른쪽 묶음에 끼워 넣는다 */
  function place() {
    if (document.getElementById(BTN_ID)) return;
    var tab = Array.prototype.filter.call(document.querySelectorAll('button'), function (x) {
      return (x.textContent || '').indexOf('프로그램 소개') >= 0;
    })[0];
    if (!tab) return;
    var row = tab.parentElement && tab.parentElement.parentElement;
    if (!row) return;
    var right = row.lastElementChild;
    if (!right || right === tab.parentElement) return;
    right.insertBefore(makeButton(), right.firstChild);
  }

  function isAdmin() {
    if (!token()) return Promise.resolve(false);
    return post('verify_token', {}).then(function (r) { return !!(r && r.valid); }).catch(function () { return false; });
  }

  function start() {
    isAdmin().then(function (ok) {
      if (!ok) return;
      place();
      /* 앱이 화면을 다시 그리면 버튼이 사라지므로 계속 지켜본다 */
      new MutationObserver(function () { place(); })
        .observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 800); });
  } else {
    setTimeout(start, 800);
  }
})();
