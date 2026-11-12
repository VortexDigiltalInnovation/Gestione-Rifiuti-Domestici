// Eventi di calendario: raggruppamento, file .ics, link Google Calendar e sincronizzazione via API.
import { DAYS, dayById, EVENT_MINUTES, GCAL_SCOPE } from './config.js';
import { state, getType, saveSettings } from './state.js';
import { addDays, pad, startOfDay, tzName } from './util.js';
import { itemPhase, phaseMatches } from './schedule.js';

const { settings } = state;

export function eventTime() {
    const [h, m] = (settings.notifTime || '20:00').split(':').map(Number);
    return { h: isNaN(h) ? 20 : h, m: isNaN(m) ? 0 : m };
}

/* ---------- Eventi ---------- */
// Un evento ricorrente per ogni gruppo giorno+cadenza, la sera prima del ritiro all'orario scelto.
export function buildEventGroups() {
    const groups = new Map();
    DAYS.forEach(d => {
        (state.schedule[d.id] || []).forEach(item => {
            if (!getType(item.type)) return;
            const phase = itemPhase(item);
            const key = `${d.id}-${phase}`;
            if (!groups.has(key)) groups.set(key, { key, dow: d.id, phase, items: [] });
            groups.get(key).items.push(item);
        });
    });

    const { h, m } = eventTime();
    const now = new Date();
    const out = [];
    groups.forEach(g => {
        let first = null;
        for (let i = 0; i <= 30 && !first; i++) {
            const collect = addDays(startOfDay(now), i);
            if (collect.getDay() !== g.dow || !phaseMatches(g.phase, collect)) continue;
            const eve = addDays(collect, -1);
            const start = new Date(eve.getFullYear(), eve.getMonth(), eve.getDate(), h, m);
            if (start.getTime() > now.getTime()) first = start;
        }
        if (!first) return;
        const list = g.items.map(i => getType(i.type));
        const body = list.map(t => `${t.icon} ${t.name}${t.desc ? '\n' + t.desc : ''}`).join('\n\n');
        out.push({
            key: g.key,
            start: first,
            end: new Date(first.getTime() + EVENT_MINUTES * 60000),
            summary: `♻️ Esporre: ${list.map(t => t.name).join(', ')}`,
            description: `Da esporre stasera per il ritiro di ${dayById(g.dow).name.toLowerCase()}:\n\n${body}\n\n— Raccolta Smart`,
            rrule: `FREQ=WEEKLY;INTERVAL=${g.phase < 0 ? 1 : 2};BYDAY=${dayById(first.getDay()).rrule}`
        });
    });
    return out;
}

const fmtLocal = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const fmtISOLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

/* ---------- File .ics ---------- */
const icsEscape = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function icsFold(line) {
    const enc = new TextEncoder();
    let out = '', cur = '', bytes = 0;
    for (const ch of line) {
        const b = enc.encode(ch).length;
        if (bytes + b > 73) { out += cur + '\r\n '; cur = ''; bytes = 1; }
        cur += ch; bytes += b;
    }
    return out + cur;
}

export function buildICS() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Raccolta Smart//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Raccolta Smart'];
    buildEventGroups().forEach(ev => {
        lines.push('BEGIN:VEVENT',
            `UID:rs-${ev.key}@raccolta-smart`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${fmtLocal(ev.start)}`,
            `DTEND:${fmtLocal(ev.end)}`,
            `RRULE:${ev.rrule}`,
            `SUMMARY:${icsEscape(ev.summary)}`,
            `DESCRIPTION:${icsEscape(ev.description)}`,
            'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.summary)}`, `TRIGGER:-PT${Number(settings.gcalReminder) || 0}M`, 'END:VALARM',
            'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
}

export function downloadICS() {
    const blob = new Blob([buildICS()], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'raccolta-smart.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- Link "Aggiungi a Google Calendar" (senza configurazione) ---------- */
export function calendarTemplateUrl(ev) {
    const p = new URLSearchParams({
        action: 'TEMPLATE',
        text: ev.summary,
        details: ev.description,
        dates: `${fmtLocal(ev.start)}/${fmtLocal(ev.end)}`,
        ctz: tzName(),
        recur: `RRULE:${ev.rrule}`
    });
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/* ---------- Google Calendar API (OAuth con ID client personale) ---------- */
let gisPromise = null, accessToken = null, tokenExpiry = 0;

function loadGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gisPromise = null; reject(new Error('Impossibile caricare Google Identity Services (sei online?)')); };
        document.head.appendChild(s);
    });
    return gisPromise;
}

async function getGoogleToken() {
    if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;
    const clientId = (settings.gcalClientId || '').trim();
    if (!clientId) throw new Error("Inserisci prima l'ID client OAuth di Google.");
    await loadGIS();
    return new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GCAL_SCOPE,
            callback: r => {
                if (r.error) return reject(new Error(r.error_description || r.error));
                accessToken = r.access_token;
                tokenExpiry = Date.now() + (Number(r.expires_in) || 3600) * 1000;
                resolve(accessToken);
            },
            error_callback: e => reject(new Error(e && e.type === 'popup_closed' ? 'Autorizzazione annullata.' : (e && e.message) || 'Autorizzazione non riuscita.'))
        });
        client.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
    });
}

export function resetGoogleSession() { accessToken = null; tokenExpiry = 0; }

async function gcalFetch(path, opts = {}) {
    const token = await getGoogleToken();
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    if (res.status === 401) { resetGoogleSession(); throw new Error('Sessione Google scaduta: riprova.'); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const m = data && data.error && data.error.message;
        throw new Error(m ? `Google Calendar: ${m}` : `Errore Google Calendar (${res.status})`);
    }
    return data;
}

async function listOwnEventIds() {
    const ids = [];
    let pageToken = '';
    do {
        const q = new URLSearchParams({ privateExtendedProperty: 'raccoltaSmart=1', maxResults: '250', showDeleted: 'false' });
        if (pageToken) q.set('pageToken', pageToken);
        const data = await gcalFetch(`/calendars/primary/events?${q}`);
        (data.items || []).forEach(e => ids.push(e.id));
        pageToken = data.nextPageToken || '';
    } while (pageToken);
    return ids;
}

const deleteEvent = id => gcalFetch(`/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Sostituisce gli eventi creati dall'app con quelli aggiornati. Restituisce quanti ne ha creati.
export async function syncGoogleCalendar() {
    const evs = buildEventGroups();
    await getGoogleToken();
    for (const id of await listOwnEventIds()) await deleteEvent(id);
    const tz = tzName();
    for (const ev of evs) {
        await gcalFetch('/calendars/primary/events', {
            method: 'POST',
            body: JSON.stringify({
                summary: ev.summary,
                description: ev.description,
                start: { dateTime: fmtISOLocal(ev.start), timeZone: tz },
                end: { dateTime: fmtISOLocal(ev.end), timeZone: tz },
                recurrence: [`RRULE:${ev.rrule}`],
                reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: Number(settings.gcalReminder) || 0 }] },
                extendedProperties: { private: { raccoltaSmart: '1' } }
            })
        });
    }
    settings.gcalSynced = evs.length > 0;
    settings.gcalDirty = false;
    settings.gcalLastSync = new Date().toISOString();
    saveSettings();
    return evs.length;
}

export async function removeGoogleEvents() {
    const ids = await listOwnEventIds();
    for (const id of ids) await deleteEvent(id);
    settings.gcalSynced = false; settings.gcalDirty = false; settings.gcalLastSync = '';
    saveSettings();
    return ids.length;
}

// Segna Calendar come "da risincronizzare" dopo una modifica
export function markCalendarDirty() {
    if (settings.gcalSynced && !settings.gcalDirty) { settings.gcalDirty = true; saveSettings(); }
}
