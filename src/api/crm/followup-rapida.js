/**
 * GET  /api/crm/followup-rapida?conversation_id=&quick_reply_id= → { titulo, pasos } (lo que se programaría)
 * POST /api/crm/followup-rapida — { conversation_id, quick_reply_id, pasos? }
 * Vuelve a programar el seguimiento («si no responde») de una respuesta rápida
 * que ya se mandó en ese chat: el chip de la burbuja. Si mandamos otro
 * mensaje después, ese seguimiento se canceló (cancelarSeguimientosDeLead) y
 * con esto la vendedora lo reactiva de un toque. Mismas reglas de siempre
 * (23 h, ya compró, seguimiento manual): si no se puede, dice por qué.
 * Antes de programarlo la vendedora ve qué pasos saldrán y puede cambiar su texto y su espera, o quitar
 * alguno, solo para este chat (`pasos`: [{ horas, body, activo }] por posición).
 */

import { conAuth } from "../../lib/crm-auth.js";
import { programarSeguimientoDeRapida, pasosDeSeguimientoRapida } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

// Solo si esa respuesta rápida salió de verdad en este chat.
const seMando = (db, conversationId, quickReplyId) =>
  db.prepare("SELECT 1 FROM messages WHERE conversation_id = ? AND quick_reply_id = ? LIMIT 1").bind(conversationId, quickReplyId).first();

async function get({ request, env }) {
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation_id"));
  const quickReplyId = Number(url.searchParams.get("quick_reply_id"));
  if (!conversationId || !quickReplyId) return json({ error: "Falta conversation_id o quick_reply_id." }, 400);
  if (!(await seMando(env.CRM_DB, conversationId, quickReplyId))) return json({ error: "Esa respuesta rápida no se mandó en este chat." }, 404);
  const q = await pasosDeSeguimientoRapida(env.CRM_DB, quickReplyId);
  if (!q) return json({ error: "Esa respuesta rápida ya no existe." }, 404);
  return json({
    titulo: q.titulo,
    pasos: q.pasos.map((p) => ({ horas: Number(p.horas) || 20, body: p.body || "", plantilla: p.plantilla || null, media_type: p.media_key ? p.media_type || "image" : null }))
  });
}

async function post({ request, env }) {
  const payload = await request.json().catch(() => null);
  const conversationId = Number(payload?.conversation_id);
  const quickReplyId = Number(payload?.quick_reply_id);
  if (!conversationId || !quickReplyId) return json({ error: "Falta conversation_id o quick_reply_id." }, 400);
  if (!(await seMando(env.CRM_DB, conversationId, quickReplyId))) return json({ error: "Esa respuesta rápida no se mandó en este chat." }, 404);
  const motivo = await programarSeguimientoDeRapida(env.CRM_DB, conversationId, quickReplyId, Array.isArray(payload?.pasos) ? payload.pasos.slice(0, 4) : null);
  if (motivo) return json({ error: motivo }, 422);
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
