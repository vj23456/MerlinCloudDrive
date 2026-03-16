const CACHE_NAME = 'clouddrive-cache-v2';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;

    // Only handle same-origin GET requests for static assets
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== location.origin) return;

    // Don't intercept API, gRPC, or navigation — let the browser handle natively.
    // Calling event.respondWith(fetch(..)) wraps errors in SW handler, producing
    // "TypeError: Failed to fetch" instead of the browser's own error page.
    if (!(/\.(wasm|js|css|png|ico|woff2?|ttf|svg)$/.test(url.pathname))) return;

    // Network-first for static assets: always try fresh content, fall back to cache
    // when offline. This ensures rebuilds are picked up immediately.
    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});
