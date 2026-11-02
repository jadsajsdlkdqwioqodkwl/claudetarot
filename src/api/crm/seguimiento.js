/**
 * El control «Seguimiento» del chat (la barra grande debajo de la cabecera).
 *
 * GET  /api/crm/seguimiento?conversation_id=N →
 *      { activo, proximo, pendientes: [{ id, send_at, resumen }], plan: { titulo, universal, pasos } | null,
 *        fuente: { tipo: "rapida", quick_reply_id } | { tipo: "universal" } | null,
 *        motivo: "cliente" | "apagado" | null, ventana_abierta, compro, dia_chat }
 *      `activo`: hay una cadena automática pendiente (rápida, plan universal, anuncio, sugerencia).
 *      `plan`: lo que se programaría al reactivar: los pasos de la última respuesta rápida con
 *      seguimiento que salió en el chat (o el plan universal, si esa rápida lo usa o si no hubo rápida).
 * POST /api/crm/seguimiento — { conversation_id, accion: "reactivar", pasos? } | { conversation_id, accion: "apagar" }
 *      reactivar: programa el plan (con los cambios de `pasos`, solo para este chat); apagar: cancela
 *      la cadena automática pendiente (lo manual no se toca).
 */

import { conAuth } from "../../lib/crm-auth.js";
import {
  esOrigenAutomatico, pasosDeSeguimientoRapida, pasosUniversales, programarSeguimientoDeRapida,
  programarPasosEnChat, aplicarEdicionesDePasos, cancelarSeguimientosDeLead, origenSeguimientoLead
} from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const aMs = (t) => (t ? new Date(String(t).replace(" ", "T") + (String(t).includes("Z") ? "" : "Z")).getTime() : 0);

/** El plan que se le programaría a este chat al reactivar (la última rápida con seguimiento, o el universal). */
async function planDelChat(db, conversationId) {
  const m = await db.prepare(
    `SELECT m.quick_reply_id FROM messages m JOIN quick_replies q ON q.id = m.quick_reply_id
     WHERE m.conversation_id = ? AND m.direction = 'out'
       AND (q.followup_universal = 1 OR q.followup_pasos IS NOT NULL OR NULLIF(TRIM(COALESCE(q.followup_body, '')), '') IS NOT NULL)
     ORDER BY m.id DESC LIMIT 1`
  ).bind(conversationId).first();
  if (m?.quick_reply_id) {
    const q = await pasosDeSeguimientoRapida(db, m.quick_reply_id);
    if (q?.pasos.length) return { plan: { titulo: q.titulo, universal: q.universal, pasos: q.pasos }, fuente: { tipo: "rapida", quick_reply_id: m.quick_reply_id } };
  }
  const u = (await pasosUniversales(db)).filter((p) => p.activo !== false);
  if (u.length) return { plan: { titulo: "Plan universal", universal: true, pasos: u }, fuente: { tipo: "universal" } };
  return { plan: null, fuente: null };
}

const resumenPaso = (p) => ({
  horas: Number(p.horas) || 20, body: p.body || "", plantilla: p.plantilla || null, desde: p.desde || null,
  media_type: p.media_key ? p.media_type || "image" : null
});

async function get({ request, env }) {
  const conversationId = Number(new URL(request.url).searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);
  const db = env.CRM_DB;
  const conv = await db.prepare("SELECT id, last_inbound_at, created_at, etapa, meta_tags FROM conversations WHERE id = ?").bind(conversationId).first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);
  const { results: pendientes } = await db.prepare(
    "SELECT id, created_by, send_at, body, template_name, batch_id FROM scheduled_messages WHERE conversation_id = ? AND status = 'pendiente' ORDER BY send_at"
  ).bind(conversationId).all();
  const auto = (pendientes || []).filter((s) => !s.batch_id && esOrigenAutomatico(s.created_by));
  const { plan, fuente } = await planDelChat(db, conversationId);
  let motivo = null;
  if (!auto.length) {
    const ultimo = await db.prepare(
      "SELECT created_at FROM scheduled_messages WHERE conversation_id = ? AND status = 'cancelado' AND batch_id IS NULL ORDER BY id DESC LIMIT 1"
    ).bind(conversationId).first();
    if (ultimo) motivo = aMs(conv.last_inbound_at) > aMs(ultimo.created_at) ? "cliente" : "apagado";
  }
  return json({
    activo: auto.length > 0,
    proximo: auto[0]?.send_at || null,
    pendientes: auto.map((s) => ({ id: s.id, send_at: s.send_at, resumen: s.template_name ? `Plantilla: ${s.template_name}` : String(s.body || "").slice(0, 120) })),
    plan: plan ? { titulo: plan.titulo, universal: plan.universal, pasos: plan.pasos.map(resumenPaso) } : null,
    fuente,
    motivo,
    ventana_abierta: aMs(conv.last_inbound_at) + 24 * 3600 * 1000 > Date.now(),
    compro: (conv.etapa || 0) >= 5 || /\bpurchase\b/.test(conv.meta_tags || ""),
    dia_chat: Math.floor((Date.now() - aMs(conv.created_at)) / 86400000) + 1
  });
}

async function post({ request, env, agent }) {
  const payload = await request.json().catch(() => null);
  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);
  const db = env.CRM_DB;
  if (payload?.accion === "apagar") {
    await cancelarSeguimientosDeLead(db, conversationId);
    return json({ ok: true });
  }
  if (payload?.accion !== "reactivar") return json({ error: "accion debe ser reactivar o apagar." }, 400);
  const editados = Array.isArray(payload?.pasos) ? payload.pasos.slice(0, 6) : null;
  const { plan, fuente } = await planDelChat(db, conversationId);
  if (!plan) return json({ error: "Este chat no tiene ningún plan de seguimiento que reactivar (ninguna respuesta rápida con seguimiento y no hay plan universal)." }, 422);
  const motivo = fuente.tipo === "rapida"
    ? await programarSeguimientoDeRapida(db, conversationId, fuente.quick_reply_id, editados)
    : await programarPasosEnChat(db, conversationId, aplicarEdicionesDePasos(plan.pasos, editados), origenSeguimientoLead(agent?.displayName || agent?.username || null));
  if (motivo) return json({ error: motivo }, 422);
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
