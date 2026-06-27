const CACHE_NAME = 'your-finances-mint-v2';

// Core static assets to pre-cache for instant offline availability
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Hosts to bypass caching entirely (e.g., Firebase Auth/Database servers)
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'googleapis.com'
];

// Install Event: Cache critical shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Vantage SW] Pre-caching core shell assets');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Vantage SW] Pre-cache warning: some files could not be pre-cached', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => {
          console.log('[Vantage SW] Removing legacy cache:', name);
          return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Only intercept and cache HTTP/HTTPS GET requests
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. Bypass caching for real-time Firebase Auth and Database endpoints
  if (BYPASS_HOSTS.some(host => url.hostname.includes(host))) {
    return event.respondWith(fetch(event.request));
  }

  // 3. Bypass caching for our dynamic /api/* endpoints (AI, receipt processing, real-time sync)
  if (url.pathname.startsWith('/api/')) {
    return event.respondWith(fetch(event.request));
  }

  // 4. Stale-While-Revalidate caching strategy for static pages, styles, scripts, and media assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Run network fetch in the background to refresh cache silently
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[Vantage SW] Network fetch failed, relying on cache:', err);
        });

        // Return cached resource immediately if exists; otherwise wait for network
        return cachedResponse || fetchPromise;
      });
    })
  );
});
