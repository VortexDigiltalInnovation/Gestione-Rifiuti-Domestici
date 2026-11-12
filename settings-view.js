// Scheda Impostazioni: promemoria (notifiche + push), Google Calendar, dati.
import { APP_VERSION, KEYS, REMINDER_OPTIONS } from '../config.js';
import { state, saveSettings, touch } from '../state.js';
import { $, askConfirm, esc, lsRemove, pad, toast } from '../util.js';
import {
    buildICS, buildEventGroups, calendarTemplateUrl, downloadICS, markCalendarDirty,
    removeGoogleEvents, resetGoogleSession, syncGoogleCalendar
} from '../calendar.js';
import {
    disableNotifications, disablePush, enableNotifications, enablePush, getPushError,
    notifGranted, notifSupported, pushConfigured, pushSupported, sendTestNotification, wipeReminders
} from '../reminders.js';
import { dayById } from '../config.js';

const { settings } = state;

function notifStatus() {
    if (!notifSupported()) return 'Questo browser non supporta le notifiche.';
    if (Notification.permission === 'denied') return 'Notifiche bloccate: abilitale dalle impostazioni del browser o del sistema.';
    if (settings.notifEnabled && notifGranted()) return `Attive: avviso alle ${settings.notifTime} la sera prima di ogni ritiro.`;
    return 'Disattivate.';
}

function pushStatus() {
    if (!pushSupported()) return 'Web Push non supportato da questo browser (su iPhone installa prima l\'app dalla schermata Home).';
    if (settings.pushEnabled) {
        const err = getPushError();
        if (err) return `⚠️ ${err}`;
        const when = settings.pushLastSync ? new Date(settings.pushLastSync).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
        return `Attive anche ad app chiusa${when ? ` · ultimo aggiornamento ${when}` : ''}.`;
    }
    return pushConfigured() ? 'Pronte: attiva l\'interruttore.' : 'Inserisci l\'indirizzo del tuo server push per attivarle.';
}

export function renderSettings() {
    const lastSync = settings.gcalLastSync ? new Date(settings.gcalLastSync).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const origin = location.protocol.startsWith('http') ? location.origin : "(apri l'app da un indirizzo https://)";
    const notifOn = settings.notifEnabled && notifGranted();
    const validClientId = /\.apps\.googleusercontent\.com$/.test(settings.gcalClientId);

    $('settingsBody').innerHTML = `
        <div class="card">
            <h3 class="card-title"><span aria-hidden="true">🔔</span> Promemoria</h3>
            <div>
                <label class="lbl" for="notifTime">Orario della sera (notifiche ed eventi Calendar)</label>
                <input type="time" id="notifTime" value="${esc(settings.notifTime)}" data-change="setNotifTime">
            </div>
            <div class="row between">
                <label for="notifToggle" class="grow strong" style="font-size:.9rem">Avvisami la sera prima</label>
                <span class="switch"><input type="checkbox" id="notifToggle" ${notifOn ? 'checked' : ''} data-change="toggleNotif"><span class="track"></span></span>
            </div>
            <p class="muted">${esc(notifStatus())}</p>
            <button class="btn btn-ghost btn-block" data-action="sendTest">Invia notifica di prova</button>

            <details ${settings.pushEnabled || pushConfigured() ? 'open' : ''}>
                <summary>Notifiche anche ad app chiusa</summary>
                <div class="stack">
                    <p class="muted">Un piccolo server gratuito (Cloudflare Worker) invia un push all'orario scelto, anche con l'app chiusa. Segui la guida in <code>worker/README.md</code> per attivarlo, poi inserisci qui i dati.</p>
                    <div>
                        <label class="lbl" for="pushUrl">Indirizzo del server push</label>
                        <input type="text" id="pushUrl" value="${esc(settings.pushUrl)}" placeholder="https://raccolta-smart-push.tuonome.workers.dev" autocomplete="off" autocapitalize="off" spellcheck="false" data-change="setPushUrl">
                    </div>
                    <div>
                        <label class="lbl" for="pushToken">Token di accesso</label>
                        <input type="text" id="pushToken" value="${esc(settings.pushToken)}" placeholder="Il valore di APP_TOKEN" autocomplete="off" autocapitalize="off" spellcheck="false" data-change="setPushToken">
                    </div>
                    <div class="row between">
                        <label for="pushToggle" class="grow strong" style="font-size:.9rem">Attiva notifiche ad app chiusa</label>
                        <span class="switch"><input type="checkbox" id="pushToggle" ${settings.pushEnabled ? 'checked' : ''} ${pushConfigured() ? '' : 'disabled'} data-change="togglePush"><span class="track"></span></span>
                    </div>
                    <p class="muted">${esc(pushStatus())}</p>
                </div>
            </details>
        </div>

        <div class="card">
            <h3 class="card-title"><span aria-hidden="true">📆</span> Google Calendar</h3>
            <p class="muted">Crea eventi ricorrenti la sera prima di ogni ritiro, con la descrizione dei rifiuti da mettere fuori e il promemoria di Calendar.</p>
            ${settings.gcalDirty ? '<p class="warn muted strong">⚠️ Hai modificato orari, tipi o promemoria dopo l\'ultima sincronizzazione: risincronizza per aggiornare Calendar.</p>' : ''}
            <div>
                <label class="lbl" for="gcalReminder">Promemoria di Calendar</label>
                <select id="gcalReminder" data-change="setGcalReminder">
                    ${REMINDER_OPTIONS.map(([v, l]) => `<option value="${v}" ${Number(settings.gcalReminder) === v ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
            </div>
            <button class="btn btn-primary btn-block" data-action="openLinks">Aggiungi a Google Calendar</button>
            <button class="btn btn-ghost btn-block" data-action="downloadICS">Scarica file .ics (Calendar, Apple, Outlook)</button>

            <details>
                <summary>Sincronizzazione automatica (avanzata)</summary>
                <div class="stack">
                    <p class="muted">Collega il tuo account Google: gli eventi vengono creati e aggiornati direttamente. Serve un ID client OAuth personale (gratuito):</p>
                    <ol class="steps">
                        <li>Apri <code>console.cloud.google.com</code>, crea un progetto e abilita <b>Google Calendar API</b>.</li>
                        <li>In «Schermata consenso OAuth» scegli «Esterno» e aggiungi il tuo account Google tra gli utenti di test.</li>
                        <li>In «Credenziali» crea un <b>ID client OAuth → Applicazione web</b>.</li>
                        <li>Tra le «Origini JavaScript autorizzate» inserisci: <code>${esc(origin)}</code></li>
                        <li>Incolla qui sotto l'ID client (termina con <code>.apps.googleusercontent.com</code>).</li>
                    </ol>
                    <div>
                        <label class="lbl" for="gcalClientId">ID client OAuth</label>
                        <input type="text" id="gcalClientId" value="${esc(settings.gcalClientId)}" placeholder="123456-abc.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false" data-change="setClientId">
                    </div>
                    <button class="btn btn-primary btn-block" data-action="gcalSync" ${validClientId ? '' : 'disabled'}>Connetti e sincronizza</button>
                    ${settings.gcalSynced ? `<p class="muted">Ultima sincronizzazione: ${esc(lastSync)}</p><button class="btn btn-danger btn-block" data-action="gcalRemove">Rimuovi eventi da Google Calendar</button>` : ''}
                </div>
            </details>
        </div>

        <div class="card">
            <h3 class="card-title"><span aria-hidden="true">🧰</span> Dati</h3>
            <p class="muted">Reimposta orari, tipi di rifiuto e impostazioni ai valori iniziali.</p>
            <button class="btn btn-danger btn-block" data-action="resetAll">Ripristina impostazioni predefinite</button>
        </div>

        <p class="muted" style="text-align:center">Raccolta Smart v${esc(APP_VERSION)}</p>`;
}

// Esegue un'operazione asincrona mostrando eventuali errori, poi ridisegna la scheda
async function run(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(e.message || 'Operazione non riuscita'); }
    renderSettings();
}

export const actions = {
    sendTest: () => run(sendTestNotification),

    openLinks() {
        const evs = buildEventGroups();
        if (!evs.length) { toast('Nessun ritiro da aggiungere'); return; }
        $('linksList').innerHTML = evs.map(ev => `
            <a class="btn btn-primary" href="${esc(calendarTemplateUrl(ev))}" target="_blank" rel="noopener">${esc(ev.summary)}<br><span style="font-weight:500;font-size:.75rem">dalle ${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())} · ${esc(dayById(ev.start.getDay()).name)} sera</span></a>`).join('');
        $('linksDialog').showModal();
    },

    downloadICS() {
        if (!buildEventGroups().length) { toast('Nessun ritiro da esportare'); return; }
        downloadICS();
        toast('File .ics scaricato: aprilo per importarlo in Google Calendar');
    },

    async gcalSync() {
        await run(async () => {
            const n = await syncGoogleCalendar();
            toast(n ? `Sincronizzati ${n} eventi ricorrenti su Google Calendar` : 'Eventi rimossi: nessun ritiro da sincronizzare');
        });
    },

    async gcalRemove() {
        if (!(await askConfirm('Rimuovere da Google Calendar tutti gli eventi creati da Raccolta Smart?', 'Rimuovi'))) return;
        await run(async () => { toast(`Rimossi ${await removeGoogleEvents()} eventi`); });
    },

    async resetAll() {
        if (!(await askConfirm('Ripristinare tutto ai valori iniziali? Orari, tipi di rifiuto e impostazioni verranno cancellati.', 'Ripristina'))) return;
        try { await wipeReminders(); } catch (e) { /* best effort */ }
        Object.values(KEYS).forEach(lsRemove);
        location.reload();
    }
};

export const changes = {
    setNotifTime(el) {
        if (!/^\d{2}:\d{2}$/.test(el.value)) return;
        settings.notifTime = el.value;
        markCalendarDirty();
        saveSettings();
        touch();
        renderSettings();
        toast(`Orario promemoria: ${el.value}`);
    },

    toggleNotif: el => run(() => (el.checked ? enableNotifications() : disableNotifications())),

    togglePush: el => run(() => (el.checked ? enablePush() : disablePush()), el.checked ? 'Notifiche ad app chiusa attivate' : undefined),

    setPushUrl(el) {
        settings.pushUrl = el.value.trim();
        saveSettings();
        renderSettings();
    },

    setPushToken(el) {
        settings.pushToken = el.value.trim();
        saveSettings();
    },

    setGcalReminder(el) {
        settings.gcalReminder = Number(el.value) || 0;
        markCalendarDirty();
        saveSettings();
        renderSettings();
    },

    setClientId(el) {
        settings.gcalClientId = el.value.trim();
        resetGoogleSession();
        saveSettings();
        renderSettings();
    }
};
