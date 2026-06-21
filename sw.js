/* =========================================================
   LA SÚPER LIGA — Service Worker
   Cachea el "app shell" (HTML/CSS/JS/manifest) y permite
   actualizaciones automáticas controladas desde la app.
   ========================================================= */

const CACHE_VERSION = 'v3';
const CACHE_NAME = `super-liga-${CACHE_VERSION}`;

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css?v=3',
  '/script.js?v=3',
  '/manifest.json'
];

/* ---- INSTALL: precachea el app shell ----
   OJO: a propósito NO llamamos a self.skipWaiting() acá.
   Si lo hiciéramos, un Service Worker nuevo tomaría el control
   de golpe mientras el usuario sigue usando la versión vieja de
   la página, lo que puede romper cosas a mitad de sesión.
   En cambio, dejamos que el SW nuevo quede "esperando" hasta que
   la propia app confirme la actualización (ver mensaje SKIP_WAITING
   más abajo, disparado desde mostrarCartelActualizacion() en script.js). */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .catch((err) => console.warn('[SW] No se pudo precachear todo:', err))
  );
});

/* ---- ACTIVATE: borra cachés de versiones anteriores ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---- MESSAGE: la app pide activar el SW en espera ---- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---- FETCH: network-first para nuestros propios archivos ----
   Siempre intenta traer la versión más nueva desde la red.
   Si no hay internet, usa lo último que haya en caché (modo offline).
   IMPORTANTE: solo intercepta pedidos del MISMO ORIGEN. Las llamadas
   a Supabase (u otras APIs externas) pasan de largo sin tocarlas,
   para no afectar nunca los datos en vivo de la liga. */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

/* =========================================================
   PUSH NOTIFICATIONS (Web Push / VAPID)
   ⚠️ RECONSTRUIDO — no tenía tu sw.js original, así que armé esto
   en base a lo que tu script.js ya espera recibir (mensaje tipo
   'lsl-push' para la Isla Dinámica). Si tu sw.js actual en Vercel
   maneja el push de otra forma, pasámelo y lo fusiono para no
   perder nada de tu lógica actual.
   ========================================================= */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'La Súper Liga', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'La Súper Liga';
  const options = {
    body: data.body || '',
    icon: data.icon || '/logo.png',
    badge: '/logo.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: 'window' }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({ type: 'lsl-push', title, body: options.body });
        });
      })
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
