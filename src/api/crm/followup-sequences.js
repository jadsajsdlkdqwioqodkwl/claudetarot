/**
 * Secuencias de seguimiento reutilizables: varios mensajes con un tiempo de
 * espera entre uno y otro (ej. "1 hora después", "1 día después"), armadas
 * una vez y aplicables a cualquier chat con un clic desde el panel de
 * seguimientos programados. Compartidas entre vendedores, igual que las
 * respuestas rápidas.
 *
 * GET    /api/crm/followup-sequences — todas, con sus pasos en orden
 * POST   /api/crm/followup-sequences — { title } → crea una secuencia vacía
 *                                       { sequence_id, body?, media_key?, media_type?, media_mime?, delay_minutes, catalogo?, catalogo_nombre? } → agrega un paso al final
 *                                       (catalogo: "*" = catálogo completo, o el retailer_id de un producto)
 *                                       + botones? (hasta 3, máx. 20 caracteres) — salen debajo del texto
 *                                       o { sequence_id, template_name, template_language?, template_params?, delay_minutes }
 *                                       → el paso sale como plantilla (sirve fuera de la ventana de 24 h)
 * DELETE /api/crm/followup-sequences — { sequence_id } → borra la secuencia entera
 *                                       { step_id } → borra un solo paso
 * PATCH  /api/crm/followup-sequences — { step_id, direction: "up"|"down" } → reordena un paso
 *                                       { step_id, body?, delay_minutes, media_key?, ... } → edita un paso (sin media_key conserva la que tenía)
 *                                       { sequence_id, title } → renombra la secuencia
 */

import { conAuth } from "../../lib/crm-auth.js";
import { leerCatalogo, leerBotones, leerPlantilla } from "../../lib/crm-db.js";

/** Lo que tiene que llevar un paso para poder guardarse. null = está bien. */
function errorDePaso({ body, mediaKey, catalogo, botones, templateName }) {
  if (templateName) return null;
  if (!body && !mediaKey && !catalogo) return "Necesita un texto, una foto/video, el catálogo o una plantilla.";
  if (botones && !body) return "Los botones van debajo de un texto: escribe el mensaje.";
  if (botones && catalogo) return "El catálogo no puede llevar botones de opciones.";
  if (botones && body.length > 1024) return "Con botones, el texto puede tener hasta 1024 caracteres.";
  return null;
}

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
    const { catalogo, catalogoNombre } = leerCatalogo(payload);
    const botones = leerBotones(payload);
    const { templateName, templateLanguage, templateParams } = leerPlantilla(payload);

    const error = errorDePaso({ body, mediaKey, catalogo, botones, templateName });
    if (error) return json({ error }, 400);

    const existe = await env.CRM_DB.prepare("SELECT id FROM followup_sequences WHERE id = ?").bind(sequenceId).first();
    if (!existe) return json({ error: "Esa secuencia no existe." }, 404);

    const max = await env.CRM_DB.prepare("SELECT COALESCE(MAX(step_order), 0) AS m FROM followup_sequence_steps WHERE sequence_id = ?")
      .bind(sequenceId)
      .first();
    const creado = await env.CRM_DB.prepare(
      `INSERT INTO followup_sequence_steps (sequence_id, step_order, body, media_key, media_type, media_mime, delay_minutes, catalogo, catalogo_nombre,
         botones, template_name, template_language, template_params)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
      .bind(sequenceId, (max?.m || 0) + 1, templateName ? null : body, templateName ? null : mediaKey, templateName ? null : mediaType, templateName ? null : mediaMime,
        delayMinutes, templateName ? null : catalogo, templateName ? null : catalogoNombre, templateName ? null : botones, templateName, templateLanguage, templateParams)
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
  const sequenceId = Number(payload?.sequence_id);
  if (sequenceId && !payload?.step_id) {
    const title = String(payload?.title || "").trim().slice(0, 80);
    if (!title) return json({ error: "Falta un título." }, 400);
    await env.CRM_DB.prepare("UPDATE followup_sequences SET title = ? WHERE id = ?").bind(title, sequenceId).run();
    return json({ ok: true });
  }

  const stepId = Number(payload?.step_id);
  const direction = payload?.direction;
  if (!stepId) return json({ error: "Falta step_id." }, 400);

  const actual = await env.CRM_DB.prepare("SELECT * FROM followup_sequence_steps WHERE id = ?").bind(stepId).first();
  if (!actual) return json({ error: "No encontrado." }, 404);

  if (!direction) {
    const body = payload?.body ? String(payload.body).trim().slice(0, 4096) : null;
    const delayMinutes = Math.max(1, Number(payload?.delay_minutes) || actual.delay_minutes);
    const nuevaMedia = payload?.media_key ? String(payload.media_key) : null;
    const mediaKey = nuevaMedia || actual.media_key;
    const mediaType = nuevaMedia ? (TIPOS_MEDIA.has(payload?.media_type) ? payload.media_type : "image") : actual.media_type;
    const mediaMime = nuevaMedia ? (payload?.media_mime ? String(payload.media_mime) : null) : actual.media_mime;
    // Sin `catalogo` en el payload se conserva el que tenía; con null se quita.
    const { catalogo, catalogoNombre } = "catalogo" in (payload || {})
      ? leerCatalogo(payload)
      : { catalogo: actual.catalogo, catalogoNombre: actual.catalogo_nombre };
    // Sin `botones` / `template_name` en el payload se conserva lo que tenía; con null o vacío se quita.
    const botones = "botones" in (payload || {}) ? leerBotones(payload) : actual.botones;
    const plantilla = "template_name" in (payload || {})
      ? leerPlantilla(payload)
      : { templateName: actual.template_name, templateLanguage: actual.template_language, templateParams: actual.template_params };
    const { templateName } = plantilla;
    const error = errorDePaso({ body, mediaKey, catalogo, botones, templateName });
    if (error) return json({ error }, 400);

    await env.CRM_DB.prepare(
      `UPDATE followup_sequence_steps SET body = ?, delay_minutes = ?, media_key = ?, media_type = ?, media_mime = ?, catalogo = ?, catalogo_nombre = ?,
         botones = ?, template_name = ?, template_language = ?, template_params = ? WHERE id = ?`
    )
      .bind(templateName ? null : body, delayMinutes, templateName ? null : mediaKey, templateName ? null : mediaType, templateName ? null : mediaMime,
        templateName ? null : catalogo, templateName ? null : catalogoNombre, templateName ? null : botones,
        templateName, plantilla.templateLanguage, plantilla.templateParams, stepId)
      .run();
    // La foto/video vieja se borra si se reemplazó o si el paso pasó a ser plantilla.
    if ((nuevaMedia || templateName) && actual.media_key && env.CRM_MEDIA) await env.CRM_MEDIA.delete(actual.media_key).catch(() => {});
    return json({ ok: true });
  }
  if (!["up", "down"].includes(direction)) return json({ error: "direction inválido." }, 400);

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
