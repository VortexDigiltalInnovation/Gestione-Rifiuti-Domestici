// Promemoria: coda di notifiche, notifiche locali e Web Push (ad app chiusa) tramite il Worker.
import { QUEUE_DAYS } from './config.js';
import { state, getType, saveSettings } from './state.js';
import { addDays, holidayName, startOfDay, ymd } from './util.js';
import { getActiveItemsForDate } from './schedule.js';
import { eventTime } from './calendar.js';

const { settings } = state;

export const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const pushSupported = () => notifSupported() && 'PushManager' in window;
export const notifGranted = () => notifSupported() && Notification.permission === 'granted';
const notifActive = () => settings.notifEnabled && notifGranted();

/* ---------- Service worker e cache di configurazione ---------- */
export function getRegistration() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise(r => setTimeout(() => r(null), 4000))
    ]).catch(() => null);
}

// La coda è condivisa con il service worker tramite la Cache API (il SW non vede localStorage)
async function writeConfig(name, data, reg) {
    if (!('caches' in window) || !reg) return;
    const cache = await caches.open('rs-config');
    await cache.put(new URL(name, reg.scope).href, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
}

/* ---------- Coda notifiche ---------- */
// Una notifica per ogni sera, dal giorno corrente per QUEUE_DAYS giorni, solo se il giorno dopo c'è un ritiro.
export function buildQueue() {
    const out = [];
    const { h, m } = eventTime();
    const base = startOfDay(new Date());
    const now = Date.now();
    for (let i = 0; i < QUEUE_DAYS; i++) {
        const eve = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, h, m);
        const collect = addDays(base, i + 1);
        const items = getActiveItemsForDate(collect, true);
        if (!items.length || eve.getTime() < now - 5 * 3600 * 1000) continue;
        const hName = settings.holidays ? holidayName(collect) : '';
        const body = (hName ? `⚠️ Domani è festivo (${hName}): il ritiro potrebbe essere sospeso.\n` : '') +
            items.map(it => { const t = getType(it.type); return `${t.icon} ${t.name}${t.desc ? ': ' + t.desc : ''}`; }).join('\n');
        out.push({
            id: ymd(eve),
            fireAt: eve.getTime(),
            title: `♻️ Da esporre per domani: ${items.map(it => getType(it.type).name).join(', ')}`,
            body
        });
    }
    return out;
}

// Riscrive la coda per il service worker e, se attivo, aggiorna il server push.
export async function rebuildReminders() {
    try {
        const reg = await getRegistration();
        if (!reg) return;
        const active = notifActive();
        const queue = active ? buildQueue() : [];
        await writeConfig('__queue.json', queue, reg);
        if (active && reg.active) reg.active.postMessage({ type: 'CHECK' });
        if (active && settings.pushEnabled) await syncPush(reg, queue);
    } catch (e) { /* best effort */ }
}

export async function checkDueNow() {
    if (!notifActive()) return;
    const reg = await getRegistration();
    if (reg && reg.active) reg.active.postMessage({ type: 'CHECK' });
}

/* ---------- Notifiche locali ---------- */
async function setPeriodicSync(on) {
    try {
        const reg = await getRegistration();
        if (!reg || !reg.periodicSync) return;
        if (on) await reg.periodicSync.register('raccolta-check', { minInterval: 60 * 60 * 1000 });
        else await reg.periodicSync.unregister('raccolta-check');
    } catch (e) { /* non supportato o non concesso */ }
}

async function ensurePermission() {
    if (!notifSupported()) throw new Error('Questo browser non supporta le notifiche.');
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permesso notifiche non concesso.');
}

export async function enableNotifications() {
    await ensurePermission();
    settings.notifEnabled = true;
    saveSettings();
    await setPeriodicSync(true);
    await rebuildReminders();
}

export async function disableNotifications() {
    settings.notifEnabled = false;
    saveSettings();
    await setPeriodicSync(false);
    if (settings.pushEnabled) await disablePush();
    await rebuildReminders();
}

export async function sendTestNotification() {
    if (!notifGranted()) throw new Error('Attiva prima le notifiche.');
    const reg = await getRegistration();
    if (!reg) throw new Error('Service worker non disponibile.');
    const items = getActiveItemsForDate(addDays(new Date(), 1), true);
    const body = items.length ? items.map(i => { const t = getType(i.type); return `${t.icon} ${t.name}`; }).join('\n') : 'Notifica di prova: tutto funziona!';
    await reg.showNotification('♻️ Raccolta Smart', {
        body,
        icon: new URL('icons/icon-192.png', reg.scope).href,
        badge: new URL('icons/icon-192.png', reg.scope).href,
        tag: 'rs-test',
        data: { url: './index.html' }
    });
}

/* ---------- Web Push (ad app chiusa) ---------- */
// Il Worker conserva la sottoscrizione e gli orari; all'ora giusta invia un push vuoto
// che sveglia il service worker, il quale mostra la notifica costruita dalla coda locale.
export const pushConfigured = () => /^https:\/\//.test(settings.pushUrl || '');
let lastPushError = '';
export const getPushError = () => lastPushError;

const pushBase = () => settings.pushUrl.replace(/\/+$/, '');

async function pushApi(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (settings.pushToken) headers.Authorization = `Bearer ${settings.pushToken}`;
    let res;
    try {
        res = await fetch(`${pushBase()}${path}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
        throw new Error('Server push non raggiungibile: controlla l\'indirizzo e la connessione.');
    }
    if (res.status === 401) throw new Error('Token del server push non valido.');
    if (!res.ok) throw new Error(`Errore del server push (${res.status}).`);
    return res.json().catch(() => ({}));
}

function urlBase64ToUint8Array(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function getOrCreateSubscription(reg) {
    const { publicKey } = await pushApi('/vapid');
    if (!publicKey) throw new Error('Il server push non ha una chiave VAPID configurata.');
    const key = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
        const cur = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
        if (cur && (cur.length !== key.length || cur.some((v, i) => v !== key[i]))) { await sub.unsubscribe(); sub = null; }
    }
    return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

async function syncPush(reg, queue) {
    try {
        const sub = await getOrCreateSubscription(reg);
        await pushApi('/sync', { subscription: sub.toJSON(), schedule: queue.map(({ id, fireAt }) => ({ id, fireAt })) });
        settings.pushLastSync = new Date().toISOString();
        saveSettings();
        lastPushError = '';
    } catch (e) {
        lastPushError = e.message || String(e);
        throw e;
    }
}

export async function enablePush() {
    if (!pushSupported()) throw new Error('Questo browser non supporta il Web Push (su iPhone installa prima l\'app dalla schermata Home).');
    if (!pushConfigured()) throw new Error('Inserisci prima l\'indirizzo https del server push.');
    await enableNotifications();
    const reg = await getRegistration();
    if (!reg) throw new Error('Service worker non disponibile.');
    await syncPush(reg, buildQueue());
    settings.pushEnabled = true;
    saveSettings();
}

export async function disablePush() {
    settings.pushEnabled = false;
    saveSettings();
    try {
        const reg = await getRegistration();
        const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
        if (sub) {
            if (pushConfigured()) await pushApi('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
            await sub.unsubscribe();
        }
    } catch (e) { /* best effort */ }
}

// Cancella ogni traccia locale dei promemoria (usato dal ripristino)
export async function wipeReminders() {
    await disablePush();
    await setPeriodicSync(false);
    const reg = await getRegistration();
    if (reg) { await writeConfig('__queue.json', [], reg); await writeConfig('__shown.json', [], reg); }
}
