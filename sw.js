const CACHE_NAME = 'clarity-cash-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './assets/icon.svg',
    './css/styles.css',
    './js/advisor.js',
    './js/ai.js', // If exists
    './js/app.js',
    './js/data.js',
    './js/ui.js',
    'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Network first strategy for API or dynamic data if any (none here, all local),
    // but for static assets, Cache First is usually better for PWA.
    // Given app nature (updated often locally), Stale-While-Revalidate might be good, 
    // or simply Cache First for shell and Network otherwise.

    // Simple Cache First strategy
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});
