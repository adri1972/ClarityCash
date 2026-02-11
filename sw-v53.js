// ClarityCash Service Worker v52 - Cache Buster Extreme
const CACHE_NAME = 'cc-v52';

self.addEventListener('install', () => {
    // Take control IMMEDIATELY - don't wait
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        // Delete ALL old caches
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => {
            // Force all open pages to use this new SW
            return self.clients.claim();
        }).then(() => {
            // Force reload all open pages to get fresh HTML
            return self.clients.matchAll({ type: 'window' });
        }).then(clients => {
            clients.forEach(client => {
                client.navigate(client.url);
            });
        })
    );
});

// NETWORK FIRST: Always fetch from server
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
