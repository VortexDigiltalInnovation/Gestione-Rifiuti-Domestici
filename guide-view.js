// Scheda Guida: elenco e gestione dei tipi di rifiuto.
import { DEFAULT_TYPES, EMOJI_CHOICES } from '../config.js';
import { state, getType, saveTypes, saveSchedule, touch } from '../state.js';
import { $, askConfirm, clone, esc, toast } from '../util.js';

let editingId = null;

export function renderGuide() {
    const list = $('guideList');
    if (!state.types.length) {
        list.innerHTML = '<p class="faint">Nessun tipo di rifiuto. Aggiungine uno o ripristina quelli predefiniti.</p>';
        return;
    }
    list.innerHTML = state.types.map(t => `
        <div class="type">
            <span class="ico" aria-hidden="true">${esc(t.icon)}</span>
            <div class="grow">
                <div class="strong">${esc(t.name)}</div>
                <div class="muted">${esc(t.desc) || '<i>Nessuna descrizione.</i>'}</div>
            </div>
            <div class="actions">
                <button class="btn btn-ghost icon-btn" data-action="editType" data-id="${esc(t.id)}" aria-label="Modifica ${esc(t.name)}">✏️</button>
                <button class="btn btn-danger icon-btn" data-action="deleteType" data-id="${esc(t.id)}" aria-label="Elimina ${esc(t.name)}">🗑️</button>
            </div>
        </div>`).join('');
}

function openEditor(id) {
    editingId = id || null;
    const t = id ? getType(id) : null;
    $('typeDialogTitle').textContent = t ? 'Modifica tipo di rifiuto' : 'Nuovo tipo di rifiuto';
    $('typeName').value = t ? t.name : '';
    $('typeIcon').value = t ? t.icon : '♻️';
    $('typeDesc').value = t ? t.desc : '';
    $('typeErr').textContent = '';
    $('emojiPick').innerHTML = EMOJI_CHOICES.map(e => `<button type="button" data-action="pickEmoji" data-emoji="${e}" aria-label="Usa icona ${e}">${e}</button>`).join('');
    $('typeDialog').showModal();
    $('typeName').focus();
}

// Chiamato dal submit del form nel dialog
export function saveTypeFromForm(ev) {
    ev.preventDefault();
    const name = $('typeName').value.trim();
    const icon = $('typeIcon').value.trim() || '♻️';
    const desc = $('typeDesc').value.trim();
    const err = $('typeErr');
    if (!name) { err.textContent = 'Inserisci un nome.'; return; }
    if (state.types.some(t => t.id !== editingId && t.name.toLowerCase() === name.toLowerCase())) {
        err.textContent = 'Esiste già un tipo con questo nome.'; return;
    }
    if (editingId) {
        const t = getType(editingId);
        if (t) Object.assign(t, { name, icon, desc });
    } else {
        const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tipo';
        let id = base, n = 2;
        while (getType(id)) id = `${base}-${n++}`;
        state.types.push({ id, name, icon, desc });
    }
    saveTypes(); touch();
    $('typeDialog').close();
    renderGuide();
    toast('Tipo salvato');
}

export const actions = {
    newType() { openEditor(); },
    editType(el) { openEditor(el.dataset.id); },
    pickEmoji(el) { $('typeIcon').value = el.dataset.emoji; },

    async deleteType(el) {
        const id = el.dataset.id;
        const t = getType(id);
        if (!t) return;
        let uses = 0;
        Object.values(state.schedule).forEach(list => list.forEach(i => { if (i.type === id) uses++; }));
        const msg = uses
            ? `Eliminare «${t.name}»? Verrà rimosso anche da ${uses} ${uses === 1 ? 'ritiro programmato' : 'ritiri programmati'}.`
            : `Eliminare «${t.name}»?`;
        if (!(await askConfirm(msg, 'Elimina'))) return;
        state.types = state.types.filter(x => x.id !== id);
        Object.keys(state.schedule).forEach(d => { state.schedule[d] = state.schedule[d].filter(i => i.type !== id); });
        saveTypes(); saveSchedule(); touch();
        renderGuide();
        toast('Tipo eliminato');
    },

    async restoreTypes() {
        if (!(await askConfirm('Ripristinare i tipi predefiniti? Quelli eliminati tornano e quelli modificati riprendono nome, icona e descrizione originali. I tuoi tipi personalizzati restano.', 'Ripristina'))) return;
        DEFAULT_TYPES.forEach(d => {
            const idx = state.types.findIndex(t => t.id === d.id);
            if (idx >= 0) state.types[idx] = clone(d); else state.types.push(clone(d));
        });
        saveTypes(); touch(); renderGuide();
        toast('Tipi predefiniti ripristinati');
    }
};
