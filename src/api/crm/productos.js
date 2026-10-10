/**
 * Productos y números de WhatsApp (líneas) del CRM — ver src/lib/productos.js
 * y src/lib/lineas.js.
 *
 * GET    /api/crm/productos — { productos, lineas, principal } (todo el equipo:
 *        la lista y el selector del chat los necesitan)
 * POST   /api/crm/productos — admin: crea { nombre, linea_id?, anuncios?, palabras?,
 *        precio?, notas?, secuencia_id?, bienvenida_auto?, activo? }
 * PATCH  /api/crm/productos — admin: edita { id, ...lo mismo }
 *        o, cualquiera del equipo: { conversation_id, producto_id|null } = el
 *        producto de un chat a mano (ya no lo cambia nada automático)
 * DELETE /api/crm/productos — admin: { id } lo desactiva (sus chats y
 *        respuestas quedan, solo deja de reconocerse)
 *
 * POST/PATCH /api/crm/lineas — admin: { id?, nombre, phone_number_id, waba_id?,
 *        catalog_id?, token_var?, marca?, activa? }. Normalmente no hace falta
 *        crearla: el primer mensaje que llega a un número nuevo la registra.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { listarProductos, olvidarProductos, listaDe } from "../../lib/productos.js";
import { listarLineas, olvidarLineas } from "../../lib/lineas.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const esAdmin = (agent) => agent?.role === "admin";
const texto = (v, max) => (v === undefined ? undefined : String(v ?? "").trim().slice(0, max) || null);
const lista = (v, max) => (v === undefined ? undefined : listaDe(Array.isArray(v) ? v.join(",") : v).join(", ").slice(0, max) || null);

async function leer(request) {
  try {
    return JSON.parse(await request.text());
  } catch {
    return null;
  }
}

/** Los campos editables de un producto que vinieron en el payload. */
function camposProducto(p) {
  const c = {
    nombre: texto(p.nombre, 80),
    linea_id: p.linea_id === undefined ? undefined : Number(p.linea_id) || null,
    anuncios: lista(p.anuncios, 2000),
    palabras: lista(p.palabras, 1000),
    precio: texto(p.precio, 120),
    notas: texto(p.notas, 4000),
    secuencia_id: p.secuencia_id === undefined ? undefined : Number(p.secuencia_id) || null,
    bienvenida_auto: p.bienvenida_auto === undefined ? undefined : p.bienvenida_auto ? 1 : 0,
    activo: p.activo === undefined ? undefined : p.activo ? 1 : 0,
    color: p.color === undefined ? undefined : /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : null
  };
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));
}

async function get({ env }) {
  const [productos, lineas] = await Promise.all([listarProductos(env.CRM_DB, { fresco: true }), listarLineas(env.CRM_DB, { fresco: true })]);
  // Cuántos chats tiene cada producto (para el panel del admin).
  let conteo = {};
  try {
    const { results } = await env.CRM_DB.prepare(
      "SELECT producto_id, COUNT(*) AS chats FROM conversations WHERE producto_id IS NOT NULL GROUP BY producto_id"
    ).all();
    conteo = Object.fromEntries(results.map((r) => [r.producto_id, r.chats]));
  } catch { /* sin la migración */ }
  return json({
    productos: productos.map((p) => ({ ...p, chats: conteo[p.id] || 0 })),
    // El token no sale: solo el nombre del secreto.
    lineas: lineas.map((l) => ({ ...l })),
    principal: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID, nombre: "Tarot Store (principal)" }
  });
}

async function post({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo un administrador puede crear productos." }, 403);
  const p = await leer(request);
  if (!p) return json({ error: "Solicitud inválida." }, 400);
  const c = camposProducto(p);
  if (!c.nombre) return json({ error: "Ponle un nombre al producto." }, 400);
  const cols = Object.keys(c);
  const creado = await env.CRM_DB.prepare(
    `INSERT INTO productos (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`
  ).bind(...cols.map((k) => c[k])).first();
  olvidarProductos();
  return json({ producto: creado });
}

async function patch({ request, env, agent }) {
  const p = await leer(request);
  if (!p) return json({ error: "Solicitud inválida." }, 400);

  // El producto de un chat, a mano (cualquiera del equipo).
  if (p.conversation_id) {
    const conversationId = Number(p.conversation_id);
    const productoId = Number(p.producto_id) || null;
    await env.CRM_DB.prepare("UPDATE conversations SET producto_id = ?, producto_origen = ? WHERE id = ?")
      .bind(productoId, productoId ? "manual" : null, conversationId).run();
    return json({ ok: true, producto_id: productoId });
  }

  if (!esAdmin(agent)) return json({ error: "Solo un administrador puede editar productos." }, 403);
  const id = Number(p.id);
  if (!id) return json({ error: "Falta id." }, 400);
  const c = camposProducto(p);
  if (c.nombre === null) return json({ error: "El nombre no puede quedar vacío." }, 400);
  const cols = Object.keys(c);
  if (!cols.length) return json({ error: "Nada que cambiar." }, 400);
  const editado = await env.CRM_DB.prepare(
    `UPDATE productos SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ? RETURNING *`
  ).bind(...cols.map((k) => c[k]), id).first();
  olvidarProductos();
  return editado ? json({ producto: editado }) : json({ error: "Producto no encontrado." }, 404);
}

async function del({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo un administrador puede quitar productos." }, 403);
  const p = await leer(request);
  const id = Number(p?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  await env.CRM_DB.prepare("UPDATE productos SET activo = 0 WHERE id = ?").bind(id).run();
  olvidarProductos();
  return json({ ok: true });
}

/* ---------- Líneas (números de WhatsApp) ---------- */

function camposLinea(p) {
  const c = {
    nombre: texto(p.nombre, 80),
    phone_number_id: p.phone_number_id === undefined ? undefined : String(p.phone_number_id || "").replace(/\D/g, "") || null,
    waba_id: p.waba_id === undefined ? undefined : String(p.waba_id || "").replace(/\D/g, "") || null,
    catalog_id: p.catalog_id === undefined ? undefined : String(p.catalog_id || "").replace(/\D/g, "") || null,
    // Solo el NOMBRE del secreto de Cloudflare (ej. WHATSAPP_TOKEN_MARCA2), nunca el token.
    token_var: p.token_var === undefined ? undefined : String(p.token_var || "").toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 60) || null,
    marca: texto(p.marca, 80),
    pixel_id: p.pixel_id === undefined ? undefined : String(p.pixel_id || "").replace(/\D/g, "") || null,
    activa: p.activa === undefined ? undefined : p.activa ? 1 : 0
  };
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));
}

async function postLinea({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo un administrador puede agregar números." }, 403);
  const p = await leer(request);
  if (!p) return json({ error: "Solicitud inválida." }, 400);
  const c = camposLinea(p);
  if (!c.nombre || !c.phone_number_id) return json({ error: "Falta el nombre o el Phone number ID." }, 400);
  if (c.phone_number_id === String(env.WHATSAPP_PHONE_NUMBER_ID)) return json({ error: "Ese es el número principal (Tarot Store): ya está conectado." }, 400);
  const cols = Object.keys(c);
  try {
    const creada = await env.CRM_DB.prepare(
      `INSERT INTO lineas (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`
    ).bind(...cols.map((k) => c[k])).first();
    olvidarLineas();
    return json({ linea: creada });
  } catch (err) {
    return json({ error: /UNIQUE/.test(err.message) ? "Ese número ya está registrado." : err.message }, 400);
  }
}

async function patchLinea({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo un administrador puede editar números." }, 403);
  const p = await leer(request);
  const id = Number(p?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  const c = camposLinea(p);
  const cols = Object.keys(c);
  if (!cols.length) return json({ error: "Nada que cambiar." }, 400);
  const editada = await env.CRM_DB.prepare(
    `UPDATE lineas SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ? RETURNING *`
  ).bind(...cols.map((k) => c[k]), id).first();
  olvidarLineas();
  return editada ? json({ linea: editada }) : json({ error: "Número no encontrado." }, 404);
}

/**
 * GET /api/crm/lineas?conectar=<id> (admin): suscribe la app de Tarot Store
 * (la del WHATSAPP_TOKEN de siempre, cuyos avisos ya llegan al CRM) a la
 * cuenta de WhatsApp de esa línea, y devuelve lo que contesta Meta. Sirve
 * cuando la app propia de la marca no entrega los mensajes.
 */
async function getLinea({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo un administrador." }, 403);
  const id = Number(new URL(request.url).searchParams.get("conectar"));
  const linea = (await listarLineas(env.CRM_DB, { fresco: true })).find((l) => l.id === id);
  if (!linea?.waba_id) return json({ error: "Esa línea no existe o no tiene WABA." }, 400);
  const graph = `https://graph.facebook.com/v23.0/${linea.waba_id}/subscribed_apps`;
  const auth = { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` };
  const suscribir = await fetch(graph, { method: "POST", headers: auth }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  const apps = await fetch(graph, { headers: auth }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  return json({ linea: linea.nombre, waba: linea.waba_id, suscribir, apps });
}

export const onRequestGet = conAuth(get);
export const onRequestGetLinea = conAuth(getLinea);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
export const onRequestDelete = conAuth(del);
export const onRequestPostLinea = conAuth(postLinea);
export const onRequestPatchLinea = conAuth(patchLinea);
