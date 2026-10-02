/**
 * GET    /api/crm/scheduled?conversation_id=1 — seguimientos programados de esa conversación (pendientes primero)
 * POST   /api/crm/scheduled — programa uno:
 *      { conversation_id, send_at, body?, quick_reply_id? } — texto o una respuesta rápida guardada
 *      { conversation_id, send_at, body?, media_key, media_type, media_mime? } — con foto/video propio (de /api/crm/upload-media)
 *      + catalogo? ("*" = catálogo completo, o el retailer_id de un producto) y catalogo_nombre?
 *      + mandar_siempre? — true: sale aunque el cliente o nosotros escribamos antes
 *      + botones? — hasta 3 textos (máx. 20 caracteres) que salen como botones de opciones debajo del texto
 *      { conversation_id, send_at, template_name, template_language?, template_params? } — una plantilla
 *        aprobada: puede caer fuera de la ventana de 24 h (ahí es lo único que WhatsApp acepta)
 * PATCH  /api/crm/scheduled — { id, send_at?, body?, mandar_siempre?, botones? } → edita un pendiente de texto libre
 *      (los que llevan quick_reply_id o media_key propia no se editan acá — cancélalo y
 *      programa uno nuevo, cambiar el contenido de esos no es una edición simple)
 * DELETE /api/crm/scheduled — { id } → cancela uno pendiente
 *                              { conversation_id, all: true } → cancela todos los pendientes de ese chat
 *
 * Sin plantilla, la fecha no puede pasar de 24 h desde el último mensaje del
 * cliente (fueraDeVentana): después WhatsApp ya no acepta texto libre. Para
 * un seguimiento que caerá fuera de la ventana (típico de provincia, cobro
 * días después), prográmalo como plantilla. Las plantillas cobran según su
 * categoría: ver docs/whatsapp-ventanas-y-costos.md.
 */

import { textoPorDefectoSql } from "../../lib/crm-variantes.js";
import { conAuth } from "../../lib/crm-auth.js";
import { leerCatalogo, leerBotones, leerPlantilla, cancelarSeguimientosDeLead } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const TIPOS_MEDIA = new Set(["image", "video", "document", "sticker"]);

/**
 * WhatsApp solo acepta texto libre hasta 24 h después del último mensaje
 * del cliente: un seguimiento programado más tarde nunca llegaría.
 * Devuelve el error a mostrar, o null si la fecha entra en la ventana.
 */
export async function fueraDeVentana(db, conversationId, sendAt) {
  const conv = await db.prepare("SELECT last_inbound_at FROM conversations WHERE id = ?").bind(conversationId).first();
  if (!conv?.last_inbound_at) return "El cliente todavía no escribió: WhatsApp no deja mandarle un seguimiento.";
  const limite = new Date(conv.last_inbound_at.replace(" ", "T") + "Z").getTime() + 24 * 3600 * 1000;
  if (limite <= Date.now()) return "Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp ya no deja mandarle un seguimiento.";
  if (sendAt.getTime() > limite) return "Tiene que salir antes de que se cumplan 24 h desde el último mensaje del cliente.";
  return null;
}

async function get({ request, env }) {
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const { results } = await env.CRM_DB.prepare(
    `SELECT s.*, q.title AS quick_reply_title, ${textoPorDefectoSql("rapida")} AS quick_reply_body
     FROM scheduled_messages s LEFT JOIN quick_replies q ON q.id = s.quick_reply_id
     WHERE s.conversation_id = ? AND s.status = 'pendiente'
     ORDER BY s.send_at ASC`
  )
    .bind(conversationId)
    .all();

  return json({ scheduled: results });
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  const sendAt = payload?.send_at ? new Date(payload.send_at) : null;
  const body = payload?.body ? String(payload.body).trim().slice(0, 4096) : null;
  const quickReplyId = payload?.quick_reply_id ? Number(payload.quick_reply_id) : null;
  const mediaKey = payload?.media_key ? String(payload.media_key) : null;
  const mediaType = mediaKey ? (TIPOS_MEDIA.has(payload?.media_type) ? payload.media_type : "image") : null;
  const mediaMime = mediaKey && payload?.media_mime ? String(payload.media_mime) : null;

  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);
  if (!sendAt || Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    return json({ error: "La fecha tiene que ser futura." }, 422);
  }
  const { templateName, templateLanguage, templateParams } = leerPlantilla(payload);
  if (templateName) return programarPlantilla(env, agent, conversationId, sendAt, templateName, templateLanguage, templateParams, payload);

  const { catalogo, catalogoNombre } = leerCatalogo(payload);
  const botones = leerBotones(payload);
  if (!body && !quickReplyId && !mediaKey && !catalogo) return json({ error: "Necesita un texto, una foto/video, una respuesta rápida o el catálogo." }, 400);
  if (botones && !body) return json({ error: "Los botones van debajo de un texto: escribe el mensaje." }, 400);
  if (botones && catalogo) return json({ error: "El catálogo no puede llevar botones de opciones." }, 400);
  if (botones && body.length > 1024) return json({ error: "Con botones, el texto puede tener hasta 1024 caracteres." }, 400);
  const errorVentana = await fueraDeVentana(env.CRM_DB, conversationId, sendAt);
  if (errorVentana) return json({ error: errorVentana }, 422);

  // El mismo texto ya programado para este chat (doble toque, o dos personas
  // a la vez): no se programa dos veces.
  if (body) {
    const igual = await env.CRM_DB.prepare(
      "SELECT 1 FROM scheduled_messages WHERE conversation_id = ? AND status = 'pendiente' AND body = ? LIMIT 1"
    ).bind(conversationId, body).first();
    if (igual) return json({ error: "Ese mismo mensaje ya está programado para este chat." }, 409);
  }
  // Una sola cadena por chat: lo que programa una persona reemplaza a los
  // automáticos pendientes (bienvenida, respuesta rápida, sugerencias), que
  // si no se sumaban y el cliente recibía mensajes de más.
  await cancelarSeguimientosDeLead(env.CRM_DB, conversationId);

  const creado = await env.CRM_DB.prepare(
    `INSERT INTO scheduled_messages (conversation_id, body, quick_reply_id, send_at, created_by, media_key, media_type, media_mime, catalogo, catalogo_nombre, mandar_siempre, botones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(conversationId, body, quickReplyId, sendAt.toISOString(), agent?.displayName || agent?.username || null, mediaKey, mediaType, mediaMime, catalogo, catalogoNombre, payload?.mandar_siempre ? 1 : 0, botones)
    .first();

  return json({ ok: true, scheduled: creado });
}

/**
 * Plantilla programada: sin límite de 24 h (es lo único que WhatsApp acepta
 * fuera de la ventana). Solo hace falta que el chat tenga un número.
 */
async function programarPlantilla(env, agent, conversationId, sendAt, templateName, templateLanguage, templateParams, payload) {
  const conv = await env.CRM_DB.prepare("SELECT id FROM conversations WHERE id = ?").bind(conversationId).first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);
  const igual = await env.CRM_DB.prepare(
    "SELECT 1 FROM scheduled_messages WHERE conversation_id = ? AND status = 'pendiente' AND template_name = ? AND send_at = ? LIMIT 1"
  ).bind(conversationId, templateName, sendAt.toISOString()).first();
  if (igual) return json({ error: "Esa plantilla ya está programada para este chat a esa hora." }, 409);
  await cancelarSeguimientosDeLead(env.CRM_DB, conversationId);

  const creado = await env.CRM_DB.prepare(
    `INSERT INTO scheduled_messages (conversation_id, send_at, created_by, template_name, template_language, template_params, mandar_siempre)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(conversationId, sendAt.toISOString(), agent?.displayName || agent?.username || null, templateName, templateLanguage, templateParams, payload?.mandar_siempre ? 1 : 0)
    .first();
  return json({ ok: true, scheduled: creado });
}

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const id = Number(payload?.id);
  if (!id) return json({ error: "Falta id." }, 400);

  const actual = await env.CRM_DB.prepare("SELECT * FROM scheduled_messages WHERE id = ? AND status = 'pendiente'").bind(id).first();
  if (!actual) return json({ error: "No encontrado o ya no está pendiente." }, 404);
  if (actual.quick_reply_id || actual.media_key || actual.template_name || actual.catalogo) {
    return json({ error: "Este seguimiento no se puede editar — cancélalo y programa uno nuevo." }, 400);
  }

  const sendAt = payload?.send_at !== undefined ? new Date(payload.send_at) : new Date(actual.send_at);
  if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    return json({ error: "La fecha tiene que ser futura." }, 422);
  }
  const body = payload?.body !== undefined ? (String(payload.body).trim().slice(0, 4096) || null) : actual.body;
  if (!body) return json({ error: "Necesita un texto." }, 400);
  const errorVentana = await fueraDeVentana(env.CRM_DB, actual.conversation_id, sendAt);
  if (errorVentana) return json({ error: errorVentana }, 422);

  const mandarSiempre = payload?.mandar_siempre !== undefined ? (payload.mandar_siempre ? 1 : 0) : actual.mandar_siempre;
  const botones = payload?.botones !== undefined ? leerBotones(payload) : actual.botones;
  if (botones && body.length > 1024) return json({ error: "Con botones, el texto puede tener hasta 1024 caracteres." }, 400);
  await env.CRM_DB.prepare("UPDATE scheduled_messages SET body = ?, send_at = ?, mandar_siempre = ?, botones = ? WHERE id = ?")
    .bind(body, sendAt.toISOString(), mandarSiempre, botones, id)
    .run();

  return json({ ok: true });
}

async function del({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  // { conversation_id, all: true } → cancela todos los pendientes de ese chat de una.
  if (payload?.all && Number(payload?.conversation_id)) {
    const r = await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status = 'pendiente'")
      .bind(Number(payload.conversation_id))
      .run();
    return json({ ok: true, cancelados: r.meta?.changes ?? 0 });
  }

  const id = Number(payload?.id);
  if (!id) return json({ error: "Falta id." }, 400);

  await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE id = ? AND status = 'pendiente'")
    .bind(id)
    .run();
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
export const onRequestDelete = conAuth(del);
