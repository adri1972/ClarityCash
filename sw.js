const CACHE_NAME = 'clarity-cash-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './assets/icon.svg',
    './css/styles.css',
    './js/advisor.js',
    './js/ai.js',
    './js/gemini.js',
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
    // Network First: Always try to get fresh content, fall back to cache if offline
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Save fresh copy to cache
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(() => {
                // Offline: serve from cache
                return caches.match(event.request);
            })
    );
});
