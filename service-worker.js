/* service-worker.js — funcionamiento sin conexión.
   Estrategia: red primero (siempre intenta traer lo más nuevo, incluido data.json) y, si no hay
   conexión, usa la copia guardada. Las respuestas servidas desde caché llevan el encabezado
   X-From-Cache: 1 para que la app avise que usa una versión almacenada.
   Cambia CACHE_VERSION cuando publiques cambios de código para que los celulares se actualicen. */
const CACHE_VERSION = 'v2';
const CACHE = 'orden-farmaceutico-' + CACHE_VERSION;
const PRECACHE = [
  './', 'index.html', 'styles.css', 'app.js', 'pos.js', 'search.js', 'scanner.js',
  'import-excel.html', 'import-excel.js', 'import-ui.js', 'data.json', 'manifest.json',
  'icon-192.png', 'icon-512.png',
  'zxing-library-0.21.3.min.js', 'xlsx-0.18.5.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) =>
      fetch(new Request(u, { cache: 'reload' })).then((r) => { if (r.ok) return c.put(u, r); }).catch(() => {})
    )))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('orden-farmaceutico-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

function markFromCache(resp) {
  const h = new Headers(resp.headers);
  h.set('X-From-Cache', '1');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await fetch(req, { cache: 'no-cache' });
      if (net.ok) cache.put(req, net.clone());
      return net;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return markFromCache(hit);
      if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return markFromCache(idx); }
      throw err;
    }
  })());
});
