// J.SMS 발송센터 서비스 워커 — 캐시 없음(항상 최신), 설치 가능(PWA) + 새 문자 푸시 알림·배지 담당.
// ⚠️ 루트 sw.js(캘린더)와 별개. scope=/sms/ 로 등록되어 서로 간섭하지 않는다.
const SW_VERSION = 2;

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

// ══════════════════════════════════════════════════════════
//  새 문자 푸시 알림 + 앱 배지
//  서버(POST /api/sms/gw/log, dir='in')가 새 수신 문자마다 이 push 이벤트를 쏜다.
//  배지 숫자 = "현재 화면에 안 읽고 떠 있는 알림 개수"를 그대로 쓴다(별도 읽음 DB 불필요) —
//  getNotifications()로 현재 떠 있는 알림 수를 세어 setAppBadge에 반영.
// ══════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'J.SMS';
  const body = data.body || '새 메시지가 도착했습니다';
  const url = data.url || '/sms/';

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: '/icons/sms-192.png',
      badge: '/icons/sms-192.png',
      tag: data.tag || ('msg-' + Date.now()),
      data: { url },
    });
    if ('setAppBadge' in navigator) {
      try {
        const notifs = await self.registration.getNotifications();
        await navigator.setAppBadge(notifs.length);
      } catch (_) {}
    }
  })());
});

// 알림 클릭 → 이미 열린 창이 있으면 포커스, 없으면 새로 열기. 남은 알림 수로 배지 재계산.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/sms/';
  event.waitUntil((async () => {
    if ('setAppBadge' in navigator) {
      try {
        const notifs = await self.registration.getNotifications();
        await navigator.setAppBadge(notifs.length);
      } catch (_) {}
    }
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      if ('focus' in c) { c.navigate(targetUrl); return c.focus(); }
    }
    return clients.openWindow(targetUrl);
  })());
});
