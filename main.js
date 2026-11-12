// Punto di ingresso: navigazione, gestione eventi (delegation), service worker, timer.
import { APP_VERSION } from './config.js';
import { onDataChange } from './state.js';
import { $, haptic, toast, ymd } from './util.js';
import { markCalendarDirty } from './calendar.js';
import { checkDueNow, rebuildReminders } from './reminders.js';
import * as dashboard from './views/dashboard.js';
import * as scheduleView from './views/schedule-view.js';
import * as guide from './views/guide-view.js';
import * as settingsView from './views/settings-view.js';

/* ---------- Navigazione ---------- */
const TABS = {
    dashboard: dashboard.renderDashboard,
    schedule: scheduleView.renderSchedule,
    guide: guide.renderGuide,
    settings: settingsView.renderSettings
};

function switchTab(tabId, silent) {
    if (!silent) haptic();
    Object.keys(TABS).forEach(t => {
        $(`tab-${t}`).hidden = t !== tabId;
        const b = $(`btn-${t}`);
        if (t === tabId) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    TABS[tabId]();
    window.scrollTo({ top: 0 });
}

/* ---------- Eventi: un solo listener per click e uno per change ---------- */
const actions = {
    ...scheduleView.actions,
    ...guide.actions,
    ...settingsView.actions,
    switchTab: el => switchTab(el.dataset.tab),
    closeDialog: el => $(el.dataset.target).close()
};
const changes = {
    ...dashboard.changes,
    ...scheduleView.changes,
    ...settingsView.changes
};

document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    const fn = el && actions[el.dataset.action];
    if (fn) fn(el, e);
});
document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    const fn = el && changes[el.dataset.change];
    if (fn) fn(el, e);
});
$('typeForm').addEventListener('submit', guide.saveTypeFromForm);

/* ---------- Dati cambiati: Calendar da risincronizzare + coda promemoria ---------- */
onDataChange(() => { markCalendarDirty(); rebuildReminders(); });

/* ---------- Rete e service worker ---------- */
function updateOnline() {
    const el = $('syncStatus');
    el.textContent = navigator.onLine ? 'Online' : 'Offline';
    el.className = 'pill' + (navigator.onLine ? ' ok' : '');
}

function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) toast('App aggiornata a una nuova versione.', { label: 'Ricarica', fn: () => location.reload() });
    });
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`)
        .then(() => rebuildReminders())
        .catch(err => console.warn('Service worker non registrato:', err));
}

/* ---------- Avvio ---------- */
$('appVersion').textContent = `v${APP_VERSION}`;
document.title = `Raccolta Smart v${APP_VERSION}`;
switchTab('dashboard', true);
updateOnline();
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

const dayChanged = () => dashboard.renderedDay() !== ymd(new Date());
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (dayChanged() && !$('tab-dashboard').hidden) dashboard.renderDashboard();
    rebuildReminders();
});
setInterval(() => { if (dayChanged()) { if (!$('tab-dashboard').hidden) dashboard.renderDashboard(); rebuildReminders(); } }, 60000);
setInterval(checkDueNow, 30000); // notifiche dovute mentre l'app è aperta
setupServiceWorker();
