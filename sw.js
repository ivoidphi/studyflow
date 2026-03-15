/* StudyFlow Service Worker — network-first strategy */
const CACHE = 'studyflow-v3';

// Only cache these as offline fallbacks — NOT as the primary source
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

// On install: pre-cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).catch(() => {})
  );
  // Take over immediately — don't wait for old SW to die
  self.skipWaiting();
});

// On activate: delete ALL old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // For app shell files (.html, .css, .js) — NETWORK FIRST
  // Always try to get fresh files, fall back to cache only if offline
  const isAppFile = PRECACHE.some(p => e.request.url.includes(p.replace('./', '')))
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.js');

  if (isAppFile) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Update cache with fresh version
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // offline fallback
    );
    return;
  }

  // For everything else (fonts, CDN, icons) — cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});