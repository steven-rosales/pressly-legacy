self.addEventListener('install', () => {
  // Replace any previously-registered service worker immediately.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clear any existing caches from older service workers.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// Intentionally do not intercept requests. This service worker exists only to
// safely replace older buggy versions (e.g., ones attempting to cache POST).
self.addEventListener('fetch', () => {
  // no-op
});
