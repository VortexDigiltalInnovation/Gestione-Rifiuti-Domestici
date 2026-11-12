// Scheda Dashboard: cosa esporre stasera e prossimi ritiri.
import { dayById } from '../config.js';
import { state, typeInfo, saveSettings, touch } from '../state.js';
import { $, addDays, esc, holidayName, pad, ymd } from '../util.js';
import { getActiveItemsForDate } from '../schedule.js';
import { notifGranted } from '../reminders.js';

const { settings } = state;
let lastRenderDay = '';
export const renderedDay = () => lastRenderDay;

const trashRows = items => items.map(item => {
    const t = typeInfo(item.type);
    return `<div class="trash"><span class="ico" aria-hidden="true">${esc(t.icon)}</span><div><div class="nm">${esc(t.name)}</div>${t.desc ? `<div class="ds">${esc(t.desc)}</div>` : ''}</div></div>`;
}).join('');

export function renderDashboard() {
    const now = new Date();
    lastRenderDay = ymd(now);
    const tomorrow = addDays(now, 1);
    const items = getActiveItemsForDate(tomorrow);
    const hName = settings.holidays ? holidayName(tomorrow) : '';

    if (!items.length) {
        $('tonightTrash').innerHTML = '<div class="banner"><span class="ico" aria-hidden="true">✨</span><span>Nessun rifiuto da esporre stasera.</span></div>';
    } else if (hName) {
        $('tonightTrash').innerHTML = `<div class="banner"><span class="ico" aria-hidden="true">🚨</span><span>Domani è festivo (${esc(hName)}): il ritiro potrebbe essere sospeso. Controlla il calendario del tuo comune.</span></div><div style="opacity:.75">${trashRows(items)}</div>`;
    } else {
        $('tonightTrash').innerHTML = trashRows(items);
    }

    $('tonightMeta').textContent = settings.notifEnabled && notifGranted()
        ? `🔔 Promemoria ogni sera alle ${settings.notifTime}${settings.pushEnabled ? ' · anche ad app chiusa' : ''}`
        : '';

    let up = '';
    for (let i = 1; i <= 7; i++) {
        const d = addDays(now, i);
        const its = getActiveItemsForDate(d);
        const label = i === 1 ? 'Domani' : dayById(d.getDay()).name.slice(0, 3);
        const h = settings.holidays ? holidayName(d) : '';
        const what = its.length
            ? its.map(it => { const t = typeInfo(it.type); return `<span aria-hidden="true">${esc(t.icon)}</span> ${esc(t.name)}`; }).join('<br>')
            : '<span class="muted">—</span>';
        up += `<div class="upc"><span class="when">${esc(label)} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${h && its.length ? ` <span title="${esc(h)}">🎉</span>` : ''}</span><span class="what">${what}</span></div>`;
    }
    $('upcoming').innerHTML = up;
    $('holidayToggle').checked = !!settings.holidays;
}

export const changes = {
    setHolidays(el) {
        settings.holidays = el.checked;
        saveSettings();
        touch();
        renderDashboard();
    }
};
