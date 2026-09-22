/**
 * GET    /api/crm/quick-replies — lista todas, cada una con su array `media` (0 o más fotos/videos)
 * POST   /api/crm/quick-replies — crea { title, body?, media_keys?: [{media_key, media_type, media_mime}] }
 * DELETE /api/crm/quick-replies — borra { id }
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const { results: rapidas } = await env.CRM_DB.prepare(
    "SELECT id, title, body, sort_order, created_at FROM quick_replies ORDER BY sort_order ASC, id ASC"
  ).all();
  const { results: media } = await env.CRM_DB.prepare(
    "SELECT * FROM quick_reply_media ORDER BY sort_order ASC, id ASC"
  ).all();

  const porRapida = {};
  for (const m of media) (porRapida[m.quick_reply_id] ||= []).push(m);

  return json({ quick_replies: rapidas.map((r) => ({ ...r, media: porRapida[r.id] || [] })) });
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

  const creada = await env.CRM_DB.prepare(
    `INSERT INTO quick_replies (title, body) VALUES (?, ?) RETURNING *`
  )
    .bind(title, body)
    .first();

  let i = 0;
  for (const m of mediaKeys) {
    await env.CRM_DB.prepare(
      "INSERT INTO quick_reply_media (quick_reply_id, media_key, media_mime, media_type, sort_order) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(creada.id, String(m.media_key), m.media_mime ? String(m.media_mime) : null, String(m.media_type), i++)
      .run();
  }

  const media = await env.CRM_DB.prepare("SELECT * FROM quick_reply_media WHERE quick_reply_id = ? ORDER BY sort_order ASC")
    .bind(creada.id)
    .all();

  return json({ ok: true, quick_reply: { ...creada, media: media.results } });
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

  const { results: media } = await env.CRM_DB.prepare("SELECT media_key FROM quick_reply_media WHERE quick_reply_id = ?")
    .bind(id)
    .all();

  await env.CRM_DB.prepare("DELETE FROM quick_reply_media WHERE quick_reply_id = ?").bind(id).run();
  await env.CRM_DB.prepare("DELETE FROM quick_replies WHERE id = ?").bind(id).run();

  if (env.CRM_MEDIA) {
    for (const m of media) await env.CRM_MEDIA.delete(m.media_key).catch(() => {});
  }

  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestDelete = conAuth(del);
