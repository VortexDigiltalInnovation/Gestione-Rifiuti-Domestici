// Funzioni di utilità generiche: DOM, date, festività, toast e conferme.
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const clone = o => JSON.parse(JSON.stringify(o));

export function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
export function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}
export function lsRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
export function haptic(ms = 20) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } }

/* ---------- Toast e conferma ---------- */
let toastTimer = null;
export function toast(msg, action) {
    const el = $('toast');
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
        const b = document.createElement('button');
        b.textContent = action.label;
        b.onclick = () => { el.hidden = true; action.fn(); };
        el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, action ? 10000 : 3500);
}

export function askConfirm(message, okLabel = 'Conferma') {
    return new Promise(resolve => {
        const dlg = $('confirmDialog');
        $('confirmMsg').textContent = message;
        $('confirmYes').textContent = okLabel;
        const done = v => { dlg.close(); resolve(v); };
        $('confirmYes').onclick = () => done(true);
        $('confirmNo').onclick = () => done(false);
        dlg.oncancel = () => resolve(false);
        dlg.showModal();
    });
}

/* ---------- Date ---------- */
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYMD(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayNum = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
// Numero progressivo della settimana (lunedì-domenica): immune a ora legale e cambio d'anno
export function epochWeek(d) {
    const dow = (d.getDay() + 6) % 7;
    return Math.floor((dayNum(d) - dow) / 7);
}
export function tzName() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'; } catch (e) { return 'Europe/Rome'; }
}

/* ---------- Festività italiane ---------- */
function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
}
const FIXED_HOLIDAYS = {
    '1-1': 'Capodanno', '6-1': 'Epifania', '25-4': 'Festa della Liberazione', '1-5': 'Festa del Lavoro',
    '2-6': 'Festa della Repubblica', '15-8': 'Ferragosto', '1-11': 'Ognissanti',
    '8-12': 'Immacolata Concezione', '25-12': 'Natale', '26-12': 'Santo Stefano'
};
export function holidayName(date) {
    const fixed = FIXED_HOLIDAYS[`${date.getDate()}-${date.getMonth() + 1}`];
    if (fixed) return fixed;
    const easter = easterSunday(date.getFullYear());
    if (ymd(date) === ymd(easter)) return 'Pasqua';
    if (ymd(date) === ymd(addDays(easter, 1))) return "Lunedì dell'Angelo (Pasquetta)";
    return '';
}
