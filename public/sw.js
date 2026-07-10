const CACHE_NAME = 'taskflow-app-shell-v1';
const PRE_CACHE_ASSETS = [
  './',
  './index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRE_CACHE_ASSETS).catch((err) => {
        console.warn('Pre-cache warning during install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // We only cache GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Do not cache API routes or Firebase endpoints in browser Cache Storage
  if (
    url.pathname.startsWith('/api') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase')
  ) {
    return;
  }

  // For SPA client-side navigations, serve index.html if offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('./') || caches.match('./index.html') || caches.match('/') || caches.match('/index.html');
      })
    );
    return;
  }

  // Network First, Falling Back to Cache strategy
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses from our own domain
        if (response && response.status === 200 && (url.origin === self.location.origin)) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
