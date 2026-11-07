const CACHE_NAME = 'turjuman-v3.1';
const ASSETS = [
  '/',
  '/css/style.css',
  '/fonts/fonts.css',
  '/fonts/IBMPlexSans-Bold.woff2',
  '/fonts/IBMPlexSans-Medium.woff2',
  '/fonts/IBMPlexSans-Regular.woff2',
  '/fonts/IBMPlexSans-SemiBold.woff2',
  '/fonts/IBMPlexSansArabic-Bold.woff2',
  '/fonts/IBMPlexSansArabic-Medium.woff2',
  '/fonts/IBMPlexSansArabic-Regular.woff2',
  '/fonts/IBMPlexSansArabic-SemiBold.woff2',
  '/js/app.js',
  '/js/ai-translator.js',
  '/js/speech-engine.js',
  '/js/socket-client.js',
  '/manifest.json',
  '/icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key.startsWith('turjuman-') && key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية Network-First لضمان ظهور التحديثات فوراً
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone)).catch(() => {}));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request, { ignoreSearch: true }).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('/') : Response.error()));
      })
  );
});
