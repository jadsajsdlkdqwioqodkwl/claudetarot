/**
 * Sesión del CRM: cookie firmada (HMAC-SHA256) con expiración, sin estado en
 * el servidor. Lleva el agente adentro (id, usuario, nombre) para que quede
 * registrado quién manda cada mensaje.
 *
 * Compatibilidad: mientras no exista ningún agente en la tabla `agents`, el
 * login sigue aceptando la contraseña única `CRM_PASSWORD` (+ TOTP si está
 * configurado) — así no se corta el acceso al migrar a cuentas por vendedor.
 */

const NOMBRE_COOKIE = "crm_session";
const DURACION_MS = 12 * 3600 * 1000; // 12 horas

function claveSecreta(env) {
  return env.CRM_SESSION_SECRET || env.CRM_PASSWORD || "clave-de-sesion-sin-configurar";
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

export async function crearCookieSesion(env, agente = null) {
  const expira = Date.now() + DURACION_MS;
  // El modo de contraseña única (sin agente) es siempre "admin": es el dueño
  // de la cuenta, el único que puede entrar así.
  const payload = JSON.stringify({
    exp: expira,
    agentId: agente?.id || null,
    username: agente?.username || null,
    displayName: agente?.display_name || null,
    role: agente?.role || "admin"
  });
  const valorB64 = btoa(unescape(encodeURIComponent(payload)));
  const firma = await firmar(env, valorB64);
  const cookie = `${valorB64}.${firma}`;
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

/** Devuelve la sesión ({ exp, agentId, username, displayName }) o null si no es válida. */
export async function sesionActual(request, env) {
  if (!env.CRM_PASSWORD) return null; // CRM apagado hasta que se configure la contraseña inicial
  const cookie = leerCookie(request);
  if (!cookie) return null;

  const [valorB64, firma] = cookie.split(".");
  if (!valorB64 || !firma) return null;

  const esperado = await firmar(env, valorB64);
  if (esperado.length !== firma.length) return null;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  if (diff !== 0) return null;

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(escape(atob(valorB64))));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

export async function sesionValida(request, env) {
  return (await sesionActual(request, env)) !== null;
}

/** Envuelve un handler para que responda 401 si no hay sesión válida, y le pasa `agent`. */
export function conAuth(handler) {
  return async (context) => {
    const sesion = await sesionActual(context.request, context.env);
    if (!sesion) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    return handler({ ...context, agent: sesion });
  };
}

/** Como conAuth, pero además exige rol "admin" — para gestionar el equipo. */
export function conAdmin(handler) {
  return async (context) => {
    const sesion = await sesionActual(context.request, context.env);
    if (!sesion) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    if (sesion.role !== "admin") {
      return new Response(JSON.stringify({ error: "Solo un administrador puede hacer esto." }), {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    return handler({ ...context, agent: sesion });
  };
}
