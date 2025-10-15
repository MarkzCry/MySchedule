const CACHE_NAME = 'dual-schedule-cache-v1';
// IMPORTANT: Removed '/' and '/index.html' from this list
const urlsToCache = [
  'styles.css',
  'script.js',
  'manifest.json',
  'logo.png'
];

// Install the service worker and cache all the app's assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercept fetch requests
self.addEventListener('fetch', event => {
  event.respondWith(
    // Try to find the response in the cache
    caches.match(event.request)
      .then(response => {
        // If the response is in the cache, return it
        if (response) {
          return response;
        }
        // If the response is not in the cache, fetch it from the network
        return fetch(event.request);
      })
  );
});
