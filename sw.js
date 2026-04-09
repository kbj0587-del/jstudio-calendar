// 서비스 워커 - 캐시 없이 항상 네트워크에서 직접 로드
// (앱 업데이트가 즉시 반영됨)

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  // 모든 기존 캐시 삭제
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// 모든 요청을 네트워크에서 직접 처리 (캐시 없음)
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
