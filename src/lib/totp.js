/**
 * TOTP (RFC 6238) para el segundo factor del login, sin dependencias:
 * HMAC-SHA1 sobre WebCrypto, igual que Google Authenticator / Authy.
 *
 * El secreto vive en `env.CRM_TOTP_SECRET` (base32, generado una sola vez).
 * Sin ese secret, el 2FA queda apagado — así no se rompe el login mientras
 * se configura.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASO_SEGUNDOS = 30;
const DIGITOS = 6;

function base32Decode(base32) {
  const limpio = base32.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of limpio) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

/** Genera un secreto base32 nuevo (20 bytes, el tamaño recomendado). */
export function generarSecreto() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

export function otpauthUrl(secreto, cuenta, emisor) {
  const params = new URLSearchParams({ secret: secreto, issuer: emisor, algorithm: "SHA1", digits: String(DIGITOS), period: String(PASO_SEGUNDOS) });
  return `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(cuenta)}?${params}`;
}

async function hmacSha1(claveBytes, mensajeBytes) {
  const clave = await crypto.subtle.importKey("raw", claveBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, mensajeBytes);
  return new Uint8Array(firma);
}

async function codigoParaContador(secretoBase32, contador) {
  const claveBytes = base32Decode(secretoBase32);
  const contadorBytes = new ArrayBuffer(8);
  const vista = new DataView(contadorBytes);
  // JS no tiene enteros de 64 bits nativos; con contadores de 30s esto aguanta
  // hasta el año 292472975, así que basta con la mitad baja.
  vista.setUint32(4, contador, false);

  const hmac = await hmacSha1(claveBytes, new Uint8Array(contadorBytes));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

/** Valida un código de 6 dígitos con ±1 paso (30s) de tolerancia por reloj. */
export async function codigoValido(secretoBase32, codigo) {
  if (!/^\d{6}$/.test(codigo)) return false;
  const contadorActual = Math.floor(Date.now() / 1000 / PASO_SEGUNDOS);
  for (const delta of [0, -1, 1]) {
    if ((await codigoParaContador(secretoBase32, contadorActual + delta)) === codigo) return true;
  }
  return false;
}
