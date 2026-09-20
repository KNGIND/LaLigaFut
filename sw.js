/* La Súper Liga · Service Worker
   Objetivo: que la segunda visita cargue al instante (y funcione sin señal).
   - Archivos propios: "stale-while-revalidate" (muestra lo guardado y actualiza por detrás).
   - data.js: primero red, y si no hay señal usa lo guardado.
   Al cambiar archivos de la app, subí el número de VERSION para forzar la limpieza. */
const VERSION = 'lsl-v1';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/config.js', 'js/store.js', 'js/ui.js', 'js/app.js', 'data/data.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;         // Supabase y otros: siempre a la red
  if (url.pathname.endsWith('/data/data.js')) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
