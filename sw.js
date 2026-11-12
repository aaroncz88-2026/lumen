// 引光 · 离线缓存。策略：有网走网络（永远拿到最新版），没网用上次缓存。
const CACHE = 'lumen-v2';
const FILES = [
  './', 'index.html', 'style.css?v=2', 'core.js?v=2', 'game.js?v=2', 'manifest.webmanifest',
  'assets/logo.png', 'assets/cover-p.jpg', 'assets/cover-l.jpg',
  'assets/bg1.jpg', 'assets/bg2.jpg', 'assets/bg3.jpg', 'assets/bg4.jpg',
  'assets/icon-192.png', 'assets/icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
