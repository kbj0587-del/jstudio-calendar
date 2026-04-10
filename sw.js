// 서비스 워커 v3 — 캐시 없음, 모든 요청 브라우저 직접 처리
const SW_VERSION = 3;

self.addEventListener('install', () => {
  console.log('[SW] install v' + SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  console.log('[SW] activate v' + SW_VERSION + ' — 캐시 전체 삭제');
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// fetch 핸들러 없음 — 모든 요청은 브라우저가 직접 네트워크로 처리
