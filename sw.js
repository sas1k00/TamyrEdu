/* Service worker: после первого открытия приложение работает без интернета. */
const CACHE = 'tamyr-v24';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css?v=23',
  './js/data.js?v=23', './js/data-ent.js?v=23', './js/i18n.js?v=23', './js/engine.js?v=23', './js/content.js?v=23', './js/content-ent.js?v=23', './js/kk-ent.js?v=23', './js/kk.js?v=23', './js/fsrs.js?v=23', './js/learner.js?v=23', './js/graph.js?v=23',
  './js/store.js?v=23', './js/config.js?v=23', './js/account.js?v=23', './js/app.js?v=23', './js/teacher.js?v=23',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Сначала сеть (чтобы получать обновления), при отсутствии сети — кэш.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const fromCache = () => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (!res.ok) return fromCache().then(r => r || res); // ошибка сервера или прокси — берём из кэша
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => fromCache().then(r => r || Response.error()))
  );
});
