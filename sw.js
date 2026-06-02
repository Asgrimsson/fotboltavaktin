const CACHE = 'fotboltavaktin-v1.5.0';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest', '/assets/icon-192.svg', '/assets/icon-512.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.includes('/.netlify/functions/')) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
