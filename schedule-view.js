// Scheda Orari: giorni della settimana e rifiuti ritirati.
import { DAYS } from '../config.js';
import { state, getType, saveSchedule, touch } from '../state.js';
import { $, esc, haptic, parseYMD, toast, ymd } from '../util.js';

export function renderSchedule() {
    const container = $('scheduleConfigList');
    const { types, schedule } = state;
    const warn = types.length ? '' : '<p class="muted warn">Non ci sono tipi di rifiuto: creane uno dalla scheda Guida.</p>';

    container.innerHTML = warn + DAYS.map(d => {
        const items = schedule[d.id] || [];
        const itemsHtml = items.map((item, index) => {
            const key = `${d.id}-${index}`;
            const data = `data-day="${d.id}" data-index="${index}"`;
            let opts = types.map(t => `<option value="${esc(t.id)}" ${item.type === t.id ? 'selected' : ''}>${esc(t.icon)} ${esc(t.name)}</option>`).join('');
            if (!getType(item.type)) opts = `<option value="${esc(item.type)}" selected>❔ Tipo eliminato</option>` + opts;
            const alt = item.freq !== 'every';
            return `
            <div class="item">
                <div class="row between">
                    <label class="lbl grow" for="t-${key}" style="margin:0">Rifiuto #${index + 1}</label>
                    <button type="button" class="btn btn-danger btn-sm" data-action="removeItem" ${data} aria-label="Rimuovi rifiuto ${index + 1} di ${esc(d.name)}">✕ Rimuovi</button>
                </div>
                <select id="t-${key}" data-change="updateItem" data-field="type" ${data}>${opts}</select>
                <div class="grid2">
                    <div>
                        <label class="lbl" for="f-${key}">Cadenza</label>
                        <select id="f-${key}" data-change="updateItem" data-field="freq" ${data}>
                            <option value="every" ${item.freq === 'every' ? 'selected' : ''}>Ogni settimana</option>
                            <option value="odd" ${item.freq === 'odd' ? 'selected' : ''}>Settimane alterne (1ª, 3ª…)</option>
                            <option value="even" ${item.freq === 'even' ? 'selected' : ''}>Settimane alterne (2ª, 4ª…)</option>
                        </select>
                    </div>
                    <div>
                        <label class="lbl" for="r-${key}">Data di riferimento</label>
                        <input type="date" id="r-${key}" value="${esc(item.refDate)}" ${alt ? '' : 'disabled'} data-change="updateItem" data-field="refDate" ${data}>
                    </div>
                </div>
                ${alt ? '<p class="muted">Scegli una data qualsiasi della settimana che conta come «1ª»: da lì le settimane si alternano.</p>' : ''}
            </div>`;
        }).join('');
        return `
        <div class="day">
            <div class="row between">
                <span class="day-name">${esc(d.name)}</span>
                <button type="button" class="btn btn-primary btn-sm" data-action="addItem" data-day="${d.id}" ${types.length ? '' : 'disabled'} aria-label="Aggiungi rifiuto a ${esc(d.name)}">+ Aggiungi rifiuto</button>
            </div>
            <div class="stack">${itemsHtml || '<p class="faint">Nessun ritiro programmato per questo giorno.</p>'}</div>
        </div>`;
    }).join('');
}

function commit() { saveSchedule(); touch(); }

export const actions = {
    addItem(el) {
        if (!state.types.length) return;
        haptic();
        const day = Number(el.dataset.day);
        (state.schedule[day] = state.schedule[day] || []).push({ type: state.types[0].id, freq: 'every', refDate: '' });
        commit(); renderSchedule();
    },
    removeItem(el) {
        haptic();
        const list = state.schedule[Number(el.dataset.day)];
        if (list) list.splice(Number(el.dataset.index), 1);
        commit(); renderSchedule();
    }
};

export const changes = {
    updateItem(el) {
        const item = (state.schedule[Number(el.dataset.day)] || [])[Number(el.dataset.index)];
        if (!item) return;
        const field = el.dataset.field;
        item[field] = el.value;
        // Le cadenze alterne hanno sempre bisogno di una data di riferimento valida
        if (item.freq !== 'every' && !parseYMD(item.refDate)) item.refDate = ymd(new Date());
        commit();
        if (field !== 'type') renderSchedule();
        toast('Salvato');
    }
};
