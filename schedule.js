// Logica pura del calendario di raccolta: quali rifiuti si ritirano in un dato giorno.
import { state, getType } from './state.js';
import { epochWeek, parseYMD } from './util.js';

// Fase di una cadenza alterna: il ritiro cade nelle settimane con epochWeek % 2 === fase.
// -1 = ogni settimana.
export function itemPhase(item) {
    if (item.freq !== 'odd' && item.freq !== 'even') return -1;
    const ref = parseYMD(item.refDate);
    if (!ref) return -1;
    return (((epochWeek(ref) + (item.freq === 'even' ? 1 : 0)) % 2) + 2) % 2;
}

export const phaseMatches = (phase, date) => phase < 0 || (((epochWeek(date) % 2) + 2) % 2) === phase;

// Ritiri previsti nel giorno `date` (solo tipi ancora esistenti se onlyKnown)
export function getActiveItemsForDate(date, onlyKnown = false) {
    const items = state.schedule[date.getDay()] || [];
    return items.filter(item => phaseMatches(itemPhase(item), date) && (!onlyKnown || getType(item.type)));
}
