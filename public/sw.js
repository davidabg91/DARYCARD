// 🛡️ Kill-Switch Service Worker
// This script exists to immediately unregister any old service workers
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        self.registration.unregister()
            .then(() => self.clients.matchAll())
            .then((clients) => {
                clients.forEach((client) => {
                    if (client.url && 'navigate' in client) {
                        client.navigate(client.url);
                    }
                });
            })
    );
});
