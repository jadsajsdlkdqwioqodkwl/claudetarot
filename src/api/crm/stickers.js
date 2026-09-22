/**
 * Biblioteca de stickers, compartida entre el equipo — igual que las
 * respuestas rápidas: se suben una vez y quedan disponibles para mandar con
 * un clic desde cualquier chat.
 *
 * GET    /api/crm/stickers — la lista, en orden
 * POST   /api/crm/stickers — { media_key, media_mime? } → agrega uno (el
 *        media_key sale de /api/crm/upload-media, que ya valida que sea un
 *        webp dentro del límite de tamaño de Meta)
 * DELETE /api/crm/stickers — { id } → borra uno (y su archivo de R2)
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare("SELECT * FROM stickers ORDER BY sort_order ASC, id ASC").all();
  return json({ stickers: results });
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const mediaKey = payload?.media_key ? String(payload.media_key) : null;
  if (!mediaKey) return json({ error: "Falta media_key." }, 400);

  const max = await env.CRM_DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM stickers").first();
  const creado = await env.CRM_DB.prepare(
    "INSERT INTO stickers (media_key, media_mime, sort_order, created_by) VALUES (?, ?, ?, ?) RETURNING *"
  )
    .bind(mediaKey, payload?.media_mime ? String(payload.media_mime) : null, (max?.m || 0) + 1, agent?.displayName || agent?.username || null)
    .first();

  return json({ ok: true, sticker: creado });
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

  const fila = await env.CRM_DB.prepare("SELECT media_key FROM stickers WHERE id = ?").bind(id).first();
  await env.CRM_DB.prepare("DELETE FROM stickers WHERE id = ?").bind(id).run();
  if (fila?.media_key && env.CRM_MEDIA) await env.CRM_MEDIA.delete(fila.media_key).catch(() => {});

  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestDelete = conAuth(del);
