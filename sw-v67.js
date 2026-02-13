// ClarityCash Service Worker v67 - ULTRA AGGRESSIVE CACHE BUSTER
const CACHE_NAME = 'cc-v67-j-lock';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Strategy: Bypass cache for everything during this update
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
