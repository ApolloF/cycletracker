// Build replaces these constants with the complete, content-versioned app shell.
const CACHE = 'cycletracker-shell-__BUILD_ID__';
const SHELL = __SHELL_FILES__;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('cycletracker-shell-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') event.respondWith(caches.open(CACHE).then(cache => cache.match('/')).then(cached => cached || fetch(event.request)));
  else if (SHELL.includes(url.pathname)) event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(cached => cached || fetch(event.request)));
});
self.addEventListener('push', event => {
  const message = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(message.title || 'A routine item is due', { body: message.body || 'Open CycleTracker to review your routine.', icon: '/icon.svg', tag: message.tag || 'routine', data: { url: '/' } }));
});
self.addEventListener('notificationclick', event => { event.notification.close(); event.waitUntil(clients.openWindow('/')); });
