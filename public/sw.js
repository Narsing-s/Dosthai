const CACHE = 'dosthai-shell-v5';
const APP_SHELL = ['/', '/offline.html', '/icon.svg'];
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    if ('navigationPreload' in self.registration) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Do not cache the manifest. Vercel deployment protection can redirect it to
  // the Vercel SSO endpoint, which must never be stored as an app-shell asset.
  if (url.pathname === '/manifest.webmanifest') return;

  // Never cache chat/agent streams or mutable application APIs.
  if (url.pathname.startsWith('/api/') && !BOOTSTRAP_APIS.includes(url.pathname)) return;

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

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        const response = preload || await fetch(request);
        return cacheResponse(request, response);
      } catch {
        return await caches.match(request) || await caches.match('/offline.html') || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font')) {
        return cacheResponse(request, response);
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('/offline.html')))
  );
});
