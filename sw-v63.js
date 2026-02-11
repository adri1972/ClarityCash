
const CACHE_NAME = 'cc-v63-release';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css?v=63',
    './js/app.js?v=63',
    './js/ui.js?v=63',
    './js/data.js?v=63',
    './js/advisor.js?v=63',
    './js/gemini.js?v=63',
    './assets/logo.png',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/feather-icons'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
