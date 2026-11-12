# Server push di Raccolta Smart (Cloudflare Worker)

Serve per ricevere le notifiche **anche con l'app chiusa**. È gratuito (piano Free di Cloudflare) e si configura una volta sola, in circa 10 minuti.

## Come funziona
L'app invia al Worker la sottoscrizione push del tuo dispositivo e gli orari delle notifiche. Ogni minuto il Worker controlla se è arrivata l'ora e manda un push (vuoto) al browser: il service worker dell'app si sveglia e mostra la notifica con i rifiuti da esporre. Il contenuto resta sul tuo dispositivo.

## Requisiti
- Un account Cloudflare gratuito e Node.js 18+ sul computer.
- L'app pubblicata su un indirizzo **https** (es. GitHub Pages).
- Su iPhone/iPad (iOS 16.4+): l'app va prima aggiunta alla schermata Home.

## Installazione
Dalla cartella `worker/`:

1. Accedi a Cloudflare: `npx wrangler login`
2. Crea l'archivio KV: `npx wrangler kv namespace create PUSH_KV`
   Copia l'`id` mostrato in `wrangler.toml` (campo `id` sotto `[[kv_namespaces]]`).
3. In `wrangler.toml` sostituisci `TUA-EMAIL@esempio.it` con la tua email.
   Facoltativo: imposta `ALLOWED_ORIGIN` con l'indirizzo dell'app.
4. Genera le chiavi: `node generate-keys.mjs`, ed esegui i tre comandi `wrangler secret put ...` che stampa.
5. Pubblica: `npx wrangler deploy`
   Wrangler mostra l'indirizzo del Worker, tipo `https://raccolta-smart-push.tuonome.workers.dev`.

## Nell'app
Impostazioni → Promemoria → «Notifiche anche ad app chiusa»:
1. Incolla l'indirizzo del Worker e il token (il valore di `APP_TOKEN`).
2. Attiva l'interruttore e consenti le notifiche.

Ripeti l'attivazione su ogni dispositivo che deve ricevere gli avvisi (fino a 20).

## Note
- Gli orari vengono aggiornati sul Worker ogni volta che modifichi orari, tipi o orario del promemoria, e ogni volta che apri l'app. Sono pianificati 8 settimane in avanti: apri l'app almeno una volta ogni due mesi.
- Per cambiare l'orario basta modificarlo nell'app.
- Per disattivare: spegni l'interruttore nell'app (la sottoscrizione viene rimossa dal Worker).
