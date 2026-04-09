const CACHE_NAME = 'jstudio-calendar-v10';
const STATIC_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './manifest.json'
];

// 설치: 아이콘/매니페스트만 프리캐시 (앱 코드는 네트워크 우선)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 구버전 캐시 모두 삭제
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API 요청: 항상 네트워크
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 아이콘/매니페스트: 캐시 우선 (자주 안 바뀜)
  if (e.request.destination === 'image' || url.pathname.endsWith('manifest.json')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // HTML / JS / CSS: 네트워크 우선, 실패 시 캐시 폴백
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
