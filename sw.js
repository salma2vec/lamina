/* Offline support: network first, falling back to the cache. Same-origin only. */
const CACHE = 'lamina-0.1.0-studio';
const CORE = [
  './', 'index.html', 'styles/app.css', 'styles/print.css', 'assets/favicon.svg', 'src/main.js',
  'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/addons/OrbitControls.js', 'vendor/utif/utif.js',
  'workers/synthetic-worker.js', 'workers/volume-worker.js', 'workers/surface-worker.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
