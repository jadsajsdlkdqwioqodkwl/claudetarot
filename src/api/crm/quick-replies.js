/**
 * GET    /api/crm/quick-replies — lista todas, cada una con su array `media` (0 o más fotos/videos)
 * POST   /api/crm/quick-replies — crea { title, body?, media_keys?: [{media_key, media_type, media_mime}] }
 * PATCH  /api/crm/quick-replies — edita { id, title, body?, media_keys? } — si no mandas media_keys se
 *        conserva la media que ya tenía (no hace falta volver a subir fotos/videos solo para cambiar el texto)
 * DELETE /api/crm/quick-replies — borra { id }
 *
 * PATCH { ordenar: [ids] } guarda el orden en que el equipo las arrastró
 * (sort_order 1, 2, 3…). Las nuevas van al final. (Los grupos ya no se usan.)
 *
 * POST y PATCH aceptan además `followup_pasos`: la secuencia de seguimiento
 * si el cliente no responde, hasta 4 pasos [{ horas, body?, media_key?,
 * media_type?, media_mime? }], cada uno `horas` después del anterior. (Sigue
 * aceptando el formato viejo `followup_body` + `followup_hours` = un paso.)
 * Ver programarSeguimientoDeRapida.
 *
 * POST y PATCH aceptan además `catalogo` ("*" = catálogo completo, o el
 * retailer_id de un producto) y `catalogo_nombre`: la respuesta sale con el
 * catálogo en vez de sus fotos/videos (las fotos se conservan, por si se
 * vuelve a "con fotos"). null = con fotos. En PATCH, sin `catalogo` en el
 * payload se conserva el que tenía.
 *
 * POST y PATCH aceptan además `producto_id` (src/lib/productos.js): la
 * respuesta es de ese producto y sale primero en los chats de ese producto.
 * null = general (las de Tarot Store). En PATCH, sin `producto_id` se conserva.
 *
 * GET trae además `variantes` en las que tienen una prueba en curso: la
 * original (id 0, texto null) y cada versión, con su `peso` — la
 * probabilidad con que el CRM la pone en el cuadro al elegir la respuesta
 * (crm-variantes.js). Se gestionan en /api/crm/variantes. Vienen en el
 * orden que fijó el admin, si fijó uno; entonces `orden_fijo` es true y la
 * primera es la predeterminada (sale al tocar el mensaje, sin sorteo).
 */

import { conAuth } from "../../lib/crm-auth.js";
import { HORAS_SEGUIMIENTO_RAPIDA, leerCatalogo } from "../../lib/crm-db.js";
import { versionesEnPrueba, guardarAnterior } from "../../lib/crm-variantes.js";

/**
 * La secuencia de seguimiento de la respuesta rápida, validada. Devuelve los
 * pasos (JSON o null) y, para lo que todavía lee el formato viejo, el primer
 * paso como body/hours.
 */
function leerSeguimiento(payload) {
  let pasos = Array.isArray(payload?.followup_pasos)
    ? payload.followup_pasos
    : payload?.followup_body ? [{ horas: payload.followup_hours, body: payload.followup_body }] : [];
  pasos = pasos
    .map((p) => {
      const horas = Number(p?.horas);
      const paso = {
        horas: horas >= 0.25 && horas <= 168 ? Math.round(horas * 4) / 4 : HORAS_SEGUIMIENTO_RAPIDA,
        body: String(p?.body || "").trim().slice(0, 4096) || null
      };
      if (p?.media_key) Object.assign(paso, {
        media_key: String(p.media_key).slice(0, 200),
        media_type: ["image", "video", "document", "audio", "sticker"].includes(p.media_type) ? p.media_type : "document",
        media_mime: p.media_mime ? String(p.media_mime).slice(0, 100) : null
      });
      return paso;
    })
    .filter((p) => p.body || p.media_key)
    .slice(0, 4);
  return {
    pasos: pasos.length ? JSON.stringify(pasos) : null,
    body: pasos[0]?.body || (pasos.length ? "(archivo)" : null),
    hours: pasos.length ? Math.max(1, Math.round(pasos[0].horas)) : null
  };
}

/** Los pasos guardados, o el seguimiento viejo como un solo paso. */
function pasosDe(r) {
  try {
    const p = JSON.parse(r.followup_pasos || "null");
    if (Array.isArray(p) && p.length) return p;
  } catch { /* formato viejo */ }
  return r.followup_body ? [{ horas: r.followup_hours || HORAS_SEGUIMIENTO_RAPIDA, body: r.followup_body }] : [];
}

/** Grupo (cadena o tipo: "Lima", "Objeciones"…) y número dentro del grupo. */
function leerGrupo(payload) {
  const grupo = String(payload?.grupo || "").trim().replace(/\s+/g, " ").slice(0, 40) || null;
  const orden = Number(payload?.orden);
  return { grupo, orden: Number.isFinite(orden) && orden >= 0 && orden <= 999 ? Math.round(orden) : null };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const { results: rapidas } = await env.CRM_DB.prepare(
"SELECT id, title, body, grupo, followup_body, followup_hours, followup_pasos, catalogo, catalogo_nombre, sort_order, created_at, producto_id FROM quick_replies ORDER BY sort_order ASC, id ASC"
  ).all();
  const { results: media } = await env.CRM_DB.prepare(
    "SELECT * FROM quick_reply_media ORDER BY sort_order ASC, id ASC"
  ).all();

  const porRapida = {};
  for (const m of media) (porRapida[m.quick_reply_id] ||= []).push(m);
  const pruebas = await versionesEnPrueba(env.CRM_DB, "rapida").catch((err) => {
    console.error("Versiones en prueba:", err.message);
    return {};
  });

  return json({
    quick_replies: rapidas.map((r) => ({
      ...r,
      followup_pasos: pasosDe(r),
      media: porRapida[r.id] || [],
      ...(pruebas[r.id] ? { variantes: pruebas[r.id].map((v) => ({ id: v.id, texto: v.texto, peso: v.peso })), orden_fijo: Boolean(pruebas[r.id][0]?.predeterminada) } : {})
    }))
  });
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

  const { catalogo, catalogoNombre } = leerCatalogo(payload);

  if (!title) return json({ error: "Falta un título." }, 400);
  if (!body && !mediaKeys.length && !catalogo) return json({ error: "Necesita texto, al menos un archivo o el catálogo." }, 400);

  const seguimiento = leerSeguimiento(payload);
  const { grupo, orden } = leerGrupo(payload);
  const productoId = Number(payload?.producto_id) || null;
  const creada = await env.CRM_DB.prepare(
    `INSERT INTO quick_replies (title, body, followup_body, followup_hours, followup_pasos, grupo, catalogo, catalogo_nombre, producto_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quick_replies))) RETURNING *`
  )
    .bind(title, body, seguimiento.body, seguimiento.hours, seguimiento.pasos, grupo, catalogo, catalogoNombre, productoId, orden)
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

  return json({ ok: true, quick_reply: { ...creada, followup_pasos: pasosDe(creada), media: media.results } });
}

async function patch({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  if (Array.isArray(payload?.ordenar)) {
    const ids = [...new Set(payload.ordenar.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
    if (!ids.length) return json({ error: "Falta el orden." }, 400);
    await env.CRM_DB.batch(ids.map((qid, i) => env.CRM_DB.prepare("UPDATE quick_replies SET sort_order = ? WHERE id = ?").bind(i + 1, qid)));
    return json({ ok: true });
  }

  const id = Number(payload?.id);
  if (!id) return json({ error: "Falta id." }, 400);

  const existente = await env.CRM_DB.prepare("SELECT id, body, catalogo, catalogo_nombre, producto_id FROM quick_replies WHERE id = ?").bind(id).first();
  if (!existente) return json({ error: "No encontrado." }, 404);

  const title = String(payload?.title || "").trim().slice(0, 80);
  const body = String(payload?.body || "").trim().slice(0, 4096) || null;
  // `null` = no la mandaron, así que se conserva la media que ya tenía.
  const mediaKeys = Array.isArray(payload?.media_keys) ? payload.media_keys.slice(0, 10) : null;

  // Sin `catalogo` en el payload se conserva el que tenía; con null se quita.
  const { catalogo, catalogoNombre } = "catalogo" in (payload || {})
    ? leerCatalogo(payload)
    : { catalogo: existente.catalogo || null, catalogoNombre: existente.catalogo_nombre || null };

  if (!title) return json({ error: "Falta un título." }, 400);
  if (!body && !catalogo && mediaKeys !== null && !mediaKeys.length) {
    return json({ error: "Necesita texto, al menos un archivo o el catálogo." }, 400);
  }
  if (!body && !catalogo && mediaKeys === null) {
    const tieneMedia = await env.CRM_DB.prepare("SELECT 1 FROM quick_reply_media WHERE quick_reply_id = ? LIMIT 1").bind(id).first();
    if (!tieneMedia) return json({ error: "Necesita texto, al menos un archivo o el catálogo." }, 400);
  }

  const seguimiento = leerSeguimiento(payload);
  // Texto nuevo = otro mensaje: se guarda el anterior y la cuenta de la original vuelve a 0.
  if ((existente.body || null) !== body) {
    await guardarAnterior(env.CRM_DB, "rapida", id, existente.body, agent?.displayName || agent?.username).run().catch(() => {});
  }
  const { grupo, orden } = leerGrupo(payload);
  const productoId = "producto_id" in (payload || {}) ? Number(payload.producto_id) || null : existente.producto_id || null;
  await env.CRM_DB.prepare("UPDATE quick_replies SET title = ?, body = ?, followup_body = ?, followup_hours = ?, followup_pasos = ?, catalogo = ?, catalogo_nombre = ?, producto_id = ?, grupo = COALESCE(?, grupo), sort_order = COALESCE(?, sort_order) WHERE id = ?")
    .bind(title, body, seguimiento.body, seguimiento.hours, seguimiento.pasos, catalogo, catalogoNombre, productoId, grupo, orden, id)
    .run();

  if (mediaKeys !== null) {
    const { results: vieja } = await env.CRM_DB.prepare("SELECT media_key FROM quick_reply_media WHERE quick_reply_id = ?").bind(id).all();
    await env.CRM_DB.prepare("DELETE FROM quick_reply_media WHERE quick_reply_id = ?").bind(id).run();
    let i = 0;
    for (const m of mediaKeys) {
      await env.CRM_DB.prepare(
        "INSERT INTO quick_reply_media (quick_reply_id, media_key, media_mime, media_type, sort_order) VALUES (?, ?, ?, ?, ?)"
      )
        .bind(id, String(m.media_key), m.media_mime ? String(m.media_mime) : null, String(m.media_type), i++)
        .run();
    }
    if (env.CRM_MEDIA) {
      for (const m of vieja) await env.CRM_MEDIA.delete(m.media_key).catch(() => {});
    }
  }

  const media = await env.CRM_DB.prepare("SELECT * FROM quick_reply_media WHERE quick_reply_id = ? ORDER BY sort_order ASC")
    .bind(id)
    .all();

  return json({ ok: true, quick_reply: { id, title, body, grupo, followup_body: seguimiento.body, followup_hours: seguimiento.hours, followup_pasos: pasosDe({ followup_pasos: seguimiento.pasos }), catalogo, catalogo_nombre: catalogoNombre, producto_id: productoId, media: media.results } });
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
export const onRequestPatch = conAuth(patch);
export const onRequestDelete = conAuth(del);
