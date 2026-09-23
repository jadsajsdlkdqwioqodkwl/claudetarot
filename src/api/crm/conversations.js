/**
 * GET /api/crm/conversations — bandeja de entrada: una fila por conversación,
 * con el contacto y el último mensaje, ordenadas por actividad reciente.
 * Filtros opcionales: ?mine=1 (solo las asignadas a quien pregunta) &q=texto
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function handler({ request, env, agent }) {
  const url = new URL(request.url);
  const soloMias = url.searchParams.get("mine") === "1";
  const q = url.searchParams.get("q");

  const condiciones = [];
  const params = [];
  if (soloMias) {
    condiciones.push("conv.assigned_agent = ?");
    params.push(agent?.displayName || agent?.username || "");
  }
  if (q) {
    condiciones.push("(c.profile_name LIKE ? OR c.wa_id LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const { results } = await env.CRM_DB.prepare(
    `SELECT
        conv.id AS conversation_id,
        conv.status,
        conv.unread_count,
        conv.assigned_agent,
        conv.shared_with,
        conv.last_message_at,
        c.id AS contact_id,
        c.wa_id,
        c.profile_name,
        c.ctwa_clid,
        c.ad_source_type,
        c.ad_headline,
        c.notes,
        (SELECT body FROM messages m WHERE m.conversation_id = conv.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT type FROM messages m WHERE m.conversation_id = conv.id ORDER BY m.id DESC LIMIT 1) AS last_type,
        (SELECT direction FROM messages m WHERE m.conversation_id = conv.id ORDER BY m.id DESC LIMIT 1) AS last_direction
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     ${where}
     ORDER BY conv.last_message_at DESC NULLS LAST, conv.id DESC
     LIMIT 200`
  )
    .bind(...params)
    .all();

  return json({ conversations: results });
}

export const onRequestGet = conAuth(handler);
