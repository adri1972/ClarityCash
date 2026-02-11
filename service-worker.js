// ClarityCash Service Worker v50 - Network First, No Static Cache Issues
const CACHE_NAME = 'cc-v50';

self.addEventListener('install', () => {
    self.skipWaiting(); // Take control immediately
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// NETWORK FIRST: Always fetch from server, only use cache when offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Save fresh copy to cache for offline use
                if (response.ok && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
