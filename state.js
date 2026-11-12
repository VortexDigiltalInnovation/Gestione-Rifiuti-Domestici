// Stato dell'app (tipi, orari, impostazioni) e persistenza su localStorage.
import { KEYS, DEFAULT_TYPES, DEFAULT_SETTINGS } from './config.js';
import { lsGet, lsSet, clone, parseYMD, ymd } from './util.js';

function loadTypes() {
    const stored = lsGet(KEYS.types, null);
    if (Array.isArray(stored) && stored.every(t => t && typeof t.id === 'string' && typeof t.name === 'string')) {
        return stored.map(t => ({ id: t.id, name: t.name, icon: t.icon || '♻️', desc: t.desc || '' }));
    }
    return clone(DEFAULT_TYPES);
}

function loadSchedule() {
    const stored = lsGet(KEYS.schedule, null);
    const fallback = {
        1: [{ type: 'organico', freq: 'every', refDate: '' }],
        2: [{ type: 'plastica', freq: 'every', refDate: '' }],
        3: [{ type: 'organico', freq: 'every', refDate: '' }, { type: 'vetro', freq: 'every', refDate: '' }],
        4: [{ type: 'carta', freq: 'every', refDate: '' }],
        5: [{ type: 'organico', freq: 'every', refDate: '' }],
        6: [{ type: 'indifferenziato', freq: 'every', refDate: '' }],
        0: []
    };
    const src = stored && typeof stored === 'object' ? stored : fallback;
    const out = {};
    for (let d = 0; d < 7; d++) {
        const list = Array.isArray(src[d]) ? src[d] : [];
        out[d] = list.filter(i => i && typeof i.type === 'string').map(i => {
            const freq = ['every', 'odd', 'even'].includes(i.freq) ? i.freq : 'every';
            let refDate = parseYMD(i.refDate) ? i.refDate : '';
            if (freq !== 'every' && !refDate) refDate = ymd(new Date()); // le cadenze alterne richiedono una data valida
            return { type: i.type, freq, refDate };
        });
    }
    return out;
}

export const state = {
    types: loadTypes(),
    schedule: loadSchedule(),
    settings: Object.assign({}, DEFAULT_SETTINGS, lsGet(KEYS.settings, {}))
};

export const getType = id => state.types.find(t => t.id === id);
export const typeInfo = id => getType(id) || { id, name: 'Tipo eliminato', icon: '❔', desc: '' };

export const saveTypes = () => lsSet(KEYS.types, state.types);
export const saveSchedule = () => lsSet(KEYS.schedule, state.schedule);
export const saveSettings = () => lsSet(KEYS.settings, state.settings);

// Notifica ai listener che orari, tipi o orario promemoria sono cambiati
const listeners = new Set();
export const onDataChange = fn => listeners.add(fn);
export const touch = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
