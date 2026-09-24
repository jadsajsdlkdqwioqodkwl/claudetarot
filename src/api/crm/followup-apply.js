/**
 * POST /api/crm/followup-apply — { conversation_id, sequence_id } o { conversation_ids: [...], sequence_id }
 *
 * Programa de una vez todos los pasos de una secuencia de seguimiento —
 * en un solo chat, o en varios a la vez (selección múltiple desde la
 * lista): el primer paso se manda `delay_minutes` después de ahora, el
 * segundo `delay_minutes` después del primero, y así, POR CADA chat — se
 * acumulan para sacar el send_at real de cada uno.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { programarSecuenciaSeguimiento, obtenerAjuste, cancelarSeguimientosDeLead, origenSeguimientoLead } from "../../lib/crm-db.js";

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

  const sequenceId = Number(payload?.sequence_id);
  if (!sequenceId) return json({ error: "Falta sequence_id." }, 400);

  const conversationIds = Array.isArray(payload?.conversation_ids)
    ? [...new Set(payload.conversation_ids.map(Number).filter(Boolean))]
    : payload?.conversation_id ? [Number(payload.conversation_id)] : [];
  if (!conversationIds.length) return json({ error: "Falta conversation_id o conversation_ids." }, 400);

  const { results: existentes } = await env.CRM_DB.prepare(
    `SELECT id FROM conversations WHERE id IN (${conversationIds.map(() => "?").join(",")})`
  ).bind(...conversationIds).all();
  if (!existentes.length) return json({ error: "Ninguna de esas conversaciones existe." }, 404);

  const pasoUno = await env.CRM_DB.prepare("SELECT id FROM followup_sequence_steps WHERE sequence_id = ? LIMIT 1").bind(sequenceId).first();
  if (!pasoUno) return json({ error: "Esa secuencia todavía no tiene pasos." }, 400);

  const nombre = agent?.displayName || agent?.username || null;
  // La secuencia de leads (la de "tras no respuesta") se marca como tal —
  // así nuestros mensajes la cancelan — y reemplaza a la que ya hubiera
  // pendiente en ese chat en vez de duplicarse.
  const secuenciaLeads = Number(await obtenerAjuste(env.CRM_DB, "ad_followup_sequence_id")) || null;
  const esLead = sequenceId === secuenciaLeads;
  const createdBy = esLead ? origenSeguimientoLead(nombre) : nombre;
  let pasosProgramados = 0;
  for (const conv of existentes) {
    if (esLead) await cancelarSeguimientosDeLead(env.CRM_DB, conv.id);
    pasosProgramados += await programarSecuenciaSeguimiento(env.CRM_DB, conv.id, sequenceId, createdBy);
  }

  return json({ ok: true, chats_aplicados: existentes.length, pasos_programados: pasosProgramados });
}

export const onRequestPost = conAuth(post);
