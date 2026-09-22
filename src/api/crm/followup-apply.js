/**
 * POST /api/crm/followup-apply — { conversation_id, sequence_id }
 *
 * Programa de una vez todos los pasos de una secuencia de seguimiento en esa
 * conversación: el primer paso se manda `delay_minutes` después de ahora, el
 * segundo `delay_minutes` después del primero, y así — se acumulan para
 * sacar el send_at real de cada uno.
 */

import { conAuth } from "../../lib/crm-auth.js";

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
  const sequenceId = Number(payload?.sequence_id);
  if (!conversationId || !sequenceId) return json({ error: "Falta conversation_id o sequence_id." }, 400);

  const conv = await env.CRM_DB.prepare("SELECT id FROM conversations WHERE id = ?").bind(conversationId).first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  const { results: pasos } = await env.CRM_DB.prepare(
    "SELECT * FROM followup_sequence_steps WHERE sequence_id = ? ORDER BY step_order ASC"
  )
    .bind(sequenceId)
    .all();
  if (!pasos.length) return json({ error: "Esa secuencia todavía no tiene pasos." }, 400);

  const createdBy = agent?.displayName || agent?.username || null;
  const ahora = Date.now();
  let acumuladoMs = 0;
  const inserts = pasos.map((p) => {
    acumuladoMs += p.delay_minutes * 60 * 1000;
    const sendAt = new Date(ahora + acumuladoMs).toISOString();
    return env.CRM_DB.prepare(
      `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, media_key, media_type, media_mime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(conversationId, p.body, sendAt, createdBy, p.media_key, p.media_type, p.media_mime);
  });

  await env.CRM_DB.batch(inserts);

  return json({ ok: true, pasos_programados: pasos.length });
}

export const onRequestPost = conAuth(post);
