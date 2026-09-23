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
// Sesión larga y deslizante: dura 30 días desde el último uso (se renueva
// sola, como mucho una vez al día). A cambio, cada petición confirma contra
// la base que la cuenta siga activa y con la misma contraseña — desactivar a
// alguien o cambiarle la contraseña cierra sus sesiones abiertas al toque.
const DURACION_MS = 30 * 24 * 3600 * 1000;
const RENOVAR_TRAS_MS = 24 * 3600 * 1000;
// Lax (no Strict): con Strict, abrir el CRM desde un link en otra app
// (WhatsApp, correo) llegaba sin cookie y parecía que se había cerrado la
// sesión. Lax igual bloquea los POST/PATCH/DELETE cruzados.
const ATRIBUTOS_COOKIE = "Path=/; HttpOnly; Secure; SameSite=Lax";

// La fila de `agents` de cada sesión validada, para renovar la cookie sin
// otra consulta — fuera del objeto `agent` para que el hash nunca llegue a
// los handlers.
const agentePorSesion = new WeakMap();

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

/** Huella corta de la contraseña vigente: si cambia, las cookies viejas dejan de valer. */
async function huellaPassword(env, secreto) {
  return (await firmar(env, `pw:${secreto || ""}`)).slice(0, 16);
}

export async function crearCookieSesion(env, agente = null) {
  const ahora = Date.now();
  // El modo de contraseña única (sin agente) es siempre "admin": es el dueño
  // de la cuenta, el único que puede entrar así.
  const payload = JSON.stringify({
    iat: ahora,
    exp: ahora + DURACION_MS,
    agentId: agente?.id || null,
    username: agente?.username || null,
    displayName: agente?.display_name || null,
    role: agente?.role || "admin",
    pw: await huellaPassword(env, agente ? agente.password_hash : env.CRM_PASSWORD)
  });
  const valorB64 = btoa(unescape(encodeURIComponent(payload)));
  const firma = await firmar(env, valorB64);
  const cookie = `${valorB64}.${firma}`;
  return `${NOMBRE_COOKIE}=${cookie}; ${ATRIBUTOS_COOKIE}; Max-Age=${DURACION_MS / 1000}`;
}

export function cookieDeCierre() {
  return `${NOMBRE_COOKIE}=; ${ATRIBUTOS_COOKIE}; Max-Age=0`;
}

/** Si la sesión ya tiene más de un día, devuelve la respuesta con una cookie nueva (30 días más). */
export async function conSesionRenovada(response, env, sesion) {
  if (!sesion || (sesion.iat && Date.now() - sesion.iat < RENOVAR_TRAS_MS)) return response;
  if (response.headers.has("Set-Cookie")) return response; // login/logout/cambio de contraseña ya manejan su cookie
  const renovada = new Response(response.body, response);
  renovada.headers.append("Set-Cookie", await crearCookieSesion(env, sesion.agentId ? agentePorSesion.get(sesion) : null));
  return renovada;
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

  if (payload.agentId) {
    const agente = await env.CRM_DB.prepare(
      "SELECT id, username, display_name, role, active, password_hash FROM agents WHERE id = ?"
    ).bind(payload.agentId).first();
    if (!agente || !agente.active) return null;
    // Cookies de antes de este cambio no traen `pw`: valen hasta que se renueven.
    if (payload.pw && payload.pw !== (await huellaPassword(env, agente.password_hash))) return null;
    // Rol y nombre siempre frescos: un cambio de rol aplica sin volver a entrar.
    payload.role = agente.role;
    payload.displayName = agente.display_name;
    payload.username = agente.username;
    agentePorSesion.set(payload, agente);
  } else if (payload.pw && payload.pw !== (await huellaPassword(env, env.CRM_PASSWORD))) {
    return null;
  }
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
    return conSesionRenovada(await handler({ ...context, agent: sesion }), context.env, sesion);
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
    return conSesionRenovada(await handler({ ...context, agent: sesion }), context.env, sesion);
  };
}
