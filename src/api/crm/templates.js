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

import { programarPlan } from "../../lib/planes-plantilla.js";
import { textoParaChat } from "../../lib/plantillas-propuestas.js";
import { obtenerAjuste, guardarAjuste } from "../../lib/crm-db.js";
import { conAuth } from "../../lib/crm-auth.js";
import { listarTemplates, enviarTemplate } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente, cancelarSeguimientosDeLead } from "../../lib/crm-db.js";
import { pausaEnvio, mandarConEscribiendo } from "../../lib/crm-send.js";
import { envDeConversacion } from "../../lib/lineas.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ request, env: envBase }) {
  // Con ?conversation_id= las plantillas de la cuenta (WABA) del número de ese chat.
  const conversationId = Number(new URL(request.url).searchParams.get("conversation_id")) || null;
  const env = await envDeConversacion(envBase, conversationId);
  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) return json({ error: "Falta WHATSAPP_BUSINESS_ACCOUNT_ID." }, 503);
  try {
    const templates = await listarTemplates(env);
    let orden = [];
    try { orden = JSON.parse((await obtenerAjuste(envBase.CRM_DB, "plantillas_orden")) || "[]") || []; } catch { /* sin orden guardado */ }
    return json({ templates, orden });
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
    await pausaEnvio(env, conversationId);
    const waMessageId = await mandarConEscribiendo(env, conversationId, (e) => enviarTemplate(e, conv.wa_id, name, language, parametros));
    await registrarMensajeSaliente(env.CRM_DB, conversationId, {
      waMessageId,
      type: "template",
      body: await textoParaChat(env, name, parametros),
      sentBy: agent?.displayName || agent?.username || null
    });
    await cancelarSeguimientosDeLead(env.CRM_DB, conversationId);
    // El aviso de envío de Shalom ya fue: quedan programados los 3 recordatorios de recojo (4, 7 y 21 días
    // desde hoy). Si el cliente responde se vuelven a contar desde su mensaje (rearmarPlanShalom).
    let plan = null;
    if (name.includes("aviso_envio_shalom")) {
      plan = await programarPlan(env, conversationId, "shalom", { estado: "pendiente", quien: agent?.displayName || agent?.username || "Aviso de envío" })
        .catch((err) => ({ error: err.message }));
    }
    return json({ ok: true, wa_message_id: waMessageId, plan_recojo: plan && !plan.error ? plan.pasos.length : 0 });
  } catch (err) {
    console.error("Enviar template:", err.message);
    return json({ error: `WhatsApp rechazó la plantilla: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(get);
// PATCH { orden: [nombres] } — el orden en que el equipo ve las plantillas al mandarlas (se arrastran).
async function patch({ request, env }) {
  const p = await request.json().catch(() => null);
  const orden = (Array.isArray(p?.orden) ? p.orden : []).map(String).slice(0, 300);
  if (!orden.length) return json({ error: "Falta el orden." }, 400);
  await guardarAjuste(env.CRM_DB, "plantillas_orden", JSON.stringify(orden));
  return json({ ok: true });
}

export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
