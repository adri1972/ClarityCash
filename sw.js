// KAMIKAZE SERVICE WORKER
// This file exists ONLY to kill the old sw.js (v32) registration.
// When the browser checks for updates to sw.js, it finds THIS version,
// which immediately kills itself and clears all old caches.

// 1. On install: skip waiting (take control immediately)
self.addEventListener('install', () => self.skipWaiting());

// 2. On activate: delete ALL caches and unregister self
self.addEventListener('activate', async (event) => {
    event.waitUntil(
        (async () => {
            // Delete every cache
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));

            // Tell all pages to reload
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(client => client.navigate(client.url));

            // Unregister self (suicide)
            self.registration.unregister();
        })()
    );
});

// 3. On fetch: just pass through to network (no caching)
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
