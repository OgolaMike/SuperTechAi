// SMA 60 Signal Dashboard service worker.
// Caches the app shell so the dashboard can be installed and opened offline.
// Live market data still requires a network connection to Deriv's WebSocket.

const CACHE_NAME = 'sma60-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/IMG-20261018-WA0005(1).jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'SuperTech Ai', {
      body: payload.body || '',
      tag: payload.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      silent: false,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET; let WebSocket/POST fall through to the network.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache WebSocket upgrades or cross-origin API calls.
  if (req.mode === 'websocket' || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Same-origin navigation requests: network-first, fall back to cached shell.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then(
            (res) => res || caches.match('/'),
          ),
        ),
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
