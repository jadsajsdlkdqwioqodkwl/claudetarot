/**
 * "Fulana está viendo este chat" — presencia en tiempo real (por polling,
 * no hay WebSockets en este Worker). El frontend manda un heartbeat cada
 * pocos segundos mientras tiene un chat abierto; se considera "reciente"
 * (y por lo tanto visible para las demás) durante 12 segundos.
 *
 * GET    /api/crm/presence?conversation_id=1 — quién más lo tiene abierto
 * POST   /api/crm/presence { conversation_id } — heartbeat
 * DELETE /api/crm/presence { conversation_id } — avisa que lo cerró (best-effort)
 */

import { conAuth } from "../../lib/crm-auth.js";
import { marcarPresencia, quitarPresencia, agentesViendoChat } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

function nombreDe(agent) {
  return agent?.displayName || agent?.username || "Alguien";
}

async function get({ request, env, agent }) {
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const viendo = await agentesViendoChat(env.CRM_DB, conversationId, nombreDe(agent));
  return json({ viendo });
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  await marcarPresencia(env.CRM_DB, conversationId, nombreDe(agent));
  return json({ ok: true });
}

async function del({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  await quitarPresencia(env.CRM_DB, conversationId, nombreDe(agent));
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestDelete = conAuth(del);
