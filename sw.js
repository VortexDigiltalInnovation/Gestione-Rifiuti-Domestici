// Service worker di Raccolta Smart: funzionamento offline e notifiche locali.
// La versione arriva dalla pagina (sw.js?v=X.Y.Z): cambiando APP_VERSION si crea una nuova cache.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `raccolta-smart-${VERSION}`;
const CONFIG_CACHE = 'rs-config';           // coda notifiche scritta dalla pagina
const LATE_WINDOW_MS = 5 * 60 * 60 * 1000;  // non mostrare avvisi più vecchi di 5 ore
const PRECACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

/* ---------- Installazione e cache ---------- */
self.addEventListener('install', event => {
  // Un file mancante non deve impedire l'installazione
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(PRECACHE.map(u => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
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
  if (new URL(req.url).origin !== self.location.origin) return; // Google, ecc.: direttamente in rete

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

/* ---------- Notifiche locali ---------- */
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

// Mostra le notifiche scadute (orario raggiunto) non ancora mostrate
async function showDueNotifications() {
  const queue = await readJSON('__queue.json', []);
  const shown = await readJSON('__shown.json', []);
  const now = Date.now();
  let changed = false;
  for (const n of queue) {
    if (n.fireAt <= now && now - n.fireAt < LATE_WINDOW_MS && !shown.includes(n.id)) {
      await self.registration.showNotification(n.title, {
        body: n.body,
        tag: `rs-${n.id}`,
        icon: new URL('icon-192.png', self.registration.scope).href,
        badge: new URL('icon-192.png', self.registration.scope).href,
        data: { url: './index.html' }
      });
      shown.push(n.id);
      changed = true;
    }
  }
  if (changed) await writeJSON('__shown.json', shown.slice(-60));
}

// I controlli vengono messi in coda uno alla volta: due controlli contemporanei non possono duplicare l'avviso
let checkChain = Promise.resolve();
const checkDue = () => (checkChain = checkChain.then(showDueNotifications, showDueNotifications));

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK') event.waitUntil(checkDue());
});

// Chrome (PWA installata): controllo periodico anche ad app chiusa, senza server
self.addEventListener('periodicsync', event => {
  if (event.tag === 'raccolta-check') event.waitUntil(checkDue());
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
