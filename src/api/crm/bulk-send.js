/**
 * Mensajes masivos: el mismo mensaje a una lista de números, sin abrir cada
 * chat uno por uno. Pensado para avisos (ej. "cambié de número") a
 * contactos que probablemente no te escribieron en las últimas 24h — por
 * eso lo normal es mandarlo como plantilla aprobada, no como texto libre
 * (WhatsApp rechaza el texto libre fuera de esa ventana).
 *
 * No manda nada directo: crea un `scheduled_messages` por número, listo
 * para "ahora", y el cron de cada minuto (el mismo de los seguimientos) los
 * va sacando de a 50 — eso de paso frena la ráfaga contra la API de Meta.
 * Solo admin.
 *
 * POST /api/crm/bulk-send — { numbers: "51987654321\n51911223344...",
 *      mode: "template", template_name, template_language?, template_params?: string[] }
 *   o { numbers, mode: "text", body } — para contactos que sabes que te
 *      escribieron hace poco (si no, WhatsApp va a rechazar cada uno).
 *   → { ok, batch_id, total, invalidos: [...] }
 *
 * GET  /api/crm/bulk-send?batch_id=... — resumen de cómo va ese envío
 * GET  /api/crm/bulk-send — los últimos envíos masivos (agrupados por batch_id)
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { obtenerOCrearContacto, obtenerOCrearConversacion } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

function parsearNumeros(texto) {
  const crudos = String(texto || "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const vistos = new Set();
  const validos = [];
  const invalidos = [];
  for (const crudo of crudos) {
    const digits = crudo.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      invalidos.push(crudo);
      continue;
    }
    if (vistos.has(digits)) continue;
    vistos.add(digits);
    validos.push(digits);
  }
  return { validos, invalidos };
}

async function get({ request, env }) {
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batch_id");

  if (batchId) {
    const { results } = await env.CRM_DB.prepare(
      `SELECT s.id, s.status, s.send_at, s.sent_at, c.wa_id
       FROM scheduled_messages s
       JOIN conversations conv ON conv.id = s.conversation_id
       JOIN contacts c ON c.id = conv.contact_id
       WHERE s.batch_id = ? ORDER BY s.id ASC`
    )
      .bind(batchId)
      .all();
    return json({ items: results });
  }

  const { results } = await env.CRM_DB.prepare(
    `SELECT batch_id, COUNT(*) AS total,
       SUM(CASE WHEN status = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
       SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) AS enviados,
       SUM(CASE WHEN status = 'fallido' THEN 1 ELSE 0 END) AS fallidos,
       MIN(created_at) AS created_at, MAX(body) AS body, MAX(template_name) AS template_name
     FROM scheduled_messages
     WHERE batch_id IS NOT NULL
     GROUP BY batch_id
     ORDER BY created_at DESC
     LIMIT 20`
  ).all();
  return json({ batches: results });
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const { validos, invalidos } = parsearNumeros(payload?.numbers);
  if (!validos.length) return json({ error: "No hay números válidos en la lista." }, 400);

  const modo = payload?.mode === "template" ? "template" : "text";
  const body = modo === "text" ? String(payload?.body || "").trim().slice(0, 4096) : null;
  const templateName = modo === "template" ? String(payload?.template_name || "").trim() : null;
  const templateLanguage = modo === "template" ? String(payload?.template_language || "es") : null;
  const templateParams = modo === "template" && Array.isArray(payload?.template_params) ? JSON.stringify(payload.template_params.map(String)) : null;

  if (modo === "text" && !body) return json({ error: "Falta el texto del mensaje." }, 400);
  if (modo === "template" && !templateName) return json({ error: "Falta el nombre de la plantilla." }, 400);

  const createdBy = agent?.displayName || agent?.username || "Envío masivo";
  const batchId = crypto.randomUUID();
  const inserts = [];

  for (const waId of validos) {
    const contacto = await obtenerOCrearContacto(env.CRM_DB, waId, null, null);
    const conversacion = await obtenerOCrearConversacion(env.CRM_DB, contacto.id);
    inserts.push(
      env.CRM_DB.prepare(
        `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, batch_id, template_name, template_language, template_params)
         VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)`
      ).bind(conversacion.id, body, createdBy, batchId, templateName, templateLanguage, templateParams)
    );
  }

  await env.CRM_DB.batch(inserts);

  return json({ ok: true, batch_id: batchId, total: validos.length, invalidos });
}

export const onRequestGet = conAdmin(get);
export const onRequestPost = conAdmin(post);
