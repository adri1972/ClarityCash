(async function () {
    console.log('🚨 EMERGENCY CACHE CLEAR PROTOCOL INITIATED 🚨');

    // 1. Unregister all Service Workers immediately
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
                console.log('ServiceWorker unregistered:', registration);
            }
        } catch (e) { console.error('SW Unregister failed', e); }
    }

    // 2. Clear All Caches
    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            for (const key of keys) {
                await caches.delete(key);
                console.log('Cache deleted:', key);
            }
        } catch (e) { console.error('Cache delete failed', e); }
    }

    console.log('✅ CLEANUP COMPLETE. NOW LOADING APP...');
})();
