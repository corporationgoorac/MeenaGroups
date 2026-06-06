const CACHE_NAME = 'meena-soundbox-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './soundbox.html',
  './manifest.json',
  './icon.png',
  './config.js'
];

// 1. INSTALL EVENT: Force immediate activation and cache vital shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching application core...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Forces the waiting service worker to become the active service worker
});

// 2. ACTIVATE EVENT: Clean up older cache iterations and claim active clients instantly
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Purging legacy cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all open pages immediately
});

// 3. FETCH EVENT: Network-First strategy with immediate fallback to cache 
// Ensures the application loads completely offline while fetching live audio API streams dynamically
self.addEventListener('fetch', (event) => {
  // Explicitly ignore Firebase Firestore synchronization channels and authentication endpoints from being cached
  if (
    event.request.url.includes('firestore.googleapis.com') || 
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('firebase')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If valid response, return it directly
        if (response && response.status === 200) {
          return response;
        }
        return response;
      })
      .catch(() => {
        // Fallback directly to persistent cache if network drops mid-stream
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback placeholder for generic asset requests if completely severed
          return new Response('Network connection disrupted.', { status: 408, headers: { 'Content-Type': 'text/plain' } });
        });
      })
  );
});

// 4. BACKGROUND SYNC/PUSH EVENT (Optional Integration Pathway)
// Wakes up the worker immediately when a background cloud notification or data sync ping lands
self.addEventListener('push', (event) => {
  let payload = { title: 'Meena Soundbox', body: 'New live event received.' };
  
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: 'icon.png',
    badge: 'icon.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'open', title: 'Open Soundbox' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options).then(() => {
      // Broadcast messaging channel to awaken or pass data back to soundbox.html if running in background
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({
            type: 'BACKGROUND_SYNC_TRIGGER',
            payload: payload
          });
        });
      });
    })
  );
});

// Handle interaction when user clicks the background synchronization alert
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // If an instance of the soundbox app is already open, focus it immediately
        for (const client of clientList) {
          if (client.url.includes('soundbox.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // If completely closed, launch a fresh instance natively
        if (self.clients.openWindow) {
          return self.clients.openWindow('./soundbox.html');
        }
      })
    );
  }
});
