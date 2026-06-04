const CACHE_NAME = 'ems-pwa-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-icon.svg'
];

// Install Service Worker and cache critical files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(err => {
      console.warn('[ServiceWorker] Pre-cache failed, caching dynamically on run:', err);
    })
  );
  self.skipWaiting();
});

// Activate & clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker] Clearing old cache registry:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercept requests and respond
self.addEventListener('fetch', (event) => {
  // Let browser handle chrome-extension or external analytics request directly
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle local application assets with Cache-First strategy (ideal for cached PNG icons and static core assets)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Fallback to network fetch
      return fetch(event.request)
        .then((networkResponse) => {
          // Cache dynamic assets if active request has a successful status
          if (
            networkResponse && 
            networkResponse.status === 200 && 
            event.request.method === 'GET'
          ) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cacheCopy);
            });
          }
          return networkResponse;
        });
    }).catch(() => {
      // Fallback to cache index.html for SPA client-side route navigation when completely offline
      if (event.request.mode === 'navigate') {
        return caches.match('/');
      }
    })
  );
});
