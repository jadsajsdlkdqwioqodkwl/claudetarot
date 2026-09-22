/**
 * Contenido y orden de la bienvenida de anuncios — todo admin-only, y ya no
 * depende de las "quick_replies" compartidas (que cualquier vendedor puede
 * crear/editar/borrar desde el chat). Cada paso es su propio registro, con
 * su propio texto y fotos/videos, cargado desde el modal de "Bienvenida de
 * anuncios" y de ningún otro lado.
 *
 * GET    /api/crm/welcome-sequence — todos los pasos, en orden, con su media
 * POST   /api/crm/welcome-sequence — { title, body?, media_keys? } → crea un paso nuevo al final
 * DELETE /api/crm/welcome-sequence — { id } → borra un paso (y su media de R2)
 * PATCH  /api/crm/welcome-sequence — { id, direction: "up"|"down" } → lo mueve
 */

import { conAuth, conAdmin } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const { results: pasos } = await env.CRM_DB.prepare(
    "SELECT id, title, body, step_order FROM welcome_steps ORDER BY step_order ASC"
  ).all();

  const { results: media } = await env.CRM_DB.prepare(
    "SELECT * FROM welcome_step_media ORDER BY sort_order ASC, id ASC"
  ).all();
  const porPaso = {};
  for (const m of media) (porPaso[m.welcome_step_id] ||= []).push(m);

  return json({ steps: pasos.map((p) => ({ ...p, media: porPaso[p.id] || [] })) });
}

async function post({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const title = String(payload?.title || "").trim().slice(0, 80);
  const body = String(payload?.body || "").trim().slice(0, 4096) || null;
  const mediaKeys = Array.isArray(payload?.media_keys) ? payload.media_keys.slice(0, 10) : [];

  if (!title) return json({ error: "Falta un título." }, 400);
  if (!body && !mediaKeys.length) return json({ error: "Necesita texto o al menos un archivo." }, 400);

  const max = await env.CRM_DB.prepare("SELECT COALESCE(MAX(step_order), 0) AS m FROM welcome_steps").first();
  const creado = await env.CRM_DB.prepare(
    "INSERT INTO welcome_steps (title, body, step_order) VALUES (?, ?, ?) RETURNING *"
  )
    .bind(title, body, (max?.m || 0) + 1)
    .first();

  let i = 0;
  for (const m of mediaKeys) {
    await env.CRM_DB.prepare(
      "INSERT INTO welcome_step_media (welcome_step_id, media_key, media_mime, media_type, sort_order) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(creado.id, String(m.media_key), m.media_mime ? String(m.media_mime) : null, String(m.media_type), i++)
      .run();
  }

  const media = await env.CRM_DB.prepare("SELECT * FROM welcome_step_media WHERE welcome_step_id = ? ORDER BY sort_order ASC")
    .bind(creado.id)
    .all();

  return json({ ok: true, step: { ...creado, media: media.results } });
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

  const { results: media } = await env.CRM_DB.prepare("SELECT media_key FROM welcome_step_media WHERE welcome_step_id = ?")
    .bind(id)
    .all();

  await env.CRM_DB.prepare("DELETE FROM welcome_step_media WHERE welcome_step_id = ?").bind(id).run();
  await env.CRM_DB.prepare("DELETE FROM welcome_steps WHERE id = ?").bind(id).run();

  if (env.CRM_MEDIA) {
    for (const m of media) await env.CRM_MEDIA.delete(m.media_key).catch(() => {});
  }

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

  const actual = await env.CRM_DB.prepare("SELECT * FROM welcome_steps WHERE id = ?").bind(id).first();
  if (!actual) return json({ error: "No encontrado." }, 404);

  const vecino = await env.CRM_DB.prepare(
    `SELECT * FROM welcome_steps WHERE step_order ${direction === "up" ? "<" : ">"} ?
     ORDER BY step_order ${direction === "up" ? "DESC" : "ASC"} LIMIT 1`
  )
    .bind(actual.step_order)
    .first();
  if (!vecino) return json({ ok: true }); // ya está en la punta, no hay nada que mover

  await env.CRM_DB.batch([
    env.CRM_DB.prepare("UPDATE welcome_steps SET step_order = ? WHERE id = ?").bind(vecino.step_order, actual.id),
    env.CRM_DB.prepare("UPDATE welcome_steps SET step_order = ? WHERE id = ?").bind(actual.step_order, vecino.id)
  ]);

  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAdmin(post);
export const onRequestDelete = conAdmin(del);
export const onRequestPatch = conAdmin(patch);
