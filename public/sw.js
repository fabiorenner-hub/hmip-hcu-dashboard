/* Minimal service worker for PWA install support and offline-shell caching. */
const CACHE = 'smarthome-shell-v1';
const SHELL = ['/', '/static/app.js', '/static/styles.css', '/static/favicon.svg', '/static/manifest.webmanifest'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
        ),
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    // Never cache API responses — the dashboard needs live data.
    if (url.pathname.startsWith('/api/')) return;
    if (request.method !== 'GET') return;

    event.respondWith(
        caches.match(request).then((cached) =>
            cached ||
            fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(request, copy).catch(() => {}));
                    return res;
                })
                .catch(() => cached),
        ),
    );
});
