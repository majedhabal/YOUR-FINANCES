/**
 * Vantage AI Wallet - Service Worker File
 * Scope Identity: com.mevantage.analytics
 *
 * This Service Worker ensures full offline capability utilizing a "Network-First,
 * Falling Back to Cache" caching strategy to prevent stale balances. It also hosts
 * native push message listening and click-through deep-link deep-routing.
 */

// Define Cache Constants for Version Management
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `com.mevantage.analytics-cache-${CACHE_VERSION}`;

// Pre-cached Critical Assets
const STATIC_FALLBACK_RESOURCES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

// Service Worker Install Event
self.addEventListener('install', (event) => {
  // Force active state immediately on discovery
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching Core Shell Assets...');
      return cache.addAll(STATIC_FALLBACK_RESOURCES);
    })
  );
});

// Service Worker Activation Event (Cleans up previous cache versions)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((allCaches) => {
      return Promise.all(
        allCaches.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Evicting deprecated cache payload:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // Force active client claim instantly to prevent idle state
      return self.clients.claim();
    })
  );
});

// Network-First Fetch Handler
self.addEventListener('fetch', (event) => {
  // Only intercepts same-origin GET requests to allow native routing of live APIs
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Exempt hot dynamic API endpoints from standard service worker asset caching
  if (event.request.url.includes('/api/') || event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If network returns a valid and healthy response, cache a clone of it
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If network request failed (offline / bad connection), safely fallback to cache
        console.log('[Service Worker] Terminal Offline. Loading Resource From Cache:', event.request.url);
        return caches.match(event.request);
      })
  );
});

// Native Push Event Interpreter - Keep temporary wake-lock open using event.waitUntil
self.addEventListener('push', (event) => {
  let payload = {};
  
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      // Direct text string parsing context fallback
      payload = {
        title: 'Vantage AI Alert',
        body: event.data.text()
      };
    }
  }

  const title = payload.title || 'Vantage AI Alert';
  const body = payload.body || 'New transaction activities detected in your daily budget ledger.';
  const tag = 'vantage-alert-sync';
  const icon = '/icons/Vantage-Wallet-Logo-192x192.png';
  const badge = '/icons/Vantage-Wallet-Logo-192x192.png';

  const promiseChain = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((allClients) => {
      const activeFocusedClientExists = allClients.some(client => client.focused);

      if (activeFocusedClientExists) {
        // App is in foreground: Update the bell badge count quietly (+1) instead of firing banner
        allClients.forEach((client) => {
          client.postMessage({
            type: 'VANTAGE_FOREGROUND_ALERT',
            payload: { title, body, tag }
          });
        });
        console.log('[Service Worker] Foreground focus active. Dispatched quiet badge increment message to main application.');
        return Promise.resolve();
      } else {
        // Closed/background state: Display native OS lock-screen notification banner
        const notificationOptions = {
          body: body,
          icon: icon,
          badge: badge,
          tag: tag,
          renotify: true,
          vibrate: [150, 100, 150],
          data: {
            url: '/?openDispatch=true'
          }
        };
        return self.registration.showNotification(title, notificationOptions);
      }
    });

  event.waitUntil(promiseChain);
});

// Notification Click Lock Screen Gateway - Instantly re-instantiate or focus onto the Vantage Dispatch notification log drawer
self.addEventListener('notificationclick', (event) => {
  // Instantly close the notification banner
  event.notification.close();

  const targetRedirectUrl = new URL('/?openDispatch=true', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((allClients) => {
      // Case 1: If there is an existing client window, navigate and focus it
      for (const client of allClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetRedirectUrl).then((navigatedClient) => {
              if (navigatedClient && 'focus' in navigatedClient) {
                return navigatedClient.focus();
              }
            });
          }
          return client.focus();
        }
      }
      
      // Case 2: Under fully closed state, open a fresh window pointing to the lock screen gateway parameters
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetRedirectUrl);
      }
    })
  );
});

// PWA HOMESCREEN WIDGET OPERATIONS & INTERACTION REGISTRY
async function updateWidgetInstanceById(instanceId) {
  try {
    const templateResponse = await fetch('/widgets/quick-add-ac.json');
    if (!templateResponse.ok) {
      throw new Error(`Failed to load widget template: ${templateResponse.statusText}`);
    }
    const template = await templateResponse.text();

    let data;
    try {
      const cache = await caches.open('vantage-widget-cache');
      const cachedResponse = await cache.match('/api/pwa-widget-choices');
      if (cachedResponse) {
        data = await cachedResponse.json();
      } else {
        const defaultDataRes = await fetch('/widgets/quick-add-data.json');
        data = await defaultDataRes.json();
      }
    } catch (e) {
      console.warn('[Service Worker] Failed reading widget choices from cache, using default fallback:', e);
      try {
        const defaultDataRes = await fetch('/widgets/quick-add-data.json');
        data = await defaultDataRes.json();
      } catch (errJson) {
        data = { defaultWidgetId: "none", choices: [{ title: "Configure in Vantage App first", value: "none" }] };
      }
    }

    if (self.widgets && self.widgets.updateByInstanceId) {
      await self.widgets.updateByInstanceId(instanceId, {
        template,
        data: JSON.stringify(data)
      });
      console.log(`[Service Worker] Widget instance ${instanceId} updated successfully.`);
    } else {
      console.warn('[Service Worker] self.widgets.updateByInstanceId is unsupported in this browser user agent environment.');
    }
  } catch (err) {
    console.error('[Service Worker] Severe failure updating widget instance:', err);
  }
}

async function handleWidgetClick(event) {
  const { action, data, instanceId } = event;
  
  if (action === 'log_outflow') {
    const widgetId = data.selectedWidgetId;
    const amount = parseFloat(data.amount);
    
    if (!widgetId || widgetId === 'none') {
      try {
        await self.registration.showNotification("Vantage Widget Warning", {
          body: "Please link at least one envelope to starting widgets in the Vantage App settings."
        });
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      try {
        await self.registration.showNotification("Vantage Widget Warning", {
          body: "Please specify a numeric transaction value greater than 0 AED."
        });
      } catch (err) {
        console.error(err);
      }
      return;
    }

    try {
      const cache = await caches.open('vantage-widget-cache');
      const tokenResponse = await cache.match('/api/pwa-token');
      if (!tokenResponse) {
        await self.registration.showNotification("Security Protocol Pending", {
          body: "Please launch the Vantage Wallet app to re-verify identity credentials."
        });
        return;
      }
      const token = await tokenResponse.text();

      const response = await fetch('/api/widget/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ widgetId, amount })
      });

      if (response.ok) {
        await self.registration.showNotification("Vantage Ledger Confirmed", {
          body: `Successfully recorded outflow of AED ${amount.toFixed(2)}!`
        });

        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        allClients.forEach((client) => {
          client.postMessage({
            type: 'VANTAGE_WIDGET_TRANS_SUCCESS',
            payload: { widgetId, amount }
          });
        });

        await updateWidgetInstanceById(instanceId);
      } else {
        const errJson = await response.json().catch(() => ({}));
        await self.registration.showNotification("Ledger Log Error", {
          body: errJson.message || "Failed to finalize transactions. Check your envelope limits."
        });
      }
    } catch (err) {
      console.error('[Service Worker] Failed completing widget click handler:', err);
      await self.registration.showNotification("Integration Protocol Offline", {
        body: "Unable to reach Vantage server. Checking local backups..."
      });
    }
  }
}

self.addEventListener('widgetinstall', (event) => {
  event.waitUntil(updateWidgetInstanceById(event.instanceId));
});

self.addEventListener('widgetuninstall', (event) => {
  console.log('[Service Worker] Widget uninstalled:', event.instanceId);
});

self.addEventListener('widgetclick', (event) => {
  event.waitUntil(handleWidgetClick(event));
});
