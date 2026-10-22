/*
 * sw.js — service worker for offline use.
 *
 * Caches the app shell on install and serves it cache-first, refreshing the
 * cache in the background when online. Bump CACHE_VERSION whenever you change
 * any file so phones pick up the new version.
 */
const CACHE_VERSION = 'ktst-v2';

const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/data/killTeams.js',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Remove caches from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer from cache instantly, update it from the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(request, { ignoreSearch: true })
        // Any page URL gets the app (mirrors the GitHub Pages 404.html fallback offline).
        .then((hit) => hit || (request.mode === 'navigate' ? cache.match('./index.html') : undefined))
        .then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
    )
  );
});
