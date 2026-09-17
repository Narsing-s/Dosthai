const CACHE = 'dosthai-shell-v3';
const APP_SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icon.svg'];
const BOOTSTRAP_APIS = ['/api/models', '/api/capabilities', '/api/health'];

async function cacheResponse(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  const cache = await caches.open(CACHE);
  await cache.put(request, copy);
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache chat/agent streams or other mutable application APIs.
  if (url.pathname.startsWith('/api/') && !BOOTSTRAP_APIS.includes(url.pathname)) return;

  // Bootstrap data uses stale-while-revalidate: cached data appears immediately,
  // while the newest server response refreshes the cache in the background.
  if (BOOTSTRAP_APIS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then(response => cacheResponse(request, response)).catch(() => null);
      return cached || await network || new Response(JSON.stringify({ ok: false, offline: true }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    })());
    return;
  }

  // App/static assets use network-first so new releases are picked up quickly,
  // with the previous shell retained for offline use.
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && (request.mode === 'navigate' || request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font')) {
        return cacheResponse(request, response);
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('/offline.html')))
  );
});
