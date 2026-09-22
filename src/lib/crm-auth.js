/**
 * Sesión del CRM: una sola contraseña compartida (`CRM_PASSWORD`), sin tabla
 * de usuarios. La sesión es una cookie firmada (HMAC-SHA256) con expiración,
 * sin estado en el servidor — no hay nada que limpiar ni ninguna tabla de
 * sesiones que se pueda llenar.
 */

const NOMBRE_COOKIE = "crm_session";
const DURACION_MS = 12 * 3600 * 1000; // 12 horas

function claveSecreta(env) {
  return env.CRM_SESSION_SECRET || env.CRM_PASSWORD || "";
}

async function firmar(env, valor) {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(claveSecreta(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(valor));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function crearCookieSesion(env) {
  const expira = Date.now() + DURACION_MS;
  const valor = `${expira}`;
  const firma = await firmar(env, valor);
  const cookie = `${valor}.${firma}`;
  return `${NOMBRE_COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_MS / 1000}`;
}

export function cookieDeCierre() {
  return `${NOMBRE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function leerCookie(request) {
  const raw = request.headers.get("Cookie") || "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${NOMBRE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function sesionValida(request, env) {
  if (!env.CRM_PASSWORD) return false; // CRM apagado hasta que se configure la contraseña
  const cookie = leerCookie(request);
  if (!cookie) return false;

  const [valor, firma] = cookie.split(".");
  if (!valor || !firma) return false;
  if (Number(valor) < Date.now()) return false;

  const esperado = await firmar(env, valor);
  if (esperado.length !== firma.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  return diff === 0;
}

/** Envuelve un handler para que responda 401 si no hay sesión válida. */
export function conAuth(handler) {
  return async (context) => {
    if (!(await sesionValida(context.request, context.env))) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    return handler(context);
  };
}
