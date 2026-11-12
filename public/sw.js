// SuperTech Ai service worker.
// Keep online launches on the newest deployed app shell. Use cached files only
// as a network-failure fallback so an old HTML/JS combination cannot strand
// members on a blank screen after a release.

const CACHE_NAME = 'supertech-ai-shell-v4';
const CACHE_PREFIX = 'supertech-ai-shell-';
const BRAND_LOGO = '/supertechai-icon.png?v=5752d4b0';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  BRAND_LOGO,
  '/supertechai-logo.png?v=32bbfde1',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
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
      icon: BRAND_LOGO,
      badge: BRAND_LOGO,
      silent: false,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin,
  ).href;

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
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'websocket' || url.protocol === 'ws:' || url.protocol === 'wss:') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)),
            );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
        }),
    );
    return;
  }

  const isStaticAsset =
    ['script', 'style', 'image', 'font'].includes(req.destination) ||
    url.pathname.startsWith('/assets/');

  if (!isStaticAsset) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)),
          );
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req)) || Response.error();
      }),
  );
});
