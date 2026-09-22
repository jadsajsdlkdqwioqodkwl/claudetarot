/**
 * PATCH /api/crm/assign — { conversation_id, action }
 *   action: "reclamar" — se lo asigna a quien pide, solo si está libre
 *           "liberar"   — lo vuelve a dejar sin asignar
 *           "reasignar" — se lo asigna a quien pide aunque ya sea de otra
 *                         persona (transferir el chat/venta a propósito)
 *
 * "Reclamar" un chat ya tomado por otra persona devuelve 409 con quién lo
 * tiene, para que el frontend pregunte "¿se lo quitas a Fulana?" antes de
 * mandar "reasignar" — así no se pisan sin darse cuenta.
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function patch({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const accion = String(payload?.action || "");
  if (!["reclamar", "liberar", "reasignar"].includes(accion)) {
    return json({ error: "Acción inválida." }, 400);
  }

  const nombre = agent?.displayName || agent?.username || "Alguien";

  const conv = await env.CRM_DB.prepare("SELECT id, assigned_agent FROM conversations WHERE id = ?")
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  if (accion === "liberar") {
    await env.CRM_DB.prepare("UPDATE conversations SET assigned_agent = NULL WHERE id = ?").bind(conversationId).run();
    return json({ ok: true, assigned_agent: null });
  }

  if (accion === "reclamar" && conv.assigned_agent && conv.assigned_agent !== nombre) {
    return json({ error: `Este chat ya lo tiene ${conv.assigned_agent}.`, assigned_agent: conv.assigned_agent }, 409);
  }

  await env.CRM_DB.prepare("UPDATE conversations SET assigned_agent = ? WHERE id = ?").bind(nombre, conversationId).run();
  return json({ ok: true, assigned_agent: nombre });
}

export const onRequestPatch = conAuth(patch);
