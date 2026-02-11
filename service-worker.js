// KAMIKAZE SERVICE WORKER - THE V41 KILLER
// This file exists solely to target the lingering v41 Service Worker.
// When the browser checks for updates to 'service-worker.js', it will find this file.

const NEW_VERSION = 'KILLER_V1';

self.addEventListener('install', (event) => {
    // Install immediately, do not wait
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // 1. Delete ALL caches (HTML, JS, CSS, Images - EVERYTHING)
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        console.log('💥 KAMIKAZE: All caches deleted.');

        // 2. Unregister this service worker (suicide)
        await self.registration.unregister();
        console.log('💥 KAMIKAZE: Unregistered self.');

        // 3. Force all open clients to reload from the network
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
            console.log('💥 KAMIKAZE: Forcing reload on client.');
            await client.navigate(client.url);
        }
    })());
});
