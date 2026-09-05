// sw.js (Inside /logbook/)

// 1. CACHE CONFIGURATION
// Bumped from v23 to v24 to force an update
const CACHE_NAME = 'meena-logbook-v24';
const DYNAMIC_CACHE_NAME = 'meena-logbook-dynamic-v24';

// 2. APP SHELL
// Added all missing frontend files from the logbook directory
const ASSETS_TO_CACHE = [
  './',
  './icon.png',
  './index.html',
  './login.html',
  './manifest.json',
  './reports.html',
  './settings.html'
];

// 3. INSTALL EVENT
self.addEventListener('install', (event) => {
  console.log('[Logbook SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Logbook SW] Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE); 
    })
  );
  self.skipWaiting();
});

// 4. ACTIVATE EVENT
self.addEventListener('activate', (event) => {
  console.log('[Logbook SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[Logbook SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 5. FETCH EVENT
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests and external API requests (like Firebase)[span_2](start_span)[span_2](end_span)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        console.warn('[Logbook SW] Network failed, file not cached:', event.request.url);
      });
    })
  );
});
