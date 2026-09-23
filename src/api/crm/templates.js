/**
 * GET  /api/crm/templates — TODOS los Message Templates de la cuenta, con su
 *      status real (APPROVED/PENDING/REJECTED) — antes solo devolvía los
 *      aprobados y sin decir por qué faltaba el resto, así que uno recién
 *      creado (todavía en revisión de Meta) parecía simplemente no existir.
 * POST /api/crm/templates — { conversation_id, name, language, parameters? }
 *      manda un template — el único tipo de mensaje válido con alguien que
 *      no escribió en las últimas 24h.
 *
 * Cobra según categoría (marketing siempre, utility/authentication solo
 * fuera de ventana) salvo que caiga dentro del free entry point de 72h de
 * un anuncio. Un botón de quick-reply en la plantilla es la forma de que,
 * en cuanto el cliente lo toque, se reabran 24h gratis. Ver
 * docs/whatsapp-ventanas-y-costos.md.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { listarTemplates, enviarTemplate } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente, cancelarSeguimientosPendientes } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) return json({ error: "Falta WHATSAPP_BUSINESS_ACCOUNT_ID." }, 503);
  try {
    const templates = await listarTemplates(env);
    return json({ templates });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  const name = String(payload?.name || "");
  const language = String(payload?.language || "es");
  const parametros = Array.isArray(payload?.parameters) ? payload.parameters.map(String) : [];

  if (!conversationId || !name) return json({ error: "Falta conversation_id o name." }, 400);

  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  )
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  try {
    const waMessageId = await enviarTemplate(env, conv.wa_id, name, language, parametros);
    await registrarMensajeSaliente(env.CRM_DB, conversationId, {
      waMessageId,
      type: "template",
      body: `Plantilla: ${name}`,
      sentBy: agent?.displayName || agent?.username || null
    });
    await cancelarSeguimientosPendientes(env.CRM_DB, conversationId);
    return json({ ok: true, wa_message_id: waMessageId });
  } catch (err) {
    console.error("Enviar template:", err.message);
    return json({ error: `WhatsApp rechazó la plantilla: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
