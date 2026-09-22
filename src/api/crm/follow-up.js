/** PATCH /api/crm/follow-up — { conversation_id, follow_up } → marca/desmarca la estrella de seguimiento. */

import { conAuth } from "../../lib/crm-auth.js";
import { marcarSeguimiento } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  await marcarSeguimiento(env.CRM_DB, conversationId, Boolean(payload?.follow_up));
  return json({ ok: true });
}

export const onRequestPatch = conAuth(patch);
