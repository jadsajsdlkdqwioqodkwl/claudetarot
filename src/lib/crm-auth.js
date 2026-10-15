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
    // Sin la migración 0057 todavía no existe producto_id: no se deja a nadie fuera (aún no hay cuentas limitadas).
    const agente = await env.CRM_DB.prepare(
      "SELECT id, username, display_name, role, active, password_hash, producto_id FROM agents WHERE id = ?"
    ).bind(payload.agentId).first().catch(() => env.CRM_DB.prepare(
      "SELECT id, username, display_name, role, active, password_hash FROM agents WHERE id = ?"
    ).bind(payload.agentId).first());
    if (!agente || !agente.active) return null;
    // Cookies de antes de este cambio no traen `pw`: valen hasta que se renueven.
    if (payload.pw && payload.pw !== (await huellaPassword(env, agente.password_hash))) return null;
    // Rol y nombre siempre frescos: un cambio de rol aplica sin volver a entrar.
    payload.role = agente.role;
    payload.displayName = agente.display_name;
    payload.username = agente.username;
    // Cuenta limitada a un producto (ej. URO): solo ve y toca los chats de ese producto.
    payload.productoId = agente.producto_id || null;
    agentePorSesion.set(payload, agente);
  } else if (payload.pw && payload.pw !== (await huellaPassword(env, env.CRM_PASSWORD))) {
    return null;
  }
  return payload;
}

export async function sesionValida(request, env) {
  return (await sesionActual(request, env)) !== null;
}


/**
 * Cuenta limitada a un producto: solo estas rutas (y en ellas, solo chats de
 * su producto). Todo lo demás (ajustes, equipo, reportes, envíos masivos…) es
 * 403 por omisión: una ruta nueva queda cerrada hasta que se agregue aquí.
 */
const RUTAS_DE_PRODUCTO = {
  "/api/crm/conversations": ["GET"],
  "/api/crm/messages": ["GET", "POST"],
  "/api/crm/upload-media": ["POST"],
  "/api/crm/media": ["GET"],
  "/api/crm/escribiendo": ["POST"],
  "/api/crm/react": ["POST"],
  "/api/crm/stickers": ["GET"],
  "/api/crm/chat-estado": ["POST"],
  "/api/crm/assign": ["PATCH"],
  "/api/crm/contacts": ["PATCH"],
  "/api/crm/quick-replies": ["GET"],
  "/api/crm/catalog": ["GET", "POST"],
  "/api/crm/catalog-products": ["GET"],
  "/api/crm/templates": ["GET", "POST"],
  "/api/crm/settings": ["GET"],
  "/api/crm/change-password": ["POST"],
  "/api/crm/push-subscribe": ["GET", "POST", "DELETE"],
  "/api/crm/notify-settings": ["GET", "POST"],
  "/api/crm/llamadas-uro": ["GET"],
  "/api/crm/llamadas-uro/check": ["PATCH"]
};

const prohibido = () =>
  new Response(JSON.stringify({ error: "Tu cuenta no tiene acceso a esto." }), {
    status: 403,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

/** null si la petición es de su producto; si no, la respuesta 403. */
async function revisarProducto(request, env, productoId) {
  const url = new URL(request.url);
  if (!RUTAS_DE_PRODUCTO[url.pathname]?.includes(request.method)) return prohibido();
  // Fotos de clientes (wa/…) solo por mensaje, que sí se revisa abajo.
  if (url.pathname === "/api/crm/media" && (url.searchParams.get("key") || "").startsWith("wa/")) return prohibido();

  let cuerpo = null;
  // Los handlers leen el cuerpo con text()+JSON.parse sin mirar el Content-Type: aquí igual.
  if (request.method !== "GET" && !(request.headers.get("Content-Type") || "").includes("multipart")) {
    try { cuerpo = JSON.parse(await request.clone().text()); } catch { cuerpo = null; }
  }
  const dato = (...claves) => {
    for (const k of claves) {
      const v = url.searchParams.get(k) ?? cuerpo?.[k];
      if (v !== undefined && v !== null && v !== "") return Number(v) || -1; // -1: id inválido, nunca coincide
    }
    return null;
  };
  const db = env.CRM_DB;
  const chat = dato("conversation_id", "chat");
  const mensaje = dato("message_id");
  const contacto = dato("contact_id");
  const propio = (sql, id) => db.prepare(sql).bind(id, productoId).first();

  if (chat !== null && !await propio("SELECT 1 FROM conversations WHERE id = ? AND producto_id = ?", chat)) return prohibido();
  if (mensaje !== null && !await propio("SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ? AND c.producto_id = ?", mensaje)) return prohibido();
  if (contacto !== null && !await propio("SELECT 1 FROM conversations WHERE contact_id = ? AND producto_id = ?", contacto)) return prohibido();
  return null;
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
    if (sesion.productoId) {
      const bloqueo = await revisarProducto(context.request, context.env, sesion.productoId);
      if (bloqueo) return bloqueo;
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
