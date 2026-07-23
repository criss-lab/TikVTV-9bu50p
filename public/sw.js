const CACHE_NAME = 'tikvtv-v2';
const SHELL_URLS = ['/', '/index.html'];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API/streams, cache-first for shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache video streams or external APIs
  if (
    url.hostname.includes('iptv-org') ||
    url.hostname.includes('akamaized') ||
    url.hostname.includes('cdninstagram') ||
    event.request.url.includes('.m3u') ||
    event.request.url.includes('.m3u8') ||
    event.request.url.includes('.ts') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Cache-first for same-origin assets (JS, CSS, images)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
