const CACHE_NAME = 'garuto-kill-cache-v3';

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        return caches.delete(key); // DELETE EVERY SINGLE CACHE
      }));
    }).then(() => {
      return self.clients.claim(); // Take control of all open pages immediately
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Always go to the network. Never read from cache.
  // This completely breaks all PWA caching deadlocks.
  const url = new URL(e.request.url);
  
  // Try to append a timestamp to force the browser to invalidate its own HTTP cache
  if (e.request.method === 'GET' && !url.pathname.includes('api.php') && url.origin === self.location.origin) {
    url.searchParams.set('cachekill', Date.now());
    e.respondWith(fetch(url).catch(() => fetch(e.request)));
  } else {
    e.respondWith(fetch(e.request));
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === e.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(e.notification.data.url);
      }
    })
  );
});
