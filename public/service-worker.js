const CACHE_NAME = 'your-finances-mint-v0.1.0';

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

  // 3. Bypass caching for our dynamic /api/* endpoints
  if (url.pathname.startsWith('/api/')) {
    return event.respondWith(fetch(event.request));
  }

  // 4. Navigation Requests: Network-First strategy
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the latest response (e.g., index.html)
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request) || caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  // 5. Other requests: Stale-While-Revalidate caching strategy
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[Vantage SW] Network fetch failed, relying on cache:', err);
        });

        return cachedResponse || fetchPromise;
      });
    })
  );
});

// Push Notification Event: Handle incoming push messages
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Your Finances', body: event.data.text() };
    }
  }

  const title = data.title || 'Your Finances';
  const options = {
    body: data.body || 'You have a new update.',
    icon: '/icons/Your_Finances_Logo_No_BG.png',
    badge: '/icons/Your_Finances_Logo_No_BG.png',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Event: Handle user interaction
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Background Sync Event: Handle deferred tasks
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(
      // Implement your logic to sync transactions when online
      console.log('[Vantage SW] Background sync triggered:', event.tag)
    );
  }
});
