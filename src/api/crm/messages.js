/**
 * GET  /api/crm/messages?conversation_id=1 — historial de una conversación,
 *      y de paso la marca como leída (unread_count a 0).
 * POST /api/crm/messages — manda un mensaje y lo guarda como saliente:
 *      texto:  { conversation_id, body }
 *      media:  { conversation_id, media_key, media_type, caption? } — el
 *              media_key sale de /api/crm/upload-media
 */

import { conAuth } from "../../lib/crm-auth.js";
import { mandarTexto, mandarMediaGuardada } from "../../lib/crm-send.js";
import { cancelarSeguimientosPendientes } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const TIPOS_MEDIA = new Set(["image", "video", "document"]);

const PAGINA = 50;

/**
 * Sin `before_id`: los últimos 50 mensajes (los más recientes), en orden
 * cronológico. Con `before_id`: los 50 anteriores a ese id — así el chat no
 * carga cientos de mensajes de una vez ni crece sin límite en el navegador;
 * el botón "Cargar mensajes anteriores" va pidiendo de a tandas hacia arriba.
 */
async function get({ request, env }) {
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const beforeId = Number(url.searchParams.get("before_id")) || null;

  const { results } = await env.CRM_DB.prepare(
    `SELECT id, direction, type, body, media_id, media_key, media_mime, status, sent_by, created_at
     FROM messages WHERE conversation_id = ? ${beforeId ? "AND id < ?" : ""}
     ORDER BY id DESC LIMIT ?`
  )
    .bind(...(beforeId ? [conversationId, beforeId, PAGINA] : [conversationId, PAGINA]))
    .all();

  results.reverse();

  if (!beforeId) {
    await env.CRM_DB.prepare("UPDATE conversations SET unread_count = 0 WHERE id = ?")
      .bind(conversationId)
      .run();
  }

  const hayMas = results.length === PAGINA;
  return json({ messages: results, hay_mas: hayMas });
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  )
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return json({ error: "El envío por WhatsApp no está configurado (faltan credenciales)." }, 503);
  }

  const mediaKey = payload?.media_key ? String(payload.media_key) : null;
  const sentBy = agent?.displayName || agent?.username || null;

  try {
    if (mediaKey) {
      const type = TIPOS_MEDIA.has(payload?.media_type) ? payload.media_type : "document";
      if (!env.CRM_MEDIA) return json({ error: "Almacenamiento no configurado." }, 503);
      const caption = String(payload?.caption || "").slice(0, 1024) || undefined;
      const fileName = String(payload?.file_name || "").slice(0, 200) || undefined;
      const waMessageId = await mandarMediaGuardada(env, conversationId, conv.wa_id, mediaKey, type, caption, sentBy, fileName);
      await cancelarSeguimientosPendientes(env.CRM_DB, conversationId);
      return json({ ok: true, wa_message_id: waMessageId });
    }

    const texto = String(payload?.body || "").trim();
    if (!texto) return json({ error: "Falta body o media_key." }, 400);
    if (texto.length > 4096) return json({ error: "El mensaje es demasiado largo." }, 413);
    const waMessageId = await mandarTexto(env, conversationId, conv.wa_id, texto, sentBy);
    await cancelarSeguimientosPendientes(env.CRM_DB, conversationId);
    return json({ ok: true, wa_message_id: waMessageId });
  } catch (err) {
    console.error("Enviar WhatsApp:", err.message);
    return json({ error: `WhatsApp rechazó el mensaje: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
