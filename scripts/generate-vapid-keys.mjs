import { webcrypto } from 'node:crypto';

const pair = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
const publicKey = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
const encode = (bytes) => Buffer.from(bytes).toString('base64url');

if (publicKey.length !== 65 || !privateJwk.d) throw new Error('Could not generate a valid P-256 VAPID key pair.');

process.stdout.write(JSON.stringify({
  VAPID_PUBLIC_KEY: encode(publicKey),
  VAPID_PRIVATE_KEY: privateJwk.d,
}, null, 2) + '\n');
process.stderr.write('Keep VAPID_PRIVATE_KEY secret. Do not commit the generated output.\n');
