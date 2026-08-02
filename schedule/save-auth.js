/* ===========================================================
   저장 요청에 로그인 토큰을 실어 보내는 보정
   -----------------------------------------------------------
   이식해 온 앱은 전체 상태를 저장할 때 인증 정보를 아무것도 보내지
   않는다(원본 NAS 의 PHP 가 누구나 쓰기 가능하도록 열려 있었음).
   우리 서버는 관리자만 저장할 수 있게 막아 두었기 때문에, 그대로 두면
   저장이 403 으로 거부되고 — 앱은 이 실패를 console.error 로만 남겨서
   화면상으로는 저장된 것처럼 보이다가 새로고침하면 사라진다.

   앱 번들은 건드리지 않고, fetch 를 감싸서
     · 저장 POST 에 로그인 시 받은 토큰(jstudio_token)을 실어 보내고
     · 저장이 실패하면 사용자에게 알린다.
   =========================================================== */
(function () {
  if (!window.fetch) return;
  var origFetch = window.fetch.bind(window);

  function isSavePost(url, method) {
    return method === 'POST'
        && /(^|\/)api\.php(\?|$)/.test(url)
        && !/[?&]action=/.test(url);   // 로그인·토큰검증 등은 제외
  }

  window.fetch = function (input, init) {
    var url = '', method = 'GET';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    } catch (e) { /* 판별 실패 시 원래대로 진행 */ }

    if (isSavePost(url, method)) {
      try {
        var token = localStorage.getItem('jstudio_token');
        if (token && init && typeof init.body === 'string') {
          var data = JSON.parse(init.body);
          if (data && typeof data === 'object' && !data.token) {
            data.token = token;
            init = Object.assign({}, init, { body: JSON.stringify(data) });
          }
        }
      } catch (e) { /* 토큰을 못 붙여도 원래 요청은 그대로 보낸다 */ }

      return origFetch(input, init).then(function (res) {
        if (!res.ok) {
          var msg = res.status === 403
            ? '저장 권한이 없습니다. 관리자로 다시 로그인한 뒤 저장해 주세요.'
            : '저장에 실패했습니다. (오류 ' + res.status + ') 잠시 후 다시 시도해 주세요.';
          setTimeout(function () { alert(msg); }, 0);
        }
        return res;
      }).catch(function (err) {
        setTimeout(function () { alert('저장 중 서버에 연결하지 못했습니다.'); }, 0);
        throw err;
      });
    }

    return origFetch(input, init);
  };
})();
