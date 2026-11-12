// Raccolta Smart - server push (Cloudflare Worker).
//
// L'app invia qui la sottoscrizione push e gli orari delle notifiche (POST /sync).
// Un cron ogni minuto controlla gli orari scaduti e invia un Web Push VUOTO (firmato VAPID)
// al servizio push del browser: il service worker dell'app si sveglia e mostra la notifica.
// Non serve cifrare nulla perché il messaggio non contiene dati.
//
// Stato: una sola chiave KV ("subs") con l'elenco delle sottoscrizioni (uso personale/familiare).

const KV_KEY = 'subs';
const MAX_SUBS = 20;
const MAX_SCHEDULE = 200;
const LATE_MS = 5 * 3600 * 1000;      // non inviare avvisi con più di 5 ore di ritardo
const KEEP_PAST_MS = 2 * 86400 * 1000; // tieni in archivio gli orari passati per 2 giorni

// Solo i servizi push dei browser noti (evita che il Worker venga usato per chiamare indirizzi arbitrari)
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/
];

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const textB64url = s => b64url(new TextEncoder().encode(s));

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };
}
const json = (env, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function authorized(req, env) {
  if (!env.APP_TOKEN) return true;
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') && timingSafeEqual(h.slice(7), env.APP_TOKEN);
}

function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some(re => re.test(u.hostname));
  } catch (e) { return false; }
}

async function loadSubs(env) {
  const raw = await env.PUSH_KV.get(KV_KEY);
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
const saveSubs = (env, subs) => env.PUSH_KV.put(KV_KEY, JSON.stringify(subs));

/* ---------- VAPID ---------- */
let signingKey = null;
async function getKey(env) {
  if (!signingKey) {
    signingKey = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  return signingKey;
}

// JWT ES256: la firma ECDSA di WebCrypto è già nel formato r||s richiesto da JWT
export async function vapidJwt(env, audience, nowSec = Math.floor(Date.now() / 1000)) {
  const header = textB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = textB64url(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:admin@example.com' }));
  const data = new TextEncoder().encode(`${header}.${claims}`);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await getKey(env), data);
  return `${header}.${claims}.${b64url(sig)}`;
}

async function sendPush(env, endpoint, jwtCache) {
  const audience = new URL(endpoint).origin;
  if (!jwtCache[audience]) jwtCache[audience] = await vapidJwt(env, audience);
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwtCache[audience]}, k=${env.VAPID_PUBLIC}`,
      TTL: '7200',
      Urgency: 'high'
    }
  });
}

/* ---------- Cron: invia i push scaduti ---------- */
export async function runCron(env, now = Date.now()) {
  const subs = await loadSubs(env);
  if (!subs.length) return { sent: 0 };
  const jwtCache = {};
  let changed = false, sent = 0;
  const keep = [];

  for (const sub of subs) {
    const due = (sub.schedule || []).filter(s => s.fireAt <= now && now - s.fireAt < LATE_MS && !(sub.sent || []).includes(s.id));
    let gone = false;
    if (due.length) {
      let res;
      try { res = await sendPush(env, sub.subscription.endpoint, jwtCache); } catch (e) { res = null; }
      if (res && (res.status === 404 || res.status === 410)) {
        gone = true;                      // sottoscrizione scaduta: eliminala
      } else if (res && res.status >= 200 && res.status < 300) {
        sub.sent = [...(sub.sent || []), ...due.map(d => d.id)];
        sent++; changed = true;
      } else if (res && res.status !== 429 && res.status < 500) {
        sub.sent = [...(sub.sent || []), ...due.map(d => d.id)]; // errore permanente: non ripetere ogni minuto
        changed = true;
      }                                    // 429/5xx o rete: riprova al prossimo minuto
    }
    if (gone) { changed = true; continue; }
    const before = (sub.schedule || []).length;
    sub.schedule = (sub.schedule || []).filter(s => now - s.fireAt < KEEP_PAST_MS);
    sub.sent = (sub.sent || []).filter(id => sub.schedule.some(s => s.id === id));
    if (sub.schedule.length !== before) changed = true;
    keep.push(sub);
  }
  if (changed) await saveSubs(env, keep);
  return { sent };
}

/* ---------- API ---------- */
function sanitizeSchedule(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_SCHEDULE)
    .filter(s => s && typeof s.id === 'string' && s.id.length <= 20 && Number.isFinite(s.fireAt))
    .map(s => ({ id: s.id, fireAt: s.fireAt }));
}

export async function handleRequest(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
  const url = new URL(req.url);
  if (url.pathname === '/' ) return json(env, { ok: true, service: 'raccolta-smart-push' });
  if (!authorized(req, env)) return json(env, { error: 'unauthorized' }, 401);

  if (req.method === 'GET' && url.pathname === '/vapid') return json(env, { publicKey: env.VAPID_PUBLIC || '' });

  if (req.method === 'POST' && (url.pathname === '/sync' || url.pathname === '/unsubscribe')) {
    let body;
    try { body = await req.json(); } catch (e) { return json(env, { error: 'bad json' }, 400); }
    const subs = await loadSubs(env);

    if (url.pathname === '/unsubscribe') {
      const next = subs.filter(s => s.subscription.endpoint !== body.endpoint);
      if (next.length !== subs.length) await saveSubs(env, next);
      return json(env, { ok: true });
    }

    const sub = body.subscription;
    if (!sub || !validEndpoint(sub.endpoint)) return json(env, { error: 'invalid subscription' }, 400);
    const schedule = sanitizeSchedule(body.schedule);
    const existing = subs.find(s => s.subscription.endpoint === sub.endpoint);
    if (existing) {
      existing.subscription = sub;
      existing.schedule = schedule;
      existing.sent = (existing.sent || []).filter(id => schedule.some(s => s.id === id));
    } else {
      if (subs.length >= MAX_SUBS) return json(env, { error: 'too many subscriptions' }, 429);
      subs.push({ subscription: sub, schedule, sent: [] });
    }
    await saveSubs(env, subs);
    return json(env, { ok: true, scheduled: schedule.length });
  }
  return json(env, { error: 'not found' }, 404);
}

export default {
  fetch: (req, env) => handleRequest(req, env),
  scheduled: (event, env, ctx) => { ctx.waitUntil(runCron(env)); }
};
