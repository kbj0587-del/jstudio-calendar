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
    var groups = ["join", "item", "reg", "pay"];
    var totalTouched = false;   /* 총 결제금액을 손으로 고쳤는가 */
    var toTouched = false;      /* 강습 종료일을 손으로 고쳤는가 */
    var agreed = false;         /* 약관 동의 여부(전자서명 전제) */

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

    /* 날짜: 20101014 · 101013 처럼 숫자만 입력해도 2010-10-14 로 자동 정리 */
    function normDate(raw) {
      var d = digits(raw);
      var y, m, dd;
      if (d.length === 8) { y = +d.slice(0, 4); m = +d.slice(4, 6); dd = +d.slice(6, 8); }
      else if (d.length === 6) {
        var yy = +d.slice(0, 2);
        y = yy <= 30 ? 2000 + yy : 1900 + yy;
        m = +d.slice(2, 4); dd = +d.slice(4, 6);
      } else return '';
      if (y < 1900 || y > 2200 || m < 1 || m > 12 || dd < 1 || dd > 31) return '';
      var t = new Date(y, m - 1, dd);
      if (t.getFullYear() !== y || t.getMonth() !== m - 1 || t.getDate() !== dd) return '';
      return y + '-' + String(m).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    }
    function dval(k) {
      var el = $('[data-f="' + k + '"]');
      if (!el) return '';
      return normDate(el.value);
    }
    function setDate(k, iso) {
      var el = $('[data-f="' + k + '"]');
      if (el) el.value = iso || '';
    }

    function val(k) { var el = $('[data-f="' + k + '"]'); return el ? el.value.trim() : ''; }
    function put(k, html) {
      var el = sheet.querySelector('[data-v="' + k + '"]');
      if (el) el.innerHTML = html;
    }

    function render() {
      put('code', val('code'));
      put('name', val('name'));
      put('birth', korDate(dval("birth"), '년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일'));
      put('tel', val('tel'));
      put('addr', val('addr') || '<span class="ph">"동"까지만 기록해 주세요.</span>');

      put('joinOpts', optLine('join', ['신규', '재등록', '휴면', '양도']));
      put('itemOpts', optLine('item', ['매트요가', '플라잉요가', '번지피지오', '기타'], val('itemEtc')));
      put('regOpts', optLine('reg', ['1:1', '2:1', '4:1', '기타'], val('regEtc')));
      put('payOpts', optLine('pay', ['카드', '현금', 'Npay', 'ZPay']));

      var cnt = digits(val('cnt'));
      put('cnt', (cnt ? cnt + ' ' : '') + '회');

      /* 강습 종료일 — 시작일 + (횟수 × 1주). 직접 고치면 자동 계산을 멈춘다. */
      var f = dval("from");
      if (!toTouched && f && cnt) {
        var e = new Date(f + 'T00:00:00');
        e.setDate(e.getDate() + Number(cnt) * 7);
        setDate('to', e.getFullYear() + '-' + String(e.getMonth() + 1).padStart(2, '0') +
          '-' + String(e.getDate()).padStart(2, '0'));
      }
      var t = dval("to");
      $('#toBadge').textContent = (f && cnt)
        ? (toTouched ? '· 직접 입력됨' : '· 자동계산됨 (' + cnt + '주)')
        : '';
      var blankFrom = '20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일';
      put('period', (korDate(f, blankFrom)) + '&nbsp;&nbsp;~&nbsp;&nbsp;' + (korDate(t, blankFrom)));

      put('bonus', esc(val('bonus')));

      put('unit', won(val('unit')));
      var paid = comma(val('paid')), due = comma(val('due'));
      put('paidDue', (paid || '') + ' / ' + (due || ''));

      /* 총 결제금액 — 1회금액 × 횟수를 칸에 바로 채워 넣는다.
         직접 고친 뒤에는(totalTouched) 자동 덮어쓰기를 하지 않는다. */
      var auto = (digits(val('unit')) && cnt) ? Number(digits(val('unit'))) * Number(cnt) : 0;
      if (!totalTouched && auto) $('[data-f="total"]').value = auto.toLocaleString('ko-KR');
      var shown = digits(val('total'));
      put('total', shown ? '₩ ' + Number(shown).toLocaleString('ko-KR') : '₩');
      $('#totalBadge').textContent = auto
        ? (totalTouched ? '· 직접 입력됨 (자동값 ' + auto.toLocaleString('ko-KR') + '원)' : '· 자동계산됨')
        : '';
      $('#calc').textContent = auto
        ? comma(val('unit')) + '원 × ' + cnt + '회 = ' + auto.toLocaleString('ko-KR') + '원'
          + (totalTouched ? ' (칸을 비우면 이 값으로 되돌아갑니다)' : '')
        : '1회 금액과 횟수를 입력하면 자동으로 계산됩니다.';

      put('stdItem', esc(val('stdItem')));
      put('stdPrice', comma(val('stdPrice')) || esc(val('stdPrice')));

      put('signDate', korDate(dval("signDate"), '20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일'));

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

    /* ── 서명 팝업 (손가락 · 펜 · 마우스) ──────────────────
       가입자(A) · 담당자(B) 서명을 각각 큰 팝업에서 받는다.
       패널에는 결과만 작게 보여 준다. */
    var sig = { A: '', B: '' };
    var sigTarget = 'A';
    var sgModal = $('#sigModal'), sgCanvas = $('#sgCanvas');
    var sgCtx = sgCanvas.getContext('2d');
    var sgDrawn = false, sgDrawing = false, sgRatio = window.devicePixelRatio || 1;

    function sgSetup() {
      var r = sgCanvas.getBoundingClientRect();
      sgCanvas.width = Math.max(1, Math.round(r.width * sgRatio));
      sgCanvas.height = Math.max(1, Math.round(r.height * sgRatio));
      sgCtx.setTransform(sgRatio, 0, 0, sgRatio, 0, 0);
      sgCtx.lineWidth = 2.8; sgCtx.lineCap = 'round'; sgCtx.lineJoin = 'round';
      sgCtx.strokeStyle = '#111';
      sgCtx.clearRect(0, 0, r.width, r.height);
      sgDrawn = false;
      $('#sgSave').disabled = true;
    }
    function sgPos(e) {
      var r = sgCanvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    sgCanvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      sgDrawing = true; sgDrawn = true;
      $('#sgSave').disabled = false;
      try { sgCanvas.setPointerCapture(e.pointerId); } catch (err) { /* 미지원 환경 */ }
      var p = sgPos(e);
      sgCtx.beginPath(); sgCtx.moveTo(p.x, p.y); sgCtx.lineTo(p.x + 0.1, p.y); sgCtx.stroke();
    });
    sgCanvas.addEventListener('pointermove', function (e) {
      if (!sgDrawing) return;
      e.preventDefault();
      var p = sgPos(e);
      sgCtx.lineTo(p.x, p.y); sgCtx.stroke();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      sgCanvas.addEventListener(ev, function () { sgDrawing = false; });
    });

    function openSign(which) {
      sigTarget = which;
      $('#sgTitle').textContent = which === 'A' ? '가입자 서명' : '담당자 서명';
      sgModal.hidden = false;
      document.body.style.overflow = 'hidden';
      /* 화면에 붙은 뒤에 크기를 재야 캔버스 해상도가 맞는다 */
      requestAnimationFrame(sgSetup);
    }
    function closeSign() {
      sgModal.hidden = true;
      document.body.style.overflow = '';
    }
    $('#sgClear').addEventListener('click', sgSetup);
    $('#sgCancel').addEventListener('click', closeSign);
    $('#sgSave').addEventListener('click', function () {
      if (!sgDrawn) return;
      sig[sigTarget] = sgCanvas.toDataURL('image/png');
      closeSign();
      renderSigns(); saveDraft();
      if (memberOn) memberSigned();
    });
    $$('[data-sign]').forEach(function (b) {
      b.addEventListener('click', function () { openSign(b.dataset.sign); });
    });
    $$('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        sig[b.dataset.del] = '';
        renderSigns(); saveDraft();
      });
    });

    function sigMode() {
      var el = document.querySelector('input[name="sigmode"]:checked');
      return el ? el.value : 'screen';
    }
    function renderSigns() {
      var paper = sigMode() === 'paper';
      fillSlot('#slotA', paper ? '' : sig.A);
      fillSlot('#slotB', paper ? '' : sig.B, val('staff'));
      ['A', 'B'].forEach(function (k) {
        var has = !paper && !!sig[k];
        $('#thumb' + k).innerHTML = has ? '<img src="' + sig[k] + '" alt="" />' : '';
        var st = $('#state' + k);
        st.textContent = has ? '서명 완료' : '미서명';
        st.classList.toggle('ok', has);
      });
    }
    function fillSlot(sel, url, nameBelow) {
      var el = $(sel);
      if (url) el.innerHTML = '<img src="' + url + '" alt="" />';
      else if (nameBelow) el.innerHTML = '<span>' + esc(nameBelow) + ' 서명</span>';
      else el.innerHTML = '<span>서명</span>';
    }

    $$('input[name="sigmode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var paper = sigMode() === 'paper';
        $('#sigHint').textContent = paper
          ? '서명란을 빈 줄로 출력합니다. 출력 후 종이에 직접 서명받으세요.'
          : '화면에서 손가락이나 펜으로 서명을 받습니다. 서명한 그대로 인쇄됩니다.';
        applyAgree();
        renderSigns(); saveDraft();
      });
    });
    $('#sigHint').textContent = '화면에서 손가락이나 펜으로 서명을 받습니다. 서명한 그대로 인쇄됩니다.';

    /* ── 약관 보기 → 동의 → 서명 흐름 ────────────────────
       전자서명(화면 서명)일 때만 동의를 요구한다.
       종이 자필은 출력물에 서명을 받으므로 잠그지 않는다. */
    var modal = $('#tmodal'), tmChk = $('#tmChk'), tmOk = $('#tmOk');

    function buildTermsView() {
      var body = $('#tmBody');
      if (body.childElementCount) return;
      var clone = sheet.querySelector('.terms').cloneNode(true);
      /* 면책규정 테두리 박스를 풀어 본문과 같은 흐름으로 읽히게 한다 */
      var box = clone.querySelector('.exempt');
      if (box) while (box.firstChild) box.parentNode.insertBefore(box.firstChild, box);
      if (box) box.remove();
      body.appendChild(clone);
    }
    function openTerms() {
      buildTermsView();
      tmChk.checked = agreed;
      tmOk.disabled = !agreed;
      modal.hidden = false;
      $('#tmBody').scrollTop = 0;
      document.body.style.overflow = 'hidden';
    }
    function closeTerms() {
      modal.hidden = true;
      document.body.style.overflow = '';
    }
    function applyAgree() {
      var paper = sigMode() === 'paper';
      var box = $('#agreeBox'), area = $('#sigArea');
      box.style.display = paper ? 'none' : '';
      area.classList.toggle('locked', !paper && !agreed);
      $('#btnTerms').classList.toggle('done', agreed);
      $('#btnTerms').textContent = agreed ? '✅ 약관 동의 완료 · 다시 보기' : '📖 약관 보기 · 동의하기';
      $('#agreeState').textContent = agreed
        ? '동의를 확인했습니다. 아래에서 서명을 받으세요.'
        : '약관에 동의하면 서명란이 열립니다.';
    }

    $('#btnTerms').addEventListener('click', openTerms);
    $('#tmClose').addEventListener('click', closeTerms);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeTerms(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeTerms();
    });
    tmChk.addEventListener('change', function () { tmOk.disabled = !tmChk.checked; });
    tmOk.addEventListener('click', function () {
      if (!tmChk.checked) return;
      agreed = true;
      closeTerms();
      applyAgree();
      saveDraft();
      var c = $("#sigArea");
      if (c) c.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    /* ── 회원에게 전달(핸드오프) 모드 ──────────────────────
       관리자가 정보를 다 채운 뒤 폰/패드를 회원에게 넘기는 화면.
       회원은 ① 가입 내용 확인 ② 약관 읽고 동의 ③ 서명 만 한다.
       입력 폼·인쇄·미리보기는 전부 가려져 회원이 건드릴 수 없다. */
    var memberOn = false;

    function handoffCheck() {
      var miss = [];
      if (!val('name')) miss.push('회원명');
      if (!dval('birth')) miss.push('생년월일');
      if (!val('tel')) miss.push('연락처');
      if (!document.querySelector('input[name="item"]:checked')) miss.push('종목');
      if (!digits(val('cnt'))) miss.push('등록 횟수');
      if (!dval('from')) miss.push('강습 시작일');
      if (!digits(val('total'))) miss.push('총 결제금액');
      return miss;
    }

    function memberInfoRows() {
      var picked = function (n) {
        var el = document.querySelector('input[name="' + n + '"]:checked');
        return el ? el.value : '';
      };
      var item = picked('item');
      if (item === '기타') item = val('itemEtc') || '기타';
      var reg = picked('reg');
      if (reg === '기타') reg = val('regEtc') || '기타';
      var f = dval('from'), t = dval('to');
      var rows = [
        ['회원명', val('name')],
        ['연락처', val('tel')],
        ['종목', item],
        ['등록구분', reg],
        ['등록 횟수', digits(val('cnt')) + '회'],
        ['강습 기간', (korDate(f, '-')) + ' ~ ' + (korDate(t, '-'))],
        ['총 결제금액', digits(val('total')) ? Number(digits(val('total'))).toLocaleString('ko-KR') + '원' : '-'],
        ['결제구분', picked('pay') || '-']
      ];
      return rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1] || '-') + '</dd>';
      }).join('');
    }

    function buildMemberTerms() {
      var box = $('#mbTerms');
      if (box.childElementCount) return;
      var clone = sheet.querySelector('.terms').cloneNode(true);
      var ex = clone.querySelector('.exempt');
      if (ex) { while (ex.firstChild) ex.parentNode.insertBefore(ex.firstChild, ex); ex.remove(); }
      box.appendChild(clone);
    }

    function memberSigned() {
      var ok = !!sig.A;
      var st = $('#mbSigState');
      st.textContent = ok ? '서명이 등록되었습니다. 아래 버튼을 눌러 제출해 주세요.' : '약관에 동의하면 서명할 수 있습니다.';
      st.classList.toggle('ok', ok);
      $('#mbSign').textContent = ok ? '✍️ 다시 서명하기' : '✍️ 서명하기';
      $('#mbDone').hidden = !ok;
    }

    function openMember() {
      var miss = handoffCheck();
      if (miss.length && !confirm('아직 비어 있는 항목이 있습니다.\n\n· ' + miss.join('\n· ') +
        '\n\n그래도 회원에게 전달할까요?')) return;
      if (sigMode() === 'paper') {
        if (!confirm('지금은 "종이 자필 서명" 모드입니다.\n화면 서명으로 바꿔서 전달할까요?')) return;
        var r = document.querySelector('input[name="sigmode"][value="screen"]');
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
      }
      buildMemberTerms();
      $('#mbInfo').innerHTML = memberInfoRows();
      $('#mbChk').checked = agreed;
      $('#mbChk').disabled = !agreed;
      $('#mbAgreeLabel').classList.toggle('off', !agreed);
      $('#mbScrollHint').textContent = agreed ? '✅ 약관을 확인했습니다' : '⬇ 약관을 끝까지 내려서 읽어 주세요';
      $('#mbScrollHint').classList.toggle('done', agreed);
      $('#mbSign').disabled = !agreed;
      $('#mbFin').hidden = true;
      memberSigned();
      memberOn = true;
      $('#member').hidden = false;
      $('#mbScroll').scrollTop = 0;
      $('#mbTerms').scrollTop = 0;
      document.body.style.overflow = 'hidden';
    }

    function closeMember() {
      memberOn = false;
      $('#member').hidden = true;
      document.body.style.overflow = '';
      render();
    }

    /* 회원이 임의로 빠져나가 입력값을 건드리지 못하도록 관리자 비밀번호로만 복귀 */
    function exitMember() {
      var pw = prompt('직원 확인 — 관리자 비밀번호를 입력하세요');
      if (pw === null) return;
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) closeMember();
          else alert('비밀번호가 맞지 않습니다.');
        })
        .catch(function () { alert('서버에 연결할 수 없습니다.'); });
    }

    /* 약관을 끝까지 내려야 동의 체크가 열린다 */
    $('#mbTerms').addEventListener('scroll', function () {
      var el = this;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 24) return;
      if (!$('#mbChk').disabled) return;
      $('#mbChk').disabled = false;
      $('#mbAgreeLabel').classList.remove('off');
      $('#mbScrollHint').textContent = '✅ 약관을 끝까지 확인했습니다';
      $('#mbScrollHint').classList.add('done');
    });
    $('#mbChk').addEventListener('change', function () {
      agreed = this.checked;
      $('#mbSign').disabled = !agreed;
      if (!agreed) { $('#mbDone').hidden = true; }
      applyAgree(); saveDraft();
    });
    $('#mbSign').addEventListener('click', function () { openSign('A'); });
    $('#mbDone').addEventListener('click', function () {
      $('#mbFin').hidden = false;
    });
    $('#mbExit').addEventListener('click', exitMember);
    $('#mbFinExit').addEventListener('click', exitMember);
    $('#btnHandoff').addEventListener('click', openMember);

    /* ── 입력 바인딩 ─────────────────────────────────────── */
    fields.forEach(function (el) {
      var k = el.dataset.f;
      el.addEventListener('input', function () {
        if (k === 'tel') el.value = hyphenTel(el.value);
        if (['unit', 'paid', 'due', 'total', 'stdPrice'].indexOf(k) > -1) el.value = comma(el.value);
        /* 자동계산 칸을 손으로 고치면 그때부터 수동 값을 존중한다.
           칸을 비우면 다시 자동계산으로 돌아간다. */
        if (k === 'total') totalTouched = el.value.trim() !== '';
        if (k === 'to') toTouched = el.value.trim() !== '';
        /* 숫자만 8자리(또는 6자리) 채워지면 즉시 YYYY-MM-DD 로 정리 */
        if (el.hasAttribute('data-date')) {
          var n = digits(el.value);
          if (n.length === 6 || n.length === 8) {
            var iso = normDate(el.value);
            if (iso) el.value = iso;
          }
        }
        render();
      });
      /* 칸을 벗어날 때 한 번 더 정리 — 2010.10.14 처럼 찍어 넣은 경우까지 흡수 */
      if (el.hasAttribute('data-date')) {
        el.addEventListener('blur', function () {
          var iso = normDate(el.value);
          if (iso) { el.value = iso; render(); }
        });
      }
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
        d.agreed = agreed;
        d.sig.a = sig.A;
        d.sig.b = sig.B;
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
      agreed = !!d.agreed;
      if (d.sig) { sig.A = d.sig.a || ""; sig.B = d.sig.b || ""; }
    }

    $("#btnBack").addEventListener("click", function () { location.href = "/"; });

    $("#btnReset").addEventListener('click', function () {
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
    applyAgree();
    render();
    fit();
  }
})();
