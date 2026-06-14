const CACHE_NAME = 'superliga-cache-v1';
const RUNTIME_CACHE = 'superliga-runtime-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/sw.js',
  '/manifest.json'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(ASSETS).catch(() => {
          // Si falla, al menos cachea los archivos estáticos disponibles
          return Promise.resolve();
        });
      })
    ]).then(() => self.skipWaiting())
  );
});

// Limpiar caches antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia: Cache first, network fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones no-GET
  if (request.method !== 'GET') {
    return;
  }

  // APIs y recursos externos: Network first
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return caches.match(request);
          }
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Archivos locales: Cache first
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then(response => {
            if (!response || response.status !== 200) {
              return response;
            }
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
            return response;
          })
          .catch(() => {
            // Fallback offline
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Background sync (opcional para futuras funcionalidades)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  try {
    const response = await fetch('/api/data');
    return response.json();
  } catch (error) {
    console.error('Sync failed:', error);
  }
}
/* ============================================================
   LA SÚPER LIGA — Service Worker
   Archivo estático en /sw.js (no Blob) para que las
   notificaciones push funcionen aunque la app esté cerrada.
   ============================================================ */
const CACHE = 'lsl-v1';
const PAGE = self.registration.scope;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([PAGE]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.status === 200) {
          const rc = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, rc));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match(PAGE)))
  );
});

/* ── Notificaciones push (funcionan con la app cerrada) ── */
self.addEventListener('push', e => {
  let d = { title: 'La Súper Liga', body: 'Nueva notificación' };
  try { if (e.data) d = e.data.json(); } catch (err) {}

  const options = {
    body: d.body || '',
    icon: d.icon || '/logo.png',
    badge: d.badge || '/logo.png',
    vibrate: [200, 100, 200],
    data: d.data || {},
    tag: d.tag || undefined,
    renotify: !!d.tag,
  };

  e.waitUntil(self.registration.showNotification(d.title || 'La Súper Liga', options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || PAGE;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

/* Si el navegador renueva la suscripción sola, la re-mandamos al backend */
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription ? e.oldSubscription.options : { userVisibleOnly: true })
      .then(sub => fetch('/api/save-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub })
      }))
      .catch(() => {})
  );
});
