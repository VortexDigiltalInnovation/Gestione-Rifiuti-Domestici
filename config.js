// Costanti e valori predefiniti dell'app.
export const APP_VERSION = '5.0.0';

export const KEYS = {
    types: 'raccolta_smart_types',
    schedule: 'raccolta_smart_schedule_multi',
    settings: 'raccolta_smart_settings'
};

export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const EVENT_MINUTES = 30;   // durata degli eventi di Calendar
export const QUEUE_DAYS = 56;      // quanti giorni di notifiche pianificare in anticipo

export const DEFAULT_TYPES = [
    { id: 'indifferenziato', name: 'Indifferenziato', icon: '🗑️', desc: 'Rifiuti non riciclabili: pannolini, cocci di ceramica, polvere, mozziconi, giocattoli rotti. Esporre il sacco ben chiuso.' },
    { id: 'organico', name: 'Organico', icon: '🍌', desc: 'Avanzi di cibo, scarti di frutta e verdura, fondi di caffè, tovaglioli sporchi. Usare sacchetti compostabili ed esporre il mastello.' },
    { id: 'carta', name: 'Carta e Cartone', icon: '📦', desc: 'Giornali, riviste, scatole di cartone piegate e schiacciate, cartoni della pizza puliti. Senza sacchetti di plastica.' },
    { id: 'plastica', name: 'Plastica e Metalli', icon: '🍼', desc: 'Bottiglie, flaconi, vaschette, lattine e barattoli di metallo. Svuotare e schiacciare i contenitori prima di esporli.' },
    { id: 'vetro', name: 'Vetro', icon: '🍾', desc: 'Bottiglie, vasetti e barattoli di vetro, vuoti e senza tappo. Niente ceramica, cristallo o lampadine.' }
];

export const EMOJI_CHOICES = ['🗑️', '🍌', '📦', '🍼', '🍾', '🌿', '🍂', '🥫', '🔋', '💡', '👕', '🪑', '💊', '🛢️', '📰', '♻️'];

// id = valore di Date.getDay()
export const DAYS = [
    { id: 1, name: 'Lunedì', rrule: 'MO' },
    { id: 2, name: 'Martedì', rrule: 'TU' },
    { id: 3, name: 'Mercoledì', rrule: 'WE' },
    { id: 4, name: 'Giovedì', rrule: 'TH' },
    { id: 5, name: 'Venerdì', rrule: 'FR' },
    { id: 6, name: 'Sabato', rrule: 'SA' },
    { id: 0, name: 'Domenica', rrule: 'SU' }
];
export const dayById = id => DAYS.find(d => d.id === id);

export const REMINDER_OPTIONS = [
    [0, "All'orario dell'evento"],
    [10, '10 minuti prima'],
    [30, '30 minuti prima'],
    [60, '1 ora prima']
];

export const DEFAULT_SETTINGS = {
    holidays: true,
    notifTime: '20:00',          // orario unico per notifiche ed eventi Calendar
    notifEnabled: false,         // notifiche locali
    pushEnabled: false,          // notifiche ad app chiusa (Web Push via Worker)
    pushUrl: '',
    pushToken: '',
    pushLastSync: '',
    gcalClientId: '',
    gcalReminder: 0,
    gcalSynced: false,
    gcalDirty: false,
    gcalLastSync: ''
};
