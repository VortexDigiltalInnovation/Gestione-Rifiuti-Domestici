self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.text() : 'Promemoria spazzatura';
  e.waitUntil(
    self.registration.showNotification('EcoFlow Trash Manager 🗑️', {
      body: data,
      icon: 'icon-192.png',
      badge: 'icon-192.png'
    })
  );
});
