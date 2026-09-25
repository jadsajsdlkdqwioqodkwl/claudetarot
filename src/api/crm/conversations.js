/**
 * GET /api/crm/conversations — bandeja de entrada: una fila por conversación,
 * con el contacto y el último mensaje, ordenadas por actividad reciente.
 * Filtros opcionales: ?mine=1 (solo las asignadas a quien pregunta)
 * &agente=Nombre (las de esa asesora, dueña o compartiendo)
 * &etiqueta=contact|lead|purchase &q=texto
 * Con &chat=<id> trae además los últimos mensajes de ese chat (y lo marca
 * leído): el poll del CRM es un solo request en vez de dos — el plan gratis
 * de Workers tiene tope de requests por día.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { leerMensajes } from "./messages.js";
import { ORIGEN_SEGUIMIENTO_AUTO, PREFIJO_SEGUIMIENTO_LEAD } from "../../lib/crm-db.js";

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
  if (q) {
    condiciones.push("(c.profile_name LIKE ? OR c.wa_id LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

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
        c.id AS contact_id,
        c.wa_id,
        c.profile_name,
        c.ctwa_clid,
        c.ad_source_type,
        c.ad_headline,
        c.notes,
        c.shalom_code,
        lm.body AS last_body,
        lm.type AS last_type,
        lm.direction AS last_direction,
        seg.pendientes AS seg_pendientes,
        seg.proximo AS seg_proximo
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     -- Seguimientos manuales pendientes (ni envío masivo ni el automático de
     -- leads) para la etiqueta de la lista: una sola pasada por los
     -- pendientes (índice status, send_at), no una subconsulta por chat.
     LEFT JOIN (
       SELECT conversation_id, COUNT(*) AS pendientes, MIN(send_at) AS proximo
       FROM scheduled_messages
       WHERE status = 'pendiente' AND batch_id IS NULL AND COALESCE(created_by, '') <> ? AND COALESCE(created_by, '') NOT LIKE ?
       GROUP BY conversation_id
     ) seg ON seg.conversation_id = conv.id
     -- Un solo salto al último mensaje (índice conversation_id, id) en vez de
     -- 3 subconsultas que recorrían todo el historial de cada chat.
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = conv.id)
     ${where}
     ORDER BY conv.last_message_at DESC NULLS LAST, conv.id DESC
     LIMIT 200`
  )
    .bind(ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`, ...params)
    .all();

  return json(chat ? { conversations: results, chat: { conversation_id: chatId, ...chat } } : { conversations: results });
}

export const onRequestGet = conAuth(handler);
