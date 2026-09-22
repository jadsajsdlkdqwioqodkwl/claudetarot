/**
 * Hash de contraseñas con PBKDF2-SHA256 (WebCrypto), sin dependencias.
 * Formato guardado: "<iteraciones>.<sal-hex>.<hash-hex>".
 */

const ITERACIONES = 100_000;

function bytesAHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexABytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function derivar(password, salBytes, iteraciones) {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salBytes, iterations: iteraciones, hash: "SHA-256" },
    clave,
    256
  );
  return bytesAHex(bits);
}

export async function hashPassword(password) {
  const salBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(password, salBytes, ITERACIONES);
  return `${ITERACIONES}.${bytesAHex(salBytes)}.${hash}`;
}

export async function verificarPassword(password, guardado) {
  const [iterStr, salHex, hashHex] = String(guardado || "").split(".");
  const iteraciones = Number(iterStr);
  if (!iteraciones || !salHex || !hashHex) return false;

  const calculado = await derivar(password, hexABytes(salHex), iteraciones);
  if (calculado.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < calculado.length; i++) diff |= calculado.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}
