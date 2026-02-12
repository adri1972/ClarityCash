// ClarityCash Service Worker v65 - AGGRESSIVE CACHE BUSTER
const CACHE_NAME = 'cc-v65-force';

self.addEventListener('install', (event) => {
    // Force immediate takeover
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Delete ALL old caches indiscriminately
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            // Take control of all open pages immediately
            return self.clients.claim();
        })
    );
});

// NETWORK ONLY POLICY FOR HTML/JS/CSS during development/updates
// We only fallback to cache if offline
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Strategy: Network First, Fallback to Cache
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Check if valid response
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // Cache it for future offline use
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            })
            .catch(() => {
                // Offline fallback
                return caches.match(event.request);
            })
    );
});
