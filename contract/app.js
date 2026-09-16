/* ============================================================
   회원가입(PT) 계약서 — 작성 + A4 출력
   · 서버에 저장하지 않는다. 작성 중 내용은 이 브라우저에만 임시 보관.
   · 서명은 화면 서명 / 종이 자필 중 선택.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DRAFT_KEY = 'jstudio_contract_draft';

  /* ── 비밀번호 게이트 (캘린더 관리자 비밀번호 1개 공용) ───────── */
  var gate = $('#gate'), app = $('#app');
  function openApp() {
    gate.style.display = 'none';
    app.style.display = 'block';
    init();
  }
  if (sessionStorage.getItem('jstudio_contract_ok') === '1') {
    openApp();
  } else {
    $('#gbtn').addEventListener('click', submitPw);
    $('#gpw').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPw(); });
    setTimeout(function () { $('#gpw').focus(); }, 100);
  }
  function submitPw() {
    var pw = $('#gpw').value.trim();
    var err = $('#gerr');
    if (!pw) { err.textContent = '비밀번호를 입력하세요'; return; }
    err.textContent = '확인 중…';
    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) { sessionStorage.setItem('jstudio_contract_ok', '1'); openApp(); }
        else { err.textContent = '비밀번호가 맞지 않습니다'; }
      })
      .catch(function () { err.textContent = '서버에 연결할 수 없습니다'; });
  }

  /* ── 본체 ──────────────────────────────────────────────── */
  function init() {
    var sheet = $('#sheet');
    var fields = $$('[data-f]');
    var groups = ['join', 'item', 'reg', 'pay'];

    /* 값 포맷 도우미 */
    function digits(v) { return String(v || '').replace(/[^0-9]/g, ''); }
    function comma(v) {
      var d = digits(v);
      return d ? Number(d).toLocaleString('ko-KR') : '';
    }
    function won(v) { var c = comma(v); return c ? '₩ ' + c : '₩'; }
    function ymd(v) {
      if (!v) return null;
      var p = v.split('-');
      return { y: p[0], m: String(Number(p[1])), d: String(Number(p[2])) };
    }
    function korDate(v, blank) {
      var t = ymd(v);
      if (!t) return blank;
      return t.y + '년 ' + t.m + '월 ' + t.d + '일';
    }
    function hyphenTel(v) {
      var d = digits(v).slice(0, 11);
      if (d.length < 4) return d;
      if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
      if (d.length < 11) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
      return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    }

    /* 체크박스 묶음을 계약서 표기(□신규 ☑재등록 …)로 */
    function optLine(name, opts, etcVal) {
      var picked = (document.querySelector('input[name="' + name + '"]:checked') || {}).value || '';
      return opts.map(function (o) {
        var on = o === picked;
        var label = o;
        if (o === '기타') label = '기타(' + (on && etcVal ? ' ' + etcVal + ' ' : '     ') + ')';
        return '<span class="opt' + (on ? ' on' : '') + '"><b>' + (on ? '☑' : '□') + '</b>' + label + '</span>';
      }).join('');
    }

    function val(k) { var el = $('[data-f="' + k + '"]'); return el ? el.value.trim() : ''; }
    function put(k, html) {
      var el = sheet.querySelector('[data-v="' + k + '"]');
      if (el) el.innerHTML = html;
    }

    function render() {
      put('code', val('code'));
      put('name', val('name'));
      put('birth', korDate(val('birth'), '년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일'));
      put('tel', val('tel'));
      put('addr', val('addr') || '<span class="ph">"동"까지만 기록해 주세요.</span>');

      put('joinOpts', optLine('join', ['신규', '재등록', '휴면', '양도']));
      put('itemOpts', optLine('item', ['매트요가', '플라잉요가', '번지피지오', '기타'], val('itemEtc')));
      put('regOpts', optLine('reg', ['1:1', '2:1', '4:1', '기타'], val('regEtc')));
      put('payOpts', optLine('pay', ['카드', '현금', 'Npay', 'ZPay']));

      var cnt = digits(val('cnt'));
      put('cnt', (cnt ? cnt + ' ' : '') + '회');

      var f = val('from'), t = val('to');
      var blankFrom = '20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일';
      put('period', (korDate(f, blankFrom)) + '&nbsp;&nbsp;~&nbsp;&nbsp;' + (korDate(t, blankFrom)));

      put('bonus', esc(val('bonus')));

      put('unit', won(val('unit')));
      var paid = comma(val('paid')), due = comma(val('due'));
      put('paidDue', (paid || '') + ' / ' + (due || ''));

      var totalManual = digits(val('total'));
      var auto = (digits(val('unit')) && cnt) ? Number(digits(val('unit'))) * Number(cnt) : 0;
      var total = totalManual ? Number(totalManual) : auto;
      put('total', total ? '₩ ' + total.toLocaleString('ko-KR') : '₩');
      $('#calc').textContent = auto
        ? (totalManual
          ? '자동계산 ' + auto.toLocaleString('ko-KR') + '원 → 직접 입력한 ' + Number(totalManual).toLocaleString('ko-KR') + '원으로 출력됩니다.'
          : '자동계산: ' + comma(val('unit')) + '원 × ' + cnt + '회 = ' + auto.toLocaleString('ko-KR') + '원')
        : '1회 금액과 횟수를 입력하면 자동으로 계산됩니다.';

      put('stdItem', esc(val('stdItem')));
      put('stdPrice', comma(val('stdPrice')) || esc(val('stdPrice')));

      put('signDate', korDate(val('signDate'), '20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일'));

      /* 회원권 사용기준일 안내 */
      var hint = '';
      if (cnt) hint = '회원권 사용기준일 = ' + cnt + '주 (1회당 1주)';
      if (f && cnt) {
        var d0 = new Date(f + 'T00:00:00');
        d0.setDate(d0.getDate() + Number(cnt) * 7);
        hint += ' · 시작일 기준 만료 예상 ' + d0.getFullYear() + '.' + (d0.getMonth() + 1) + '.' + d0.getDate();
      }
      $('#wkHint').textContent = hint;

      renderSigns();
      saveDraft();
    }

    function esc(s) {
      return String(s || '').replace(/[&<>]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
      });
    }

    /* ── 서명 캔버스 (손가락 · 펜 · 마우스) ───────────────── */
    var pads = {};
    function makePad(id) {
      var cv = document.getElementById(id);
      var ratio = window.devicePixelRatio || 1;
      var ctx = cv.getContext('2d');
      var drawn = false, drawing = false;

      function resize() {
        var keep = drawn ? cv.toDataURL() : null;
        var r = cv.getBoundingClientRect();
        cv.width = Math.max(1, Math.round(r.width * ratio));
        cv.height = Math.max(1, Math.round(r.height * ratio));
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111';
        if (keep) {
          var img = new Image();
          img.onload = function () { ctx.drawImage(img, 0, 0, r.width, r.height); };
          img.src = keep;
        }
      }
      resize();
      window.addEventListener('resize', resize);

      function pos(e) {
        var r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
      cv.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        drawing = true; drawn = true;
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 일부 환경에서 미지원 */ }
        var p = pos(e);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y); ctx.stroke();
      });
      cv.addEventListener('pointermove', function (e) {
        if (!drawing) return;
        e.preventDefault();
        var p = pos(e);
        ctx.lineTo(p.x, p.y); ctx.stroke();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        cv.addEventListener(ev, function () {
          if (!drawing) return;
          drawing = false;
          renderSigns(); saveDraft();
        });
      });

      return {
        isEmpty: function () { return !drawn; },
        data: function () { return drawn ? cv.toDataURL('image/png') : ''; },
        clear: function () {
          ctx.clearRect(0, 0, cv.width, cv.height);
          drawn = false; renderSigns(); saveDraft();
        },
        load: function (url) {
          if (!url) return;
          var img = new Image();
          img.onload = function () {
            var r = cv.getBoundingClientRect();
            ctx.drawImage(img, 0, 0, r.width, r.height);
            drawn = true; renderSigns();
          };
          img.src = url;
        }
      };
    }
    pads.sigA = makePad('sigA');
    pads.sigB = makePad('sigB');
    $$('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () { pads[b.dataset.clear].clear(); });
    });

    function sigMode() {
      var el = document.querySelector('input[name="sigmode"]:checked');
      return el ? el.value : 'screen';
    }
    function renderSigns() {
      var paper = sigMode() === 'paper';
      var staff = val('staff');
      fillSlot('#slotA', paper ? '' : pads.sigA.data());
      fillSlot('#slotB', paper ? '' : pads.sigB.data(), staff);
    }
    function fillSlot(sel, url, nameBelow) {
      var el = $(sel);
      if (url) el.innerHTML = '<img src="' + url + '" alt="" />';
      else el.innerHTML = '<span>서명</span>';
      if (nameBelow && !url) el.innerHTML = '<span>' + esc(nameBelow) + ' 서명</span>';
    }

    $$('input[name="sigmode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var paper = sigMode() === 'paper';
        $('#sigArea').querySelectorAll('.sigbox').forEach(function (b) {
          b.style.display = paper ? 'none' : '';
        });
        $('#sigHint').textContent = paper
          ? '서명란을 빈 줄로 출력합니다. 출력 후 종이에 직접 서명받으세요.'
          : '화면에서 손가락이나 펜으로 서명을 받습니다. 서명한 그대로 인쇄됩니다.';
        renderSigns(); saveDraft();
      });
    });
    $('#sigHint').textContent = '화면에서 손가락이나 펜으로 서명을 받습니다. 서명한 그대로 인쇄됩니다.';

    /* ── 입력 바인딩 ─────────────────────────────────────── */
    fields.forEach(function (el) {
      el.addEventListener('input', function () {
        var k = el.dataset.f;
        if (k === 'tel') el.value = hyphenTel(el.value);
        if (['unit', 'paid', 'due', 'total', 'stdPrice'].indexOf(k) > -1) el.value = comma(el.value);
        render();
      });
      el.addEventListener('change', render);
    });
    groups.concat(['sigmode']).forEach(function (g) {
      $$('input[name="' + g + '"]').forEach(function (r) { r.addEventListener('change', render); });
    });

    /* ── 미리보기 배율 (화면에서만, 인쇄는 원본 크기) ────── */
    var holder = $('#holder');
    function fit() {
      var stage = $('.stage');
      var w = stage.clientWidth - 8;
      var s = Math.min(1, w / sheet.offsetWidth);
      holder.style.transform = 'scale(' + s + ')';
      holder.style.height = (sheet.offsetHeight * s) + 'px';
    }
    window.addEventListener('resize', fit);

    /* ── 임시 저장 (이 브라우저에만) ─────────────────────── */
    function saveDraft() {
      try {
        var d = { f: {}, g: {}, sig: {} };
        fields.forEach(function (el) { d.f[el.dataset.f] = el.value; });
        groups.concat(['sigmode']).forEach(function (g) {
          var c = document.querySelector('input[name="' + g + '"]:checked');
          d.g[g] = c ? c.value : '';
        });
        d.sig.a = pads.sigA.data();
        d.sig.b = pads.sigB.data();
        localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      } catch (e) { /* 용량 초과 등은 무시 — 출력에는 영향 없음 */ }
    }
    function loadDraft() {
      var raw;
      try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return; }
      if (!raw) return;
      var d;
      try { d = JSON.parse(raw); } catch (e) { return; }
      fields.forEach(function (el) { if (d.f && d.f[el.dataset.f] != null) el.value = d.f[el.dataset.f]; });
      Object.keys(d.g || {}).forEach(function (g) {
        if (!d.g[g]) return;
        var r = document.querySelector('input[name="' + g + '"][value="' + d.g[g] + '"]');
        if (r) r.checked = true;
      });
      if (d.sig) { pads.sigA.load(d.sig.a); pads.sigB.load(d.sig.b); }
    }

    $('#btnReset').addEventListener('click', function () {
      if (!confirm('작성 중인 내용을 모두 지우고 새 계약서를 시작할까요?')) return;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      location.reload();
    });

    /* ── 잉크 절약 · 인쇄 ────────────────────────────────── */
    var ink = localStorage.getItem('jstudio_contract_ink') === '1';
    function applyInk() {
      sheet.classList.toggle('ink', ink);
      $('#btnInk').textContent = '잉크 절약: ' + (ink ? '켬' : '끔');
    }
    $('#btnInk').addEventListener('click', function () {
      ink = !ink;
      try { localStorage.setItem('jstudio_contract_ink', ink ? '1' : '0'); } catch (e) {}
      applyInk();
    });
    applyInk();

    $('#btnPrint').addEventListener('click', function () {
      if (!val('name')) {
        if (!confirm('회원명이 비어 있습니다. 빈 양식으로 인쇄할까요?')) return;
      }
      window.print();
    });

    /* 기본값: 계약일 = 오늘 */
    if (!val('signDate')) {
      var n = new Date();
      $('[data-f="signDate"]').value = n.getFullYear() + '-' +
        String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    }

    loadDraft();
    render();
    fit();
  }
})();
