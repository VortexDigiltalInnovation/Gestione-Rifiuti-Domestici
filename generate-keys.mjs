// Genera le chiavi VAPID e un token di accesso per il server push.
// Uso:  node generate-keys.mjs
import { webcrypto as crypto } from 'node:crypto';

const b64url = buf => Buffer.from(buf).toString('base64url');

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicRaw = b64url(await crypto.subtle.exportKey('raw', publicKey));
const privateJwk = await crypto.subtle.exportKey('jwk', privateKey);
const token = b64url(crypto.getRandomValues(new Uint8Array(24)));

console.log('Esegui questi tre comandi (incolla il valore quando richiesto):\n');
console.log('1) npx wrangler secret put VAPID_PUBLIC');
console.log('   valore:', publicRaw, '\n');
console.log('2) npx wrangler secret put VAPID_PRIVATE_JWK');
console.log('   valore:', JSON.stringify(privateJwk), '\n');
console.log('3) npx wrangler secret put APP_TOKEN');
console.log('   valore:', token);
console.log('   (inserisci lo stesso token nell\'app, nel campo "Token di accesso")\n');
console.log('Conserva la chiave privata: non condividerla.');
