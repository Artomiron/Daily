const CACHE_NAME = 'daily-cache-v1.7';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './ui.js',
  './circumplex.js',
  './body.js',
  './factors.js',
  './tasks.js',
  './shop.js',
  './reminders.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Спершу мережа: онлайн завжди отримуємо свіжі файли, кеш — лише для офлайну
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});

// ---------- Щоденне нагадування ----------

self.addEventListener('push', (event) => {
  let message = { title: 'Daily', body: 'Як пройшов твій день?' };
  try {
    if (event.data) message = { ...message, ...event.data.json() };
  } catch {}
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    icon: './icons/icon-192.png',
    badge: './icons/favicon-32.png',
    tag: 'daily-reminder',
    // Нагадування про оцінку дня відкриває одразу «Сьогодні»
    data: { url: './#today' },
  }));
});

// Тап по сповіщенню — відкриваємо Daily (або переходимо у вже відкритий)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
    const existing = windows.find((w) => w.url.startsWith(self.registration.scope));
    if (existing) {
      // Застосунок уже відкритий — переводимо його на потрібну вкладку
      const client = await existing.navigate(url).catch(() => existing);
      return (client || existing).focus();
    }
    return self.clients.openWindow(url);
  })());
});
