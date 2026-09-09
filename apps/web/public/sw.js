const CACHE = 'cycletracker-shell-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/icon.svg']))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return response; }).catch(() => caches.match('/')));
  else if (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg') event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { if (response.ok) caches.open(CACHE).then(c => c.put(event.request, response.clone())); return response; })));
});
self.addEventListener('push', event => {
  const message = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(message.title || 'A routine item is due', { body: message.body || 'Open CycleTracker to review your routine.', icon: '/icon.svg', tag: message.tag || 'routine', data: { url: '/' } }));
});
self.addEventListener('notificationclick', event => { event.notification.close(); event.waitUntil(clients.openWindow('/')); });
