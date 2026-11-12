// Service worker di Raccolta Smart: cache offline, notifiche locali e Web Push.
// La versione arriva dalla pagina (sw.js?v=X.Y.Z): cambiando APP_VERSION in js/config.js
// si crea una nuova cache e gli utenti ricevono l'aggiornamento.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `raccolta-smart-${VERSION}`;
const CONFIG_CACHE = 'rs-config';           // coda notifiche scritta dalla pagina
const LATE_WINDOW_MS = 5 * 60 * 60 * 1000;  // non mostrare avvisi più vecchi di 5 ore
const PUSH_EARLY_MS = 2 * 60 * 1000;        // un push può arrivare pochi istanti prima dell'orario

const PRECACHE = [
  './', './index.html', './manifest.json',
  './css/app.css',
  './js/main.js', './js/config.js', './js/util.js', './js/state.js', './js/schedule.js',
  './js/calendar.js', './js/reminders.js',
  './js/views/dashboard.js', './js/views/schedule-view.js', './js/views/guide-view.js', './js/views/settings-view.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

/* ---------- Installazione e cache ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME && n !== CONFIG_CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google, server push, ecc.: direttamente in rete

  // Pagine: rete prima (aggiornamenti immediati), cache se offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Risorse statiche: cache prima
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});

/* ---------- Coda notifiche condivisa con la pagina ---------- */
const cacheKey = name => new URL(name, self.registration.scope).href;

async function readJSON(name, fallback) {
  const res = await (await caches.open(CONFIG_CACHE)).match(cacheKey(name));
  if (!res) return fallback;
  try { return await res.json(); } catch (e) { return fallback; }
}
async function writeJSON(name, data) {
  await (await caches.open(CONFIG_CACHE)).put(cacheKey(name),
    new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
}

// Stesso tag per la stessa sera: notifiche locali e push non si duplicano, la seconda sostituisce la prima
function show(n) {
  return self.registration.showNotification(n.title, {
    body: n.body,
    tag: `rs-${n.id}`,
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/icon-192.png', self.registration.scope).href,
    data: { url: './index.html' }
  });
}

// Mostra le notifiche scadute (orario raggiunto) non ancora mostrate
async function showDueNotifications() {
  const queue = await readJSON('__queue.json', []);
  const shown = await readJSON('__shown.json', []);
  const now = Date.now();
  let changed = false;
  for (const n of queue) {
    if (n.fireAt <= now && now - n.fireAt < LATE_WINDOW_MS && !shown.includes(n.id)) {
      await show(n);
      shown.push(n.id);
      changed = true;
    }
  }
  if (changed) await writeJSON('__shown.json', shown.slice(-60));
}

// Push dal server (anche ad app chiusa): il messaggio è vuoto, il contenuto viene dalla coda locale.
// Va sempre mostrata una notifica, altrimenti il browser ne mostra una generica.
async function handlePush() {
  const queue = await readJSON('__queue.json', []);
  const now = Date.now();
  const due = queue
    .filter(n => n.fireAt <= now + PUSH_EARLY_MS && now - n.fireAt < LATE_WINDOW_MS)
    .sort((a, b) => b.fireAt - a.fireAt)[0];
  await show(due || {
    id: 'generic',
    title: '♻️ Raccolta Smart',
    body: 'Controlla quali rifiuti esporre per domani.'
  });
  if (due) {
    const shown = await readJSON('__shown.json', []);
    if (!shown.includes(due.id)) { shown.push(due.id); await writeJSON('__shown.json', shown.slice(-60)); }
  }
}

self.addEventListener('push', event => event.waitUntil(handlePush()));

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK') event.waitUntil(showDueNotifications());
});

// Chrome (PWA installata): controllo periodico anche ad app chiusa, senza server
self.addEventListener('periodicsync', event => {
  if (event.tag === 'raccolta-check') event.waitUntil(showDueNotifications());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});
