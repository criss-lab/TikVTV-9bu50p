const CACHE_NAME = 'tikvtv-v3';
const SHELL_URLS = ['/', '/index.html'];
const MEDIA_EXTENSIONS = /\.(?:m3u8?|mpd|ts|m4s|mp4|m4v|m4a|aac|mp3|mp2t|webm|mov|flv|key)(?:$|\?)/i;
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('tikvtv-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache live streams, segments, encryption keys, or API responses.
  // This is deliberately broader than .m3u8: providers commonly use .m4s/.mp4/.aac segments.
  if (
    MEDIA_EXTENSIONS.test(url.pathname) ||
    /(?:^|\/)api(?:\/|$)/i.test(url.pathname) ||
    url.hostname.includes('iptv-org') ||
    url.hostname.includes('akamaized') ||
    url.hostname.includes('cdninstagram') ||
    request.destination === 'video' ||
    request.destination === 'audio'
  ) return;

  // Keep navigation fresh so deployments are not trapped behind a cached HTML shell.
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      })
    );
    return;
  }

  // Cache only same-origin static assets. Do not cache arbitrary fetch() responses,
  // Supabase/API data, or live playlists under a generic cache-first strategy.
  if (url.origin !== self.location.origin || !STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});
