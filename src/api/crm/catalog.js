/**
 * GET  /api/crm/catalog?conversation_id=1 — pedidos armados desde el catálogo en esa conversación
 * POST /api/crm/catalog — { conversation_id, text? } → manda el botón "Ver catálogo"
 */

import { conAuth } from "../../lib/crm-auth.js";
import { enviarCatalogo } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ request, env }) {
  const conversationId = Number(new URL(request.url).searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const { results } = await env.CRM_DB.prepare(
    "SELECT * FROM catalog_orders WHERE conversation_id = ? ORDER BY id DESC"
  )
    .bind(conversationId)
    .all();

  return json({ orders: results.map((o) => ({ ...o, items: JSON.parse(o.items_json) })) });
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

  try {
    const waMessageId = await enviarCatalogo(env, conv.wa_id, payload?.text);
    await registrarMensajeSaliente(env.CRM_DB, conversationId, {
      waMessageId,
      type: "text",
      body: "[Catálogo enviado]",
      sentBy: agent?.displayName || agent?.username || null
    });
    return json({ ok: true, wa_message_id: waMessageId });
  } catch (err) {
    return json({ error: `WhatsApp rechazó el envío: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
