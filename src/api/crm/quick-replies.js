/**
 * GET    /api/crm/quick-replies — lista todas (texto y las que llevan foto/video)
 * POST   /api/crm/quick-replies — crea { title, body?, media_key?, media_type?, media_mime? }
 * DELETE /api/crm/quick-replies — borra { id }
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare(
    "SELECT * FROM quick_replies ORDER BY sort_order ASC, id ASC"
  ).all();
  return json({ quick_replies: results });
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
  const mediaKey = payload?.media_key ? String(payload.media_key) : null;
  const mediaType = payload?.media_type ? String(payload.media_type) : null;
  const mediaMime = payload?.media_mime ? String(payload.media_mime) : null;

  if (!title) return json({ error: "Falta un título." }, 400);
  if (!body && !mediaKey) return json({ error: "Necesita texto o un archivo." }, 400);

  const creada = await env.CRM_DB.prepare(
    `INSERT INTO quick_replies (title, body, media_key, media_type, media_mime) VALUES (?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(title, body, mediaKey, mediaType, mediaMime)
    .first();

  return json({ ok: true, quick_reply: creada });
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

  const fila = await env.CRM_DB.prepare("SELECT media_key FROM quick_replies WHERE id = ?").bind(id).first();
  await env.CRM_DB.prepare("DELETE FROM quick_replies WHERE id = ?").bind(id).run();
  if (fila?.media_key && env.CRM_MEDIA) {
    await env.CRM_MEDIA.delete(fila.media_key).catch(() => {});
  }

  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestDelete = conAuth(del);
