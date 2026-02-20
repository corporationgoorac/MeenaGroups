const CACHE_NAME = 'billing-app-v1';

// List of all files to cache for offline access (Relative to the billing folder!)
const ASSETS_TO_CACHE = [
    './',
    './bill.html',
    './manifest.json',
    './lax.jpg',
    '../config.js',
    '../icon.png',
    '../inventory.html'
];

// 1. INSTALL EVENT: Cache all essential files when the app is first installed
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Billing Service Worker] Caching App Shell...');
                // Using standard addAll for the files
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(error => {
                console.error('[Billing Service Worker] Cache AddAll Failed:', error);
            })
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// 2. ACTIVATE EVENT: Clean up any old caches if the CACHE_NAME gets updated
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Billing Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Claim control of all clients immediately
    self.clients.claim();
});

// 3. FETCH EVENT: Network-First strategy (Crucial for live business apps)
self.addEventListener('fetch', event => {
    // Only handle GET requests and requests to our own origin 
    // (We DO NOT want to cache live Firebase Database API calls)
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // If the network fetch is successful, return the latest network version
                // AND save a fresh copy to the cache in the background
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(() => {
                // If the network fails (OFFLINE), look for the file in the cache
                console.log('[Billing Service Worker] Network failed, serving from cache:', event.request.url);
                return caches.match(event.request);
            })
    );
});
