const CACHE_NAME = 'garuto-pwa-v7.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './index.css?v=G36',
  './app_v3.js?v=G36',
  './manifest.json',
  './nut.png',
  './icon-192x192.jpg',
  './icon-512x512.jpg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Instalación: Cachear activos estáticos
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando activos...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activación: Limpiar caches antiguos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[SW] Borrando cache antiguo:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Estrategia de Fetch: Stale-While-Revalidate (Excepto para API)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 1. La API siempre a la red (sin cache)
  if (url.pathname.includes('api.php') || e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }

  // 2. Activos estáticos: Stale-While-Revalidate
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cacheCopy));
        }
        return networkResponse;
      }).catch(() => {
          // Si falla la red y no hay cache, podriamos devolver un fallback
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Manejo de Notificaciones
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const urlToOpen = (e.notification.data && e.notification.data.url) ? e.notification.data.url : self.location.origin;
  
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
