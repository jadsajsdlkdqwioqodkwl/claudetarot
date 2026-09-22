/**
 * GET    /api/crm/welcome-sequence — la secuencia completa, en orden, con los datos de cada respuesta rápida
 * POST   /api/crm/welcome-sequence — { quick_reply_id } → la agrega al final. Solo admin.
 * DELETE /api/crm/welcome-sequence — { id } → la saca de la secuencia. Solo admin.
 * PATCH  /api/crm/welcome-sequence — { id, direction: "up"|"down" } → la mueve. Solo admin.
 */

import { conAuth, conAdmin } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.id, s.step_order, q.id AS quick_reply_id, q.title, q.body
     FROM welcome_sequence s JOIN quick_replies q ON q.id = s.quick_reply_id
     ORDER BY s.step_order ASC`
  ).all();

  const { results: media } = await env.CRM_DB.prepare("SELECT * FROM quick_reply_media ORDER BY sort_order ASC").all();
  const porRapida = {};
  for (const m of media) (porRapida[m.quick_reply_id] ||= []).push(m);

  return json({ steps: results.map((s) => ({ ...s, media: porRapida[s.quick_reply_id] || [] })) });
}

async function post({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const quickReplyId = Number(payload?.quick_reply_id);
  if (!quickReplyId) return json({ error: "Falta quick_reply_id." }, 400);

  const existe = await env.CRM_DB.prepare("SELECT id FROM quick_replies WHERE id = ?").bind(quickReplyId).first();
  if (!existe) return json({ error: "Esa respuesta rápida no existe." }, 404);

  const max = await env.CRM_DB.prepare("SELECT COALESCE(MAX(step_order), 0) AS m FROM welcome_sequence").first();
  await env.CRM_DB.prepare("INSERT INTO welcome_sequence (quick_reply_id, step_order) VALUES (?, ?)")
    .bind(quickReplyId, (max?.m || 0) + 1)
    .run();

  return json({ ok: true });
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
  await env.CRM_DB.prepare("DELETE FROM welcome_sequence WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const id = Number(payload?.id);
  const direction = payload?.direction;
  if (!id || !["up", "down"].includes(direction)) return json({ error: "Falta id o direction." }, 400);

  const actual = await env.CRM_DB.prepare("SELECT * FROM welcome_sequence WHERE id = ?").bind(id).first();
  if (!actual) return json({ error: "No encontrado." }, 404);

  const vecino = await env.CRM_DB.prepare(
    `SELECT * FROM welcome_sequence WHERE step_order ${direction === "up" ? "<" : ">"} ?
     ORDER BY step_order ${direction === "up" ? "DESC" : "ASC"} LIMIT 1`
  )
    .bind(actual.step_order)
    .first();
  if (!vecino) return json({ ok: true }); // ya está en la punta, no hay nada que mover

  await env.CRM_DB.batch([
    env.CRM_DB.prepare("UPDATE welcome_sequence SET step_order = ? WHERE id = ?").bind(vecino.step_order, actual.id),
    env.CRM_DB.prepare("UPDATE welcome_sequence SET step_order = ? WHERE id = ?").bind(actual.step_order, vecino.id)
  ]);

  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAdmin(post);
export const onRequestDelete = conAdmin(del);
export const onRequestPatch = conAdmin(patch);
