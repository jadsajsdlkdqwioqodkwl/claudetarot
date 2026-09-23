/**
 * Web Push (notificaciones del navegador/celular) implementado a mano con
 * Web Crypto — sin la librería `web-push` de npm, que no corre en el
 * runtime de Workers. Sigue RFC 8291 (cifrado del payload) + RFC 8292
 * (autenticación VAPID) al pie de la letra.
 *
 * Necesita dos secretos configurados en el Worker:
 *   VAPID_PUBLIC_KEY  — clave pública, en base64url (65 bytes sin comprimir)
 *   VAPID_PRIVATE_KEY — el escalar `d`, en base64url (32 bytes)
 * Se generan una sola vez (ver README/instrucciones que se le dan al dueño
 * del proyecto) — no cambian salvo que se quiera invalidar todas las
 * suscripciones existentes.
 */

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")), (c) => c.charCodeAt(0));
const bytesToB64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function concatBytes(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

/** HKDF de un solo bloque (nos alcanza: nunca pedimos más de 32 bytes de salida). */
async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t.slice(0, length);
}

async function importarVapidPrivada(env) {
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY.trim()); // 0x04 + x(32) + y(32)
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const d = env.VAPID_PRIVATE_KEY.trim();
  const jwk = { kty: "EC", crv: "P-256", d, x: bytesToB64url(x), y: bytesToB64url(y), ext: true };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** El JWT que autentica al servidor ante el servicio de push (FCM, Mozilla, etc) — RFC 8292. */
async function crearJwtVapid(env, aud) {
  const header = { alg: "ES256", typ: "JWT" };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:soporte@example.com" };
  const encoder = new TextEncoder();
  const encabezado = bytesToB64url(encoder.encode(JSON.stringify(header)));
  const cuerpo = bytesToB64url(encoder.encode(JSON.stringify(payload)));
  const firmado = `${encabezado}.${cuerpo}`;

  const clave = await importarVapidPrivada(env);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, encoder.encode(firmado));
  return `${firmado}.${bytesToB64url(firma)}`;
}

/** Cifra el payload para una suscripción concreta — RFC 8291 (aes128gcm). */
async function cifrarPayload(payloadTexto, p256dhB64, authB64) {
  const uaPublicBytes = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicBytes, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const parEfimero = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", parEfimero.publicKey));

  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, parEfimero.privateKey, 256));

  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublicBytes, asPublicBytes);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const plano = concatBytes(new TextEncoder().encode(payloadTexto), new Uint8Array([2])); // 0x02 = último (y único) registro
  const claveAes = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, claveAes, plano));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  const cabecera = concatBytes(salt, recordSize, new Uint8Array([asPublicBytes.length]), asPublicBytes);

  return concatBytes(cabecera, cifrado);
}

/**
 * Manda una notificación push a una suscripción guardada.
 * Lanza si el servicio de push la rechaza; un 404/410 significa que el
 * navegador la invalidó (el usuario desinstaló, borró datos, etc) — el
 * llamador debe borrarla de la base en ese caso.
 */
export async function mandarPush(env, subscripcion, datos) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error("Notificaciones push no configuradas (faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY).");
  }
  const cuerpo = await cifrarPayload(JSON.stringify(datos), subscripcion.p256dh, subscripcion.auth);
  const aud = new URL(subscripcion.endpoint).origin;
  const jwt = await crearJwtVapid(env, aud);

  const res = await fetch(subscripcion.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY.trim()}`
    },
    body: cuerpo
  });

  if (!res.ok) {
    const err = new Error(`Push rechazado: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
}
