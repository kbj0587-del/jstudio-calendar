// J.SMS 발송센터 서비스 워커 — 캐시 없음(항상 최신), 설치 가능(PWA) 목적만.
// ⚠️ 루트 sw.js(캘린더)와 별개. scope=/sms/ 로 등록되어 서로 간섭하지 않는다.
const SW_VERSION = 1;

self.addEventListener('install', () => {
  console.log('[J.SMS SW] install v' + SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[J.SMS SW] activate v' + SW_VERSION + ' — 캐시 전체 삭제');
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// fetch 핸들러를 두되 아무 것도 가로채지 않는다.
// (Chrome의 "설치 가능" 조건은 fetch 핸들러 존재를 요구했던 이력이 있어 안전하게 유지)
self.addEventListener('fetch', () => {});
