/**
 * Vuelca los mensajes nuevos del CRM a una hoja de Google, en crudo (una
 * fila por mensaje, sin resumir nada) — para que después un LLM la lea y
 * arme el resumen del día. Corre cada 10 minutos (ver wrangler.jsonc).
 *
 * Reusa la MISMA cuenta de servicio de Google que ya usa /api/order
 * (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY): solo hay que compartirle la
 * hoja nueva como Editor, no hace falta crear ninguna credencial.
 *
 * `crm_export_state` guarda el id del último mensaje ya exportado, para no
 * mandar el mismo mensaje dos veces ni tener que leer la hoja para saber
 * dónde se quedó.
 */

import { appendRowsTo, asegurarPestana } from "./google-sheets.js";

const ENCABEZADOS = ["Fecha (Lima)", "WhatsApp", "Contacto", "Quién", "Vendedor", "Tipo", "Mensaje", "Origen anuncio", "Título anuncio", "ctwa_clid", "Notas"];

/** "2026-09-22 05:47:46" (UTC, como lo guarda D1) -> Date ya en hora de Lima. */
function fechaLimaDate(fechaUTC) {
  const iso = fechaUTC.includes("T") ? fechaUTC : fechaUTC.replace(" ", "T") + "Z";
  return new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
}

function fechaLimaTexto(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** "22-09-2026" — nombre de pestaña, una por día, para poder filtrar/revisar un día a la vez. */
function nombrePestanaDelDia(d) {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

export async function exportarChatsASheets(env) {
  if (!env.CRM_DB || !env.GOOGLE_CRM_SHEET_ID || !env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) return;

  const estado = await env.CRM_DB.prepare("SELECT last_message_id FROM crm_export_state WHERE id = 1").first();
  const desde = estado?.last_message_id || 0;

  const { results: mensajes } = await env.CRM_DB.prepare(
    `SELECT m.id, m.created_at, m.direction, m.type, m.body, m.file_name, m.sent_by,
            c.wa_id, c.profile_name, c.name AS contact_name,
            c.ctwa_clid, c.ad_source_type, c.ad_headline, c.notes
     FROM messages m
     JOIN conversations conv ON conv.id = m.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     WHERE m.id > ?
     ORDER BY m.id ASC
     LIMIT 300`
  )
    .bind(desde)
    .all();

  if (!mensajes.length) return;

  // Una pestaña por día (así se puede revisar o filtrar un día sin scrollear
  // meses de historial) — se agrupa antes de mandar, para no crear/escribir
  // la pestaña de un día por cada mensaje suyo.
  const porDia = new Map();
  for (const m of mensajes) {
    const fecha = fechaLimaDate(m.created_at);
    const pestana = nombrePestanaDelDia(fecha);
    const fila = [
      fechaLimaTexto(fecha),
      m.wa_id,
      m.contact_name || m.profile_name || "",
      m.direction === "in" ? "Cliente" : "Vendedor",
      m.sent_by || "",
      m.type || "text",
      (m.body || m.file_name || "").slice(0, 2000),
      m.ad_source_type || "",
      m.ad_headline || "",
      m.ctwa_clid || "",
      m.notes || ""
    ];
    if (!porDia.has(pestana)) porDia.set(pestana, []);
    porDia.get(pestana).push(fila);
  }

  try {
    for (const [pestana, filas] of porDia) {
      await asegurarPestana(env, env.GOOGLE_CRM_SHEET_ID, pestana, ENCABEZADOS);
      await appendRowsTo(env, env.GOOGLE_CRM_SHEET_ID, pestana, filas);
    }
  } catch (err) {
    console.error("Export a Sheets:", err.message);
    return; // no avanza el marcador: se reintenta en el próximo cron
  }

  const ultimoId = mensajes[mensajes.length - 1].id;
  await env.CRM_DB.prepare(
    "INSERT INTO crm_export_state (id, last_message_id) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_message_id = ?"
  )
    .bind(ultimoId, ultimoId)
    .run();
}

/** Vuelve a exportar todo desde cero (para cuando se quiere rearmar la hoja) — el próximo cron re-manda desde el mensaje 0. */
export async function reiniciarExportacion(env) {
  await env.CRM_DB.prepare(
    "INSERT INTO crm_export_state (id, last_message_id) VALUES (1, 0) ON CONFLICT(id) DO UPDATE SET last_message_id = 0"
  ).run();
}
