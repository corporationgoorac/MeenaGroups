// sw.js - Service Worker for Meena Wallets

const CACHE_NAME = 'meena-wallets-cache-v1';

// The files we want to save to the user's phone for offline use
const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './config.js',
  './manifest.json',
  './icon.png'
];

// 1. Install Event - Caches the app shell
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell');
      return cache.addAll(APP_SHELL);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// 2. Activate Event - Cleans up old caches when you update the app
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all open pages immediately
  self.clients.claim();
});

// 3. Fetch Event - Intercepts network requests
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    // Network-First Strategy: Try to get fresh code from the internet first
    fetch(event.request)
      .then((networkResponse) => {
        // If we get a valid response, open the cache and update it
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If the internet is down (fetch fails), serve the file from the local cache
        console.log('[Service Worker] Offline, serving from cache:', event.request.url);
        return caches.match(event.request);
      })
  );
});
