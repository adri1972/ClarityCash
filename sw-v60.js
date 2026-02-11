
const CACHE_NAME = 'cc-v62-release';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css?v=62',
    './js/app.js?v=62',
    './js/ui.js?v=62',
    './js/data.js?v=62',
    './js/advisor.js?v=62',
    './js/gemini.js?v=62',
    './assets/logo.png',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/feather-icons'
];

// 1. INSTALL: Skip waiting to activate immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. ACTIVATE: Claim clients and delete OLD caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. FETCH: Stale-While-Revalidate strategy
// This puts speed first but updates in background
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests like APIs if needed, but here we want to cache CDN libs
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            });
            // Return cached response immediately if available, otherwise wait for network
            return cachedResponse || fetchPromise;
        })
    );
});
