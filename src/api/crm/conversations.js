/**
 * GET /api/crm/conversations — bandeja de entrada: una fila por conversación,
 * con el contacto y el último mensaje, ordenadas por actividad reciente.
 * Filtros opcionales: ?mine=1 (solo las asignadas a quien pregunta)
 * &agente=Nombre (las de esa asesora, dueña o compartiendo)
 * &etiqueta=contact|lead|purchase &q=texto &dias=N (0 = todo) &offset=N
 *
 * Búsqueda (&q): sin tildes ni mayúsculas, por palabras (todas tienen que
 * aparecer, cada una en cualquier lado): nombre, número (con o sin 51),
 * notas, clave Shalom, anuncio, asesora y el TEXTO de los mensajes (un DNI,
 * una dirección, "amuleto"…). Si coincidió en un mensaje, la fila trae ese
 * extracto en `coincidencia`. &dias limita a chats con actividad en los
 * últimos N días; &en=cliente busca solo en lo que escribió el cliente;
 * &limite=N trae hasta N (200 por defecto, máx. 2000) y &offset salta.
 * Ocultos y bloqueados no salen, salvo con &ocultos=1 (solo esos) o
 * buscando (&q), que los trae con su marca.
 * Con &chat=<id> trae además los últimos mensajes de ese chat (y lo marca
 * leído): el poll del CRM es un solo request en vez de dos — el plan gratis
 * de Workers tiene tope de requests por día.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { leerMensajes } from "./messages.js";
import { ORIGEN_SEGUIMIENTO_AUTO, PREFIJO_SEGUIMIENTO_LEAD } from "../../lib/crm-db.js";

/** Minúsculas y sin tildes, en SQL (SQLite no trae unaccent y su lower() no toca las tildes). */
const TILDES = [["á", "a"], ["é", "e"], ["í", "i"], ["ó", "o"], ["ú", "u"], ["ü", "u"], ["ñ", "n"],
  ["Á", "a"], ["É", "e"], ["Í", "i"], ["Ó", "o"], ["Ú", "u"], ["Ü", "u"], ["Ñ", "n"]];
export function norm(col) {
  return TILDES.reduce((expr, [de, a]) => `replace(${expr}, '${de}', '${a}')`, `lower(COALESCE(${col}, ''))`);
}

/**
 * Qué mensajes cuentan al buscar: nunca los automáticos (la bienvenida y el
 * seguimiento dicen lo mismo en todos los chats y taparían todo); con
 * &en=cliente, solo lo que escribió el cliente.
 */
const FILTRO_MENSAJES = (soloCliente, t) => soloCliente
  ? `${t}.direction = 'in'`
  : `(${t}.direction = 'in' OR (COALESCE(${t}.sent_by, '') NOT IN ('Bienvenida automática', 'Seguimiento automático') AND COALESCE(${t}.sent_by, '') NOT LIKE 'Prueba de bienvenida%'))`;

/** Las palabras de la búsqueda, sin tildes; el número sin espacios ni "+". Hasta 5. */
export function tokensBusqueda(q) {
  const limpio = String(q || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/(\d)[\s.-]+(?=\d)/g, "$1").replace(/\+/g, "");
  return [...new Set(limpio.split(/[^a-z0-9@]+/).filter((t) => t.length >= 2))].slice(0, 5);
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function handler({ request, env, agent }) {
  const url = new URL(request.url);
  const soloMias = url.searchParams.get("mine") === "1";
  const q = url.searchParams.get("q");
  const chatId = Number(url.searchParams.get("chat")) || null;
  const etiqueta = ["contact", "lead", "purchase"].includes(url.searchParams.get("etiqueta")) ? url.searchParams.get("etiqueta") : null;
  const agente = soloMias ? agent?.displayName || agent?.username || "" : (url.searchParams.get("agente") || "").trim();

  const condiciones = [];
  const params = [];
  if (soloMias || agente) {
    // Los que el chat tiene asignados como dueño o compartiendo (uno por línea en shared_with).
    condiciones.push("(conv.assigned_agent = ? OR (? <> '' AND instr(char(10) || COALESCE(conv.shared_with, '') || char(10), char(10) || ? || char(10)) > 0))");
    params.push(agente, agente, agente);
  }
  if (etiqueta) {
    condiciones.push("instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ?) > 0");
    params.push(` ${etiqueta} `);
  }
  const dias = Math.max(0, Math.min(Number(url.searchParams.get("dias")) || 0, 3650));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  // Cuántos traer: 200 por defecto; "Cargar más" en el CRM sube de a 200 (hasta 2000).
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 200, 50), 2000);
  const soloCliente = url.searchParams.get("en") === "cliente";
  if (dias) {
    condiciones.push("conv.last_message_at >= datetime('now', ?)");
    params.push(`-${dias} days`);
  }
  const tokens = tokensBusqueda(q);
  if (url.searchParams.get("ocultos") === "1") condiciones.push("(conv.hidden = 1 OR c.blocked = 1)");
  else if (!tokens.length) condiciones.push("conv.hidden = 0 AND c.blocked = 0");
  for (const t of tokens) {
    const tel = /^\d{4,}$/.test(t) ? (t.length === 11 && t.startsWith("51") ? t.slice(2) : t) : null;
    condiciones.push(`(
      ${norm("c.profile_name")} LIKE ? OR ${norm("c.name")} LIKE ? OR ${norm("c.notes")} LIKE ?
      OR ${norm("c.ad_headline")} LIKE ? OR ${norm("conv.assigned_agent")} LIKE ?
      OR COALESCE(c.shalom_code, '') LIKE ? ${tel ? "OR c.wa_id LIKE ?" : ""}
      OR conv.id IN (SELECT m.conversation_id FROM messages m WHERE ${norm("m.body")} LIKE ? AND ${FILTRO_MENSAJES(soloCliente, "m")})
    )`);
    const like = `%${t}%`;
    params.push(like, like, like, like, like, like, ...(tel ? [`%${tel}%`] : []), like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  // Para mostrar dónde coincidió: el mensaje más reciente con la palabra más larga.
  const clave = [...tokens].sort((a, b) => b.length - a.length)[0] || null;

  // Primero el chat (marca leído), así la lista ya sale con su unread_count en 0.
  const chat = chatId ? await leerMensajes(env, chatId) : null;

  const { results } = await env.CRM_DB.prepare(
    `SELECT
        conv.id AS conversation_id,
        conv.status,
        conv.unread_count,
        conv.assigned_agent,
        conv.shared_with,
        conv.meta_tags,
        conv.last_message_at,
        conv.last_inbound_at,
        conv.hidden,
        c.blocked,
        c.id AS contact_id,
        c.wa_id,
        c.profile_name,
        c.ctwa_clid,
        c.ad_source_type,
        c.ad_headline,
        c.notes,
        c.shalom_code,
        c.name AS contact_name,
        (SELECT MAX(e.created_at) FROM capi_events e WHERE e.conversation_id = conv.id AND e.event_name = 'Purchase') AS compra_at,
        ${clave ? `(SELECT substr(m2.body, 1, 200) FROM messages m2 WHERE m2.conversation_id = conv.id AND ${norm("m2.body")} LIKE ? AND ${FILTRO_MENSAJES(soloCliente, "m2")} ORDER BY m2.id DESC LIMIT 1)` : "NULL"} AS coincidencia,
        lm.body AS last_body,
        lm.type AS last_type,
        lm.direction AS last_direction,
        seg.pendientes AS seg_pendientes,
        seg.proximo AS seg_proximo,
        seg.auto_proximo AS seg_auto_proximo
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     -- Seguimientos pendientes para las etiquetas de la lista: los manuales
     -- (ni envío masivo ni la secuencia de leads) y, aparte, la hora del
     -- próximo seguimiento automático de bienvenida del lead nuevo. Una sola
     -- pasada por los pendientes (índice status, send_at).
     LEFT JOIN (
       SELECT conversation_id,
         SUM(COALESCE(created_by, '') <> ? AND COALESCE(created_by, '') NOT LIKE ?) AS pendientes,
         MIN(CASE WHEN COALESCE(created_by, '') <> ? AND COALESCE(created_by, '') NOT LIKE ? THEN send_at END) AS proximo,
         MIN(CASE WHEN created_by = ? THEN send_at END) AS auto_proximo
       FROM scheduled_messages
       WHERE status = 'pendiente' AND batch_id IS NULL
       GROUP BY conversation_id
     ) seg ON seg.conversation_id = conv.id
     -- Un solo salto al último mensaje (índice conversation_id, id) en vez de
     -- 3 subconsultas que recorrían todo el historial de cada chat.
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = conv.id)
     ${where}
     ORDER BY conv.last_message_at DESC NULLS LAST, conv.id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...(clave ? [`%${clave}%`] : []), ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`, ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`, ORIGEN_SEGUIMIENTO_AUTO, ...params, limite + 1, offset)
    .all();

  const hayMas = results.length > limite;
  const conversations = hayMas ? results.slice(0, limite) : results;
  return json(chat
    ? { conversations, hay_mas: hayMas, chat: { conversation_id: chatId, ...chat } }
    : { conversations, hay_mas: hayMas });
}

export const onRequestGet = conAuth(handler);
