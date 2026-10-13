/**
 * POST /api/crm/followup-rapida — { conversation_id, quick_reply_id }
 * Vuelve a programar el seguimiento («si no responde») de una respuesta rápida
 * que ya se mandó en ese chat: el chip de la burbuja. Si mandamos otro
 * mensaje después, ese seguimiento se canceló (cancelarSeguimientosDeLead) y
 * con esto la vendedora lo reactiva de un toque. Mismas reglas de siempre
 * (23 h, ya compró, seguimiento manual): si no se puede, dice por qué.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { programarSeguimientoDeRapida } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function post({ request, env }) {
  const payload = await request.json().catch(() => null);
  const conversationId = Number(payload?.conversation_id);
  const quickReplyId = Number(payload?.quick_reply_id);
  if (!conversationId || !quickReplyId) return json({ error: "Falta conversation_id o quick_reply_id." }, 400);
  // Solo si esa respuesta rápida salió de verdad en este chat.
  const fila = await env.CRM_DB.prepare("SELECT 1 FROM messages WHERE conversation_id = ? AND quick_reply_id = ? LIMIT 1").bind(conversationId, quickReplyId).first();
  if (!fila) return json({ error: "Esa respuesta rápida no se mandó en este chat." }, 404);
  const motivo = await programarSeguimientoDeRapida(env.CRM_DB, conversationId, quickReplyId);
  if (motivo) return json({ error: motivo }, 422);
  return json({ ok: true });
}

export const onRequestPost = conAuth(post);
