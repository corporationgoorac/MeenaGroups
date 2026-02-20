// sw.js

// Name your cache based on the app and version. 
// When you update your app, change this to 'goorac-meena-v2' to force users to download the new files.
const CACHE_NAME = 'goorac-meena-v1';

// Add the core files you want to save to the user's device for offline use.
// You can add your CSS, JS, and image files here later.
const APP_SHELL = [
  '/',
  '/index.html',
  '/search.html',
  '/add-company.html',
  '/config.js',
  // '/style.css',  <-- uncomment and add your specific assets
  // '/logo.png'
];

// 1. INSTALL EVENT
// This triggers the first time the user visits the app. It downloads and caches the APP_SHELL.
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell');
      return cache.addAll(APP_SHELL);
    })
  );
  // Forces the waiting service worker to become the active service worker immediately.
  self.skipWaiting();
});

// 2. ACTIVATE EVENT
// This triggers when the service worker starts up. It's used to clean up old caches if you update the CACHE_NAME.
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing Old Cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Ensures the service worker takes control of the app immediately.
  self.clients.claim();
});

// 3. FETCH EVENT
// This triggers every time your app requests a file, image, or API call.
self.addEventListener('fetch', (event) => {
  // We only want to intercept standard GET requests (we don't want to cache Firestore POST/PUT requests)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return the cached file if we have it
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Otherwise, go to the network to get it
      return fetch(event.request).then((networkResponse) => {
        // Optional: You can dynamically cache new files here as they are fetched
        return networkResponse;
      }).catch(() => {
        // If both the cache and network fail (user is fully offline and file isn't cached),
        // you can return a custom offline.html page here if you build one.
        console.log('[Service Worker] Fetch failed; returning offline page instead.');
      });
    })
  );
});
