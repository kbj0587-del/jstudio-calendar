// 서비스 워커 - 캐시 없이 항상 네트워크에서 직접 로드
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API 요청은 SW를 거치지 않고 직접 처리
  if (e.request.url.includes('/api/')) {
    return; // 기본 브라우저 처리에 맡김
  }
  e.respondWith(
    fetch(e.request).catch(() => fetch(e.request))
  );
});
