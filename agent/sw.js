// Simple Service Worker to allow installation
self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request));
});
