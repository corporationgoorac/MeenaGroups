// sw.js (Inside /billing/)

// Increment version to trigger immediate cache cleanup and refresh
const CACHE_NAME = 'billing-app-v2';

// Core assets located directly inside the 'billing' directory
const ASSETS_TO_CACHE = [
  './',
  './abc.html',
  './bill.html',
  './config.js',
  './dailyCheck.html',
  './icon.png',
  './inventory.html',
  './login.html',
  './manifest.json',
  './offer.html',
  './pending.html',
  './products.json',
  './today.html'
];

// 1. INSTALL EVENT: Pre-cache the App Shell
self.addEventListener('install', (event) => {
  console.log('[Billing Service Worker] Installing & Caching App Shell...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((error) => {
        console.error('[Billing Service Worker] Cache AddAll Failed:', error);
      })
  );
  // Force activate immediately without waiting for open tabs to close
  self.skipWaiting();
});

// 2. ACTIVATE EVENT: Clean up stale/outdated caches
self.addEventListener('activate', (event) => {
  console.log('[Billing Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Billing Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all open pages in scope immediately
  self.clients.claim();
});

// 3. FETCH EVENT: Network-First Strategy with Cache Fallback
self.addEventListener('fetch', (event) => {
  // Intercept only same-origin GET requests (skip non-GET and external Firestore/Firebase API calls)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Only update cache if network returns a valid 200 OK response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If network fails (offline), fall back to cache
        console.log('[Billing Service Worker] Network failed, serving from cache:', event.request.url);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If the user requested an HTML page while offline and it's not directly in cache, serve bill.html
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./bill.html');
          }
        });
      })
  );
});
