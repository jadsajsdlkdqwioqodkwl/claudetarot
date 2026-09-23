/**
 * POST /api/crm/welcome-send — { conversation_id, step_ids?: number[] } → cualquier vendedor.
 *
 * Manda a mano, desde el panel derecho del chat, los pasos de la bienvenida
 * de anuncios (los que armó el admin) — todos, o solo los elegidos, en el
 * orden configurado. Sirve para leads que llegaron sin disparar la
 * bienvenida automática (escribieron por otro lado, o antes de armarla).
 *
 * No cancela los seguimientos programados: la bienvenida es parte del
 * mismo embudo que el seguimiento para leads, no una respuesta a mano.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { mandarSecuenciaBienvenida } from "../../lib/crm-welcome-sequence.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const stepIds = Array.isArray(payload?.step_ids)
    ? [...new Set(payload.step_ids.map(Number).filter(Boolean))]
    : null;
  if (stepIds && !stepIds.length) return json({ error: "Elige al menos un paso." }, 400);

  const conv = await env.CRM_DB.prepare(
    "SELECT conv.id, c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
  )
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return json({ error: "El envío por WhatsApp no está configurado (faltan credenciales)." }, 503);
  }

  try {
    const cantidad = await mandarSecuenciaBienvenida(env, conv.id, conv.wa_id, agent?.displayName || agent?.username || null, stepIds);
    if (!cantidad) return json({ error: "Todavía no hay pasos de bienvenida armados." }, 400);
    return json({ ok: true, pasos_mandados: cantidad });
  } catch (err) {
    return json({ error: `WhatsApp rechazó el envío: ${err.message}` }, 502);
  }
}

export const onRequestPost = conAuth(post);
