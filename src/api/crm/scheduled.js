/**
 * GET    /api/crm/scheduled?conversation_id=1 — seguimientos programados de esa conversación (pendientes primero)
 * POST   /api/crm/scheduled — programa uno:
 *      { conversation_id, send_at, body?, quick_reply_id? } — texto o una respuesta rápida guardada
 *      { conversation_id, send_at, body?, media_key, media_type, media_mime? } — con foto/video propio (de /api/crm/upload-media)
 * DELETE /api/crm/scheduled — { id } → cancela uno pendiente
 *
 * Siempre texto libre — no acepta template_name (eso solo lo maneja
 * bulk-send.js). Para un seguimiento que sabes que caerá fuera de la
 * ventana de 24h/72h (típico de provincia, cobro días después), no uses
 * esto: usa bulk-send en modo plantilla o mándala a mano desde el chat,
 * o este seguimiento va a fallar en silencio en vez de llegar. Ver
 * docs/whatsapp-ventanas-y-costos.md.
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const TIPOS_MEDIA = new Set(["image", "video", "document", "sticker"]);

async function get({ request, env }) {
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const { results } = await env.CRM_DB.prepare(
    `SELECT s.*, q.title AS quick_reply_title
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
  if (!body && !quickReplyId && !mediaKey) return json({ error: "Necesita un texto, una foto/video o una respuesta rápida." }, 400);

  const creado = await env.CRM_DB.prepare(
    `INSERT INTO scheduled_messages (conversation_id, body, quick_reply_id, send_at, created_by, media_key, media_type, media_mime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(conversationId, body, quickReplyId, sendAt.toISOString(), agent?.displayName || agent?.username || null, mediaKey, mediaType, mediaMime)
    .first();

  return json({ ok: true, scheduled: creado });
}

async function del({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
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
export const onRequestDelete = conAuth(del);
