self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.text() : 'Promemoria raccolta domestica';
  e.waitUntil(
    self.registration.showNotification('Raccolta Smart ♻️', {
      body: data,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [200, 100, 200]
    })
  );
});
