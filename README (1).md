# Raccolta Smart v5.0.0

PWA per ricordare i rifiuti da esporre. Funziona offline, senza build: basta pubblicare la cartella su un host **https** (es. GitHub Pages).

## Struttura
- `index.html` – struttura della pagina
- `css/app.css` – stile
- `js/config.js` – versione (`APP_VERSION`), tipi predefiniti, costanti
- `js/state.js`, `js/schedule.js`, `js/util.js` – stato, logica dei ritiri, utilità
- `js/calendar.js` – eventi, file .ics, Google Calendar
- `js/reminders.js` – notifiche locali e Web Push
- `js/views/` – le quattro schede
- `sw.js` – cache offline, notifiche, push
- `worker/` – server push (Cloudflare Worker) per le notifiche ad app chiusa: vedi `worker/README.md`

## Nuova versione
Cambia `APP_VERSION` in `js/config.js`: aggiorna anche la cache del service worker e il badge accanto al logo.
