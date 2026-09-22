/**
 * POST /api/crm/react — { message_id, emoji } → reacciona a ese mensaje (de
 * cualquiera de los dos lados) con un emoji. Manda { emoji: null } (o "")
 * para quitar la reacción que ya habíamos puesto.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { mandarReaccion } from "../../lib/crm-send.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const messageId = Number(payload?.message_id);
  if (!messageId) return json({ error: "Falta message_id." }, 400);
  const emoji = payload?.emoji ? String(payload.emoji).trim().slice(0, 8) : null;

  const mensaje = await env.CRM_DB.prepare(
    `SELECT m.id, m.wa_message_id, c.wa_id
     FROM messages m
     JOIN conversations conv ON conv.id = m.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     WHERE m.id = ?`
  )
    .bind(messageId)
    .first();
  if (!mensaje) return json({ error: "Mensaje no encontrado." }, 404);
  if (!mensaje.wa_message_id) return json({ error: "Este mensaje todavía no tiene confirmación de WhatsApp — espera un segundo e intenta de nuevo." }, 409);

  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return json({ error: "El envío por WhatsApp no está configurado (faltan credenciales)." }, 503);
  }

  try {
    await mandarReaccion(env, mensaje.wa_id, mensaje, emoji);
    return json({ ok: true });
  } catch (err) {
    return json({ error: `WhatsApp rechazó la reacción: ${err.message}` }, 502);
  }
}

export const onRequestPost = conAuth(post);
