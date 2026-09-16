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
  /* PIN 확인은 서버가 한다(기기마다 다른 값을 쓰지 않도록).
     미설정 상태에서는 기본 PIN 1234 가 통한다. */
  function verifyPin(pin) {
    return fetch('/api/contract/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin })
    }).then(function (r) { return r.json(); });
  }

  if (sessionStorage.getItem('jstudio_contract_ok') === '1') {
    openApp();
  } else {
    $('#gbtn').addEventListener('click', submitPin);
    $('#gpw').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPin(); });
    $('#gpw').addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
    });
    setTimeout(function () { $('#gpw').focus(); }, 100);
  }
  var backBtn = $("#gback");
  if (backBtn) backBtn.addEventListener("click", function () { location.href = "/"; });

  /* PIN 분실 — 캘린더 관리자 비밀번호로 초기 PIN(1234)으로 되돌린다 */
  var forgotBtn = $('#gforgot');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', function () {
      var pw = prompt('PIN을 초기값(1234)으로 되돌립니다.\n\n캘린더 관리자 비밀번호를 입력하세요.');
      if (pw === null) return;
      var err = $('#gerr');
      err.textContent = '초기화 중…';
      fetch('/api/contract/pin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: String(pw).trim() })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            err.textContent = '';
            alert('PIN을 1234로 되돌렸습니다.');
            $('#gpw').value = '';
            $('#gpw').focus();
          } else {
            err.textContent = (d && d.message) || '초기화하지 못했습니다';
          }
        })
        .catch(function () { err.textContent = '서버에 연결할 수 없습니다'; });
    });
  }

  function submitPin() {
    var pin = $('#gpw').value.trim();
    var err = $('#gerr');
    if (!/^\d{4,6}$/.test(pin)) { err.textContent = 'PIN은 숫자 4~6자리입니다'; return; }
    err.textContent = '확인 중…';
    verifyPin(pin)
      .then(function (d) {
        if (d && d.ok) {
          sessionStorage.setItem('jstudio_contract_ok', '1');
          openApp();
          if (d.isDefault) {
            setTimeout(function () {
              alert('아직 초기 PIN(1234)을 쓰고 있습니다.\n상단 「PIN 변경」에서 바꿔 주세요.');
            }, 400);
          }
        } else {
          err.textContent = 'PIN이 맞지 않습니다';
          $('#gpw').value = '';
          $('#gpw').focus();
        }
      })
      .catch(function () { err.textContent = '서버에 연결할 수 없습니다'; });
  }

  /* ── 본체 ──────────────────────────────────────────────── */
  function init() {
    var sheet = $('#sheet');
    var fields = $$('[data-f]');
    var groups = ["join", "item", "reg", "pay"];
    var DISCOUNT = { "2:1": 0.2, "3:1": 0.3 };   /* 등록구분별 할인율 */
    var unitTouched = false;    /* 1회 금액을 손으로 고쳤는가 */
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
    /* 체크 상태를 계약서 표기(□신규 ☑재등록 …)로.
       종목은 여러 개를 고를 수 있어 선택값을 배열로 다룬다. */
    function pickedList(name) {
      if (blankMode) return [];
      return $$("input[name=\"" + name + "\"]:checked").map(function (el) { return el.value; });
    }
    function optLine(name, opts, etcVal) {
      var on = pickedList(name);
      return opts.map(function (o) {
        var hit = on.indexOf(o) > -1;
        var label = o;
        if (o === '기타') label = '기타(' + (hit && etcVal ? ' ' + etcVal + ' ' : '     ') + ')';
        return '<span class="opt' + (hit ? ' on' : '') + '"><b>' + (hit ? '☑' : '□') + '</b>' + label + '</span>';
      }).join('');
    }

    /* 날짜: 20101014 · 101013 처럼 숫자만 입력해도 2010-10-14 로 자동 정리 */
    function normDate(raw) {
      var d = digits(raw);
      var y, m, dd;
      if (d.length === 8) { y = +d.slice(0, 4); m = +d.slice(4, 6); dd = +d.slice(6, 8); }
      else if (d.length === 4) { y = new Date().getFullYear(); m = +d.slice(0, 2); dd = +d.slice(2, 4); }
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
      if (blankMode) return '';
      var el = $('[data-f="' + k + '"]');
      if (!el) return '';
      return normDate(el.value);
    }
    function setDate(k, iso) {
      var el = $('[data-f="' + k + '"]');
      if (el) el.value = iso || '';
    }

    /* 빈 양식 출력 중에는 입력값을 모두 비어 있는 것으로 취급한다.
       입력칸 자체는 건드리지 않으므로 작성 중이던 내용은 사라지지 않는다. */
    var blankMode = false;
    function val(k) {
      if (blankMode) return '';
      var el = $('[data-f="' + k + '"]');
      return el ? el.value.trim() : '';
    }
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
      put('regOpts', optLine('reg', ['1:1', '2:1', '3:1', '4:1', '기타'], val('regEtc')));
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
      $("#toBadge").textContent = "";
      var blankFrom = '20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일';
      put('period', (korDate(f, blankFrom)) + '&nbsp;&nbsp;~&nbsp;&nbsp;' + (korDate(t, blankFrom)));

      put('bonus', esc(val('bonus')));

      /* 1회 금액 — 등록구분별 할인율을 정상가에 적용해 채운다.
         2:1 은 20%, 3:1 은 30% 할인. 직접 고치면(unitTouched) 건드리지 않는다. */
      var std = Number(digits(val('stdPrice'))) || 0;
      var regPick = (document.querySelector('input[name="reg"]:checked') || {}).value || '';
      var rate = DISCOUNT[regPick] || 0;
      var autoUnit = std ? Math.round(std * (1 - rate) / 10) * 10 : 0;
      if (!unitTouched && autoUnit) $('[data-f="unit"]').value = autoUnit.toLocaleString('ko-KR');
      $('#unitBadge').textContent = !std ? ''
        : unitTouched ? '· 직접 입력됨 (자동값 ' + autoUnit.toLocaleString('ko-KR') + '원)'
          : rate ? '· ' + regPick + ' 할인 ' + (rate * 100) + '% 적용'
            : '· 정상가 적용';

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

      put('agreeMark', '동의함 ' + ((!blankMode && agreed) ? '☑' : '□'));
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
      $("#sgSave").disabled = true;
      $("#sgWm").style.display = "";
    }
    function sgPos(e) {
      var r = sgCanvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    sgCanvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      sgDrawing = true; sgDrawn = true;
      $("#sgSave").disabled = false;
      $("#sgWm").style.display = "none";   /* 쓰기 시작하면 안내 문구를 지운다 */
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
      $("#sgTitle").textContent =
        which === "A" ? "가입자 서명"
          : which === "S" ? ("담당자 서명 등록 — " + pendingStaffName)
            : "담당자 서명";
      var who = which === "A" ? "가입자" : "담당자";
      $("#sgSub").innerHTML = "성명을 <b>정자로</b> 또박또박 써 주세요 (손가락 또는 펜)";
      $("#sgWm").textContent = who + " 성명을 정자로 써 주세요";
      sgModal.hidden = false;
      document.body.style.overflow = "hidden";
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
      var data = sgCanvas.toDataURL("image/png");
      if (sigTarget === "S") {
        staffList.push({ name: pendingStaffName, sig: data });
        saveStaff(); renderStaff();
        $("#staffSel").value = String(staffList.length - 1);
        sig.B = data;
        $("[data-f=\"staff\"]").value = pendingStaffName;
      } else {
        sig[sigTarget] = data;
      }
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
      var paper = blankMode || sigMode() === 'paper';
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

    /* ── 담당자 서명 미리 등록 ─────────────────────────────
       강사 서명을 한 번 받아 두면 다음 계약서부터는 고르기만 하면 된다.
       계약 내용과 달리 서버에 보내지 않고 이 기기에만 보관한다. */
    var STAFF_KEY = 'jstudio_contract_staff';
    var staffList = [];
    var pendingStaffName = '';

    function loadStaff() {
      try { staffList = JSON.parse(localStorage.getItem(STAFF_KEY) || '[]'); }
      catch (e) { staffList = []; }
      if (!Array.isArray(staffList)) staffList = [];
    }
    function saveStaff() {
      try { localStorage.setItem(STAFF_KEY, JSON.stringify(staffList)); }
      catch (e) { alert('저장 공간이 부족해 담당자 서명을 보관하지 못했습니다.'); }
    }
    function renderStaff() {
      var sel = $('#staffSel');
      var cur = sel.value;
      sel.innerHTML = '<option value="">저장된 담당자 서명 선택…</option>' +
        staffList.map(function (s, i) {
          return '<option value="' + i + '">' + esc(s.name) + '</option>';
        }).join('');
      if (cur && staffList[cur]) sel.value = cur;
    }

    $('#staffSel').addEventListener('change', function () {
      var s = staffList[this.value];
      if (!s) return;
      sig.B = s.sig;
      $('[data-f="staff"]').value = s.name;
      render();
    });
    $('#btnStaffAdd').addEventListener('click', function () {
      var name = prompt('등록할 담당자 이름을 입력하세요');
      if (name === null) return;
      name = String(name).trim();
      if (!name) { alert('이름을 입력해 주세요.'); return; }
      pendingStaffName = name;
      openSign('S');
    });
    $('#btnStaffDel').addEventListener('click', function () {
      var sel = $('#staffSel');
      var s = staffList[sel.value];
      if (!s) { alert('삭제할 담당자를 먼저 선택하세요.'); return; }
      if (!confirm('"' + s.name + '" 서명을 삭제할까요?')) return;
      staffList.splice(sel.value, 1);
      saveStaff(); renderStaff();
    });

    loadStaff();
    renderStaff();

    /* ── PIN 변경 ─────────────────────────────────────────
       현재 PIN을 확인한 뒤 새 PIN(4~6자리)으로 바꾼다. 서버에 해시로 보관돼
       모든 기기에 같이 적용된다. */
    $('#btnPin').addEventListener('click', function () {
      var cur = prompt('현재 PIN을 입력하세요');
      if (cur === null) return;
      var next = prompt('새 PIN을 입력하세요 (숫자 4~6자리)');
      if (next === null) return;
      next = String(next).trim();
      if (!/^\d{4,6}$/.test(next)) { alert('PIN은 숫자 4~6자리여야 합니다.'); return; }
      var again = prompt('확인을 위해 새 PIN을 한 번 더 입력하세요');
      if (again === null) return;
      if (String(again).trim() !== next) { alert('새 PIN이 서로 다릅니다.'); return; }
      fetch('/api/contract/pin/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: String(cur).trim(), newPin: next })
      })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (res) {
          if (res.d && res.d.ok) alert('PIN을 변경했습니다.\n다음 접속부터 새 PIN을 쓰세요.');
          else alert((res.d && res.d.message) || 'PIN을 변경하지 못했습니다.');
        })
        .catch(function () { alert('서버에 연결할 수 없습니다.'); });
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
      if (!pickedList("item").length) miss.push("종목");
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
      var item = pickedList("item").map(function (v) {
        return v === "기타" ? (val("itemEtc") || "기타") : v;
      }).join(", ");
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

    /* 약관 본문을 회원 화면에 옮기면서, 동의가 필요한 조항 바로 아래에
       동의 박스를 끼워 넣는다. 인쇄물에는 들어가지 않는다. */
    function buildMemberTerms() {
      var box = $('#mbTerms');
      if (box.childElementCount) return;
      var clone = sheet.querySelector('.terms').cloneNode(true);
      var ex = clone.querySelector('.exempt');
      if (ex) { while (ex.firstChild) ex.parentNode.insertBefore(ex.firstChild, ex); ex.remove(); }
      box.appendChild(clone);

      /* 계약 효력·개인정보 안내도 회원이 읽어야 하므로 함께 붙인다 */
      var con = sheet.querySelector('.consent').cloneNode(true);
      var mark = con.querySelector('.agree');
      if (mark) mark.remove();
      con.className = 'mb-consent';
      box.appendChild(con);

      $$('#mbTerms [data-consent]').forEach(function (el, i) {
        var lab = document.createElement('label');
        lab.className = 'mb-ck';
        lab.innerHTML = '<input type="checkbox" data-ck="' + i + '" autocomplete="off" />' +
          '<span><b>' + el.dataset.consent + '</b> — 위 내용을 확인하고 동의합니다.</span>';
        el.parentNode.insertBefore(lab, el.nextSibling);
      });
      $$('#mbTerms input[data-ck]').forEach(function (c) {
        c.addEventListener('change', syncConsent);
      });
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
      /* 이미 동의를 받아 둔 계약서라면 상태를 복원하고, 아니면 처음부터 받는다 */
      cks().forEach(function (c) { c.checked = agreed; });
      readToEnd = agreed;
      $('#mbScrollHint').textContent = agreed ? '✅ 약관을 확인했습니다' : '⬇ 약관을 끝까지 내려서 읽어 주세요';
      $('#mbScrollHint').classList.toggle('done', agreed);
      syncConsent();
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
    /* 회원 기기에서는 키보드 대신 화면 숫자패드로 PIN을 받는다.
       (아이폰 기본 키보드가 문자로 열리는 것을 막고, 입력도 빠르다) */
    var ppBuf = '';
    function ppDraw() {
      $('#ppDots').innerHTML = new Array(ppBuf.length + 1).join('<span></span>');
    }
    function openPinPad() {
      ppBuf = ''; ppDraw();
      $('#ppErr').textContent = '';
      $('#pinPad').hidden = false;
    }
    function closePinPad() { $('#pinPad').hidden = true; }
    function ppSubmit() {
      if (!/^\d{4,6}$/.test(ppBuf)) { $('#ppErr').textContent = 'PIN은 숫자 4~6자리입니다'; return; }
      $('#ppErr').textContent = '확인 중…';
      verifyPin(ppBuf)
        .then(function (d) {
          if (d && d.ok) { closePinPad(); closeMember(); }
          else { $('#ppErr').textContent = 'PIN이 맞지 않습니다'; ppBuf = ''; ppDraw(); }
        })
        .catch(function () { $('#ppErr').textContent = '서버에 연결할 수 없습니다'; });
    }
    $$('#pinPad [data-k]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.k;
        if (k === 'ok') return ppSubmit();
        if (k === 'back') { ppBuf = ppBuf.slice(0, -1); ppDraw(); return; }
        if (ppBuf.length >= 6) return;
        ppBuf += k; ppDraw();
        $('#ppErr').textContent = '';
      });
    });
    $('#ppCancel').addEventListener('click', closePinPad);

    function exitMember() { openPinPad(); }

    /* 서명 전이라도 직원이 창을 닫을 수 있어야 한다(회원이 나중에 하겠다고 할 때 등).
       닫기도 PIN을 거치지만, 서명이 없으면 그 사실을 먼저 알려 준다. */
    $('#mbClose').addEventListener('click', function () {
      if (!sig.A && !confirm('아직 서명을 받지 않았습니다. 그래도 회원 화면을 닫을까요?\n\n작성한 내용은 그대로 남습니다.')) return;
      openPinPad();
    });

    /* 동의 박스는 조항 옆에서 바로 체크할 수 있고,
       일일이 체크하기 어려울 때를 위해 "전체 동의" 버튼을 둔다.
       전체 동의 버튼은 약관을 끝까지 내려 읽은 뒤에만 열린다. */
    var readToEnd = false;
    function cks() { return $$('#mbTerms input[data-ck]'); }
    function ckDone() { return cks().filter(function (c) { return c.checked; }).length; }

    $('#mbTerms').addEventListener('scroll', function () {
      if (this.scrollTop + this.clientHeight < this.scrollHeight - 24) return;
      if (readToEnd) return;
      readToEnd = true;
      $('#mbScrollHint').textContent = '✅ 약관을 끝까지 확인했습니다';
      $('#mbScrollHint').classList.add('done');
      syncConsent();
    });

    function syncConsent() {
      var all = cks(), done = ckDone();
      var ok = all.length > 0 && done === all.length;
      all.forEach(function (c) { c.closest('.mb-ck').classList.toggle('on', c.checked); });

      $('#mbProg').textContent = '동의 ' + done + ' / ' + all.length;
      $('#mbProg').classList.toggle('done', ok);
      $('#mbAll').disabled = !readToEnd;
      $('#mbAll').classList.toggle('done', ok);
      $('#mbAll').textContent = ok
        ? '✓ 전체 동의 완료 — 아래에서 서명해 주세요'
        : (readToEnd ? '✓ 약관을 모두 읽었으며 전체 동의합니다' : '약관을 끝까지 읽으면 열립니다');

      agreed = ok;
      $('#mbSign').disabled = !agreed;
      if (!agreed) $('#mbDone').hidden = true;
      applyAgree();
      render();
      saveDraft();
    }

    $('#mbAll').addEventListener('click', function () {
      if (!readToEnd) return;
      var turnOn = ckDone() !== cks().length;
      cks().forEach(function (c) { c.checked = turnOn; });
      syncConsent();
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
        if (k === "unit") unitTouched = el.value.trim() !== "";
        if (k === "total") totalTouched = el.value.trim() !== "";
        if (k === 'to') toTouched = el.value.trim() !== '';
        /* 숫자만 8자리(또는 6자리) 채워지면 즉시 YYYY-MM-DD 로 정리 */
        if (el.hasAttribute('data-date')) {
          var n = digits(el.value);
          /* 4자리(MMDD)는 타이핑 중 변환하지 않는다 — 6자리 입력(101013)을 가로채기 때문.
             4자리는 칸을 벗어날 때 blur 에서 처리한다. */
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
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", function () { setTimeout(fit, 250); });
    /* iOS 에서 확대/축소나 주소창 변화로 보이는 영역이 바뀌면 다시 맞춘다 */
    if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);

    /* ── MEMBERSHIP CODE NO 자동 생성 ──────────────────────
       해당 연도 + 임의 4자리. 서버에 목록을 두지 않으므로 중복을 완전히
       막지는 못하지만(1만분의 1), 손으로 적는 수고를 덜기 위한 번호다. */
    function makeCode() {
      var y = new Date().getFullYear();
      var n = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return y + '-' + n;
    }
    $('#btnCode').addEventListener('click', function () {
      var el = $('[data-f="code"]');
      if (el.value.trim() && !confirm('현재 번호를 새 번호로 바꿀까요?\n\n' + el.value)) return;
      el.value = makeCode();
      render();
    });

    /* ── 2부 출력 (회원 보관용 · 센터 보관용) ────────────────
       계약서 사본 1부를 회원에게 교부하기 위해 항상 2장을 낸다.
       우측 상단 색인만 다르고 내용은 같다. */
    var COPY_LABELS = ['회원 보관용', '센터 보관용'];
    function buildCopies() {
      var pa = $('#printArea');
      pa.innerHTML = '';
      COPY_LABELS.forEach(function (label) {
        var c = sheet.cloneNode(true);
        c.removeAttribute('id');
        var tag = c.querySelector('[data-copy]');
        if (tag) tag.textContent = label;
        pa.appendChild(c);
      });
      return $$('#printArea .sheet');
    }
    function clearCopies() { $('#printArea').innerHTML = ''; }

    /* ── PDF 만들기 · 공유 ─────────────────────────────────
       아이폰(특히 홈화면에 설치한 앱)에서는 window.print() 가 아무 반응도
       없는 경우가 있다. 그래서 계약서를 그대로 A4 PDF 로 떠서
       · 기기 공유시트(카카오톡·메일·파일 저장)로 보내거나
       · 내려받게 한다.
       라이브러리는 처음 눌렀을 때만 내려받는다. */
    var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
    var libsReady = null;

    function loadScript(src) {
      return new Promise(function (ok, no) {
        var s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = function () { no(new Error(src)); };
        document.head.appendChild(s);
      });
    }
    function ensureLibs() {
      if (libsReady) return libsReady;
      libsReady = Promise.all([
        window.html2canvas ? Promise.resolve() : loadScript(CDN + 'html2canvas/1.4.1/html2canvas.min.js'),
        (window.jspdf && window.jspdf.jsPDF) ? Promise.resolve() : loadScript(CDN + 'jspdf/2.5.1/jspdf.umd.min.js')
      ]);
      return libsReady;
    }
    function busy(on, msg) {
      $('#busy').hidden = !on;
      if (msg) $('#busyMsg').textContent = msg;
    }
    function fileName() {
      if (blankMode) return '제이스튜디오_회원가입계약서_빈양식.pdf';
      var n = val('name') || '회원';
      var d = dval('signDate') || new Date().toISOString().slice(0, 10);
      return '제이스튜디오_회원가입계약서_' + n + '_' + d + '.pdf';
    }
    function buildPdf() {
      return ensureLibs().then(function () {
        /* 화면 밖에 원래 크기로 2부를 그려 두고 한 장씩 캡처한다.
           미리보기는 축소돼 있어 그대로 찍으면 흐려진다. */
        var pa = $('#printArea');
        var nodes = buildCopies();
        pa.style.cssText = 'display:block;position:absolute;left:-10000px;top:0';
        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

        var step = function (i) {
          if (i >= nodes.length) return pdf;
          return window.html2canvas(nodes[i], {
            scale: 2, backgroundColor: '#ffffff', logging: false,
            windowWidth: nodes[i].offsetWidth, windowHeight: nodes[i].offsetHeight
          }).then(function (canvas) {
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
            return step(i + 1);
          });
        };

        return step(0).then(function (out) {
          pa.style.cssText = ''; clearCopies();
          return out;
        }).catch(function (e) {
          pa.style.cssText = ''; clearCopies();
          throw e;
        });
      });
    }

    function sharePdf() {
      busy(true, 'PDF를 만드는 중…');
      return buildPdf().then(function (pdf) {
        var name = fileName();
        var blob = pdf.output('blob');
        var file = new File([blob], name, { type: 'application/pdf' });
        busy(false);
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: '회원가입 계약서' })
            .catch(function (e) {
              /* 사용자가 공유시트를 닫은 경우는 오류가 아니다 */
              if (e && e.name === 'AbortError') return;
              pdf.save(name);
            });
        }
        pdf.save(name);
      }).catch(function () {
        busy(false);
        alert('PDF를 만들지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      });
    }

    $('#btnShare').addEventListener('click', function () {
      if (!val('name') && !confirm('회원명이 비어 있습니다. 그대로 만들까요?')) return;
      sharePdf();
    });

    /* ── 임시 저장 (이 브라우저에만) ─────────────────────── */
    function saveDraft() {
      try {
        var d = { f: {}, g: {}, sig: {} };
        fields.forEach(function (el) { d.f[el.dataset.f] = el.value; });
        groups.concat(["sigmode"]).forEach(function (g) {
          d.g[g] = pickedList(g);   /* 여러 개 고를 수 있는 항목(종목)까지 담는다 */
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
        /* 예전 저장본은 문자열 하나, 지금은 배열 — 둘 다 받아 준다 */
        var vals = Array.isArray(d.g[g]) ? d.g[g] : (d.g[g] ? [d.g[g]] : []);
        vals.forEach(function (v) {
          var r = document.querySelector('input[name="' + g + '"][value="' + v + '"]');
          if (r) r.checked = true;
        });
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

    /* ── 인쇄 ─────────────────────────────────────────────
       iOS·설치형 앱에서는 window.print() 가 조용히 무시되는 경우가 있어
       PDF 로 떠서 공유시트(인쇄 포함)로 넘긴다. */
    var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    /* 브라우저 인쇄도 2부(회원 보관용·센터 보관용)를 낸다 */
    function browserPrint() {
      buildCopies();
      window.print();
      setTimeout(clearCopies, 800);
    }

    $('#btnPrint').addEventListener('click', function () {
      if (!val('name')) {
        if (!confirm('회원명이 비어 있습니다. 빈 양식으로 인쇄할까요?')) return;
      }
      if (isIOS || isStandalone || typeof window.print !== 'function') {
        sharePdf();
        return;
      }
      browserPrint();
    });

    /* 빈 양식 출력 — 작성 중인 내용은 그대로 두고 계약서만 비운 채로 출력한다. */
    $('#btnBlank').addEventListener('click', function () {
      blankMode = true;
      render();
      var restore = function () { blankMode = false; render(); };
      if (isIOS || isStandalone || typeof window.print !== 'function') {
        sharePdf().then(restore, restore);
      } else {
        browserPrint();
        setTimeout(restore, 900);
      }
    });

    /* 기본값: 계약일 = 오늘, 회원번호 = 연도-임의4자리 */
    if (!val("code")) $("[data-f=\"code\"]").value = makeCode();
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
