// sw.js

// 1. CACHE CONFIGURATION
// Main shell cache (bump version to force updates)
const CACHE_NAME = 'goorac-meena-v2';
// Dynamic cache for assets discovered at runtime
const DYNAMIC_CACHE_NAME = 'goorac-meena-dynamic-v2';

// 2. APP SHELL
// Using relative paths (./) since the app is hosted inside a subfolder (marketing)
const APP_SHELL = [
  './',
  './index.html',
  './abc.html',
  './add.html',
  './ask.html',
  './attandance.html',
  './companies.html',
  './config.js',
  './custombill.html',
  './dailyCheck.html',
  './delete.html',
  './icon.png',
  './inventory.html',
  './login.html',
  './makePayment.html',
  './manifest.json',
  './mrkting.html',
  './offer.html',
  './pending.html',
  './products.json',
  './search.html',
  './settings.html',
  './today.html'
];

// 3. INSTALL EVENT
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching App Shell');
        return cache.addAll(APP_SHELL);
      })
      .catch((error) => {
        console.error('[Service Worker] Pre-caching failed:', error);
      })
  );
  // Force active immediately
  self.skipWaiting();
});

// 4. ACTIVATE EVENT
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // Clear old caches that don't match the current standard or dynamic names
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE_NAME) {
            console.log('[Service Worker] Clearing Old Cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Take control of uncontrolled clients immediately
  self.clients.claim();
});

// 5. FETCH EVENT - Cache First Strategy with Dynamic Caching
self.addEventListener('fetch', (event) => {
  // Only intercept standard GET requests
  if (event.request.method !== 'GET') return;

  // Prevent errors from browser extensions or unsupported schemas (e.g., chrome-extension://)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Return the cached file if we have it
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // 2. Otherwise, fetch from the network
      return fetch(event.request).then((networkResponse) => {
        // Ensure we only dynamically cache valid, successful responses
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Clone the response because streams can only be consumed once
        const responseToCache = networkResponse.clone();

        // 3. Dynamically cache the new file for next time
        caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((error) => {
        // User is fully offline and the file isn't cached
        console.warn('[Service Worker] Fetch failed, user offline:', error);
        
        // Optional: If you ever create an 'offline.html', you can serve it here:
        // if (event.request.headers.get('accept').includes('text/html')) {
        //   return caches.match('./offline.html');
        // }
      });
    })
  );
});
