const CACHE_NAME = 'your-finances-mint-v1';

// Static resources to be ignored (bypass caching for Firebase)
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com'
];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Requirement: Network Bypass for Firebase domains
  if (BYPASS_HOSTS.some(host => url.hostname.includes(host))) {
    return event.respondWith(fetch(event.request));
  }

  // Requirement: Stale-While-Revalidate strategy for all other requests
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Fetch from network in the background
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // If valid response, cache it
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });

        // Return cached response instantly if available, otherwise return network fetch
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// Clean up old caches upon activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
});
