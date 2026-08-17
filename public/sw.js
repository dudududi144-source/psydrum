// PSYDRUM service worker — offline cache for the PWA.
const CACHE = 'psydrum-cache-v1'
const ASSETS = [
  './',
  './index.html',
  './psydrum.js',
  './manifest.json',
  './icon.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // network-first for the app shell, fall back to cache when offline
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const copy = resp.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy))
        return resp
      })
      .catch(() => caches.match(event.request))
  )
})
