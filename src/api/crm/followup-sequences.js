/**
 * Secuencias de seguimiento reutilizables: varios mensajes con un tiempo de
 * espera entre uno y otro (ej. "1 hora después", "1 día después"), armadas
 * una vez y aplicables a cualquier chat con un clic desde el panel de
 * seguimientos programados. Compartidas entre vendedores, igual que las
 * respuestas rápidas.
 *
 * GET    /api/crm/followup-sequences — todas, con sus pasos en orden
 * POST   /api/crm/followup-sequences — { title } → crea una secuencia vacía
 *                                       { sequence_id, body?, media_key?, media_type?, media_mime?, delay_minutes } → agrega un paso al final
 * DELETE /api/crm/followup-sequences — { sequence_id } → borra la secuencia entera
 *                                       { step_id } → borra un solo paso
 * PATCH  /api/crm/followup-sequences — { step_id, direction: "up"|"down" } → reordena un paso
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const TIPOS_MEDIA = new Set(["image", "video", "document", "sticker"]);

async function get({ env }) {
  const { results: secuencias } = await env.CRM_DB.prepare(
    "SELECT id, title, created_at FROM followup_sequences ORDER BY created_at ASC"
  ).all();
  const { results: pasos } = await env.CRM_DB.prepare(
    "SELECT * FROM followup_sequence_steps ORDER BY sequence_id ASC, step_order ASC"
  ).all();

  const porSecuencia = {};
  for (const p of pasos) (porSecuencia[p.sequence_id] ||= []).push(p);

  return json({ sequences: secuencias.map((s) => ({ ...s, steps: porSecuencia[s.id] || [] })) });
}

async function post({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const sequenceId = payload?.sequence_id ? Number(payload.sequence_id) : null;

  // Agregar un paso a una secuencia ya existente.
  if (sequenceId) {
    const body = payload?.body ? String(payload.body).trim().slice(0, 4096) : null;
    const mediaKey = payload?.media_key ? String(payload.media_key) : null;
    const mediaType = mediaKey ? (TIPOS_MEDIA.has(payload?.media_type) ? payload.media_type : "image") : null;
    const mediaMime = mediaKey && payload?.media_mime ? String(payload.media_mime) : null;
    const delayMinutes = Math.max(1, Number(payload?.delay_minutes) || 60);

    if (!body && !mediaKey) return json({ error: "Necesita un texto o una foto/video." }, 400);

    const existe = await env.CRM_DB.prepare("SELECT id FROM followup_sequences WHERE id = ?").bind(sequenceId).first();
    if (!existe) return json({ error: "Esa secuencia no existe." }, 404);

    const max = await env.CRM_DB.prepare("SELECT COALESCE(MAX(step_order), 0) AS m FROM followup_sequence_steps WHERE sequence_id = ?")
      .bind(sequenceId)
      .first();
    const creado = await env.CRM_DB.prepare(
      `INSERT INTO followup_sequence_steps (sequence_id, step_order, body, media_key, media_type, media_mime, delay_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
      .bind(sequenceId, (max?.m || 0) + 1, body, mediaKey, mediaType, mediaMime, delayMinutes)
      .first();

    return json({ ok: true, step: creado });
  }

  // Crear una secuencia nueva (vacía, se le agregan pasos después).
  const title = String(payload?.title || "").trim().slice(0, 80);
  if (!title) return json({ error: "Falta un título." }, 400);

  const creada = await env.CRM_DB.prepare("INSERT INTO followup_sequences (title) VALUES (?) RETURNING *")
    .bind(title)
    .first();

  return json({ ok: true, sequence: { ...creada, steps: [] } });
}

async function del({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const stepId = payload?.step_id ? Number(payload.step_id) : null;
  const sequenceId = payload?.sequence_id ? Number(payload.sequence_id) : null;

  if (stepId) {
    const paso = await env.CRM_DB.prepare("SELECT media_key FROM followup_sequence_steps WHERE id = ?").bind(stepId).first();
    await env.CRM_DB.prepare("DELETE FROM followup_sequence_steps WHERE id = ?").bind(stepId).run();
    if (paso?.media_key && env.CRM_MEDIA) await env.CRM_MEDIA.delete(paso.media_key).catch(() => {});
    return json({ ok: true });
  }
  if (sequenceId) {
    const { results: pasos } = await env.CRM_DB.prepare("SELECT media_key FROM followup_sequence_steps WHERE sequence_id = ?")
      .bind(sequenceId)
      .all();
    await env.CRM_DB.prepare("DELETE FROM followup_sequence_steps WHERE sequence_id = ?").bind(sequenceId).run();
    await env.CRM_DB.prepare("DELETE FROM followup_sequences WHERE id = ?").bind(sequenceId).run();
    if (env.CRM_MEDIA) {
      for (const p of pasos) if (p.media_key) await env.CRM_MEDIA.delete(p.media_key).catch(() => {});
    }
    return json({ ok: true });
  }
  return json({ error: "Falta step_id o sequence_id." }, 400);
}

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const stepId = Number(payload?.step_id);
  const direction = payload?.direction;
  if (!stepId || !["up", "down"].includes(direction)) return json({ error: "Falta step_id o direction." }, 400);

  const actual = await env.CRM_DB.prepare("SELECT * FROM followup_sequence_steps WHERE id = ?").bind(stepId).first();
  if (!actual) return json({ error: "No encontrado." }, 404);

  const vecino = await env.CRM_DB.prepare(
    `SELECT * FROM followup_sequence_steps WHERE sequence_id = ? AND step_order ${direction === "up" ? "<" : ">"} ?
     ORDER BY step_order ${direction === "up" ? "DESC" : "ASC"} LIMIT 1`
  )
    .bind(actual.sequence_id, actual.step_order)
    .first();
  if (!vecino) return json({ ok: true });

  await env.CRM_DB.batch([
    env.CRM_DB.prepare("UPDATE followup_sequence_steps SET step_order = ? WHERE id = ?").bind(vecino.step_order, actual.id),
    env.CRM_DB.prepare("UPDATE followup_sequence_steps SET step_order = ? WHERE id = ?").bind(actual.step_order, vecino.id)
  ]);

  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestDelete = conAuth(del);
export const onRequestPatch = conAuth(patch);
