/**
 * GET  /api/crm/messages?conversation_id=1 — historial de una conversación,
 *      y de paso la marca como leída (unread_count a 0).
 * POST /api/crm/messages — { conversation_id, body } → manda el texto por la
 *      WhatsApp Cloud API y lo guarda como saliente.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { enviarTexto } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ request, env }) {
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const { results } = await env.CRM_DB.prepare(
    `SELECT id, direction, type, body, media_id, media_mime, status, created_at
     FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 500`
  )
    .bind(conversationId)
    .all();

  await env.CRM_DB.prepare("UPDATE conversations SET unread_count = 0 WHERE id = ?")
    .bind(conversationId)
    .run();

  return json({ messages: results });
}

async function post({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  const texto = String(payload?.body || "").trim();
  if (!conversationId || !texto) return json({ error: "Falta conversation_id o body." }, 400);
  if (texto.length > 4096) return json({ error: "El mensaje es demasiado largo." }, 413);

  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  )
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return json({ error: "El envío por WhatsApp no está configurado (faltan credenciales)." }, 503);
  }

  let waMessageId;
  try {
    waMessageId = await enviarTexto(env, conv.wa_id, texto);
  } catch (err) {
    console.error("Enviar WhatsApp:", err.message);
    return json({ error: `WhatsApp rechazó el mensaje: ${err.message}` }, 502);
  }

  await registrarMensajeSaliente(env.CRM_DB, conversationId, { waMessageId, type: "text", body: texto });

  return json({ ok: true, wa_message_id: waMessageId });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
