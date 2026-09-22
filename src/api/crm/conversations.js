/**
 * GET /api/crm/conversations — bandeja de entrada: una fila por conversación,
 * con el contacto y el último mensaje, ordenadas por actividad reciente.
 * Filtros opcionales: ?stage=nuevo&q=texto (busca en nombre/wa_id).
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function handler({ request, env }) {
  const url = new URL(request.url);
  const stage = url.searchParams.get("stage");
  const q = url.searchParams.get("q");

  const condiciones = [];
  const params = [];
  if (stage) {
    condiciones.push("c.stage = ?");
    params.push(stage);
  }
  if (q) {
    condiciones.push("(c.name LIKE ? OR c.profile_name LIKE ? OR c.wa_id LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const { results } = await env.CRM_DB.prepare(
    `SELECT
        conv.id AS conversation_id,
        conv.status,
        conv.unread_count,
        conv.last_message_at,
        c.id AS contact_id,
        c.wa_id,
        c.name,
        c.profile_name,
        c.stage,
        c.notes,
        c.tags,
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
