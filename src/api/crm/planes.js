/**
 * Planes con plantilla (src/lib/planes-plantilla.js): recojo en Shalom y
 * rescate de interesados, a los 4, 7 y 21 días del último mensaje del cliente.
 *
 * POST  /api/crm/planes — { conversation_id, plan: "shalom"|"lead" } → programa
 *       los 3 envíos. De una vendedora quedan 'por_aprobar'; del admin, aprobados.
 * GET   /api/crm/planes — (admin) los que esperan aprobación, por chat.
 * PATCH /api/crm/planes — (admin) { ids: [...], accion: "aprobar"|"rechazar" }
 */

import { conAuth } from "../../lib/crm-auth.js";
import { PLANES, PREFIJO_PLAN, IDIOMA_PLAN, pasosDelPlan, asegurarPlantillasDelPlan } from "../../lib/planes-plantilla.js";
import { productoPorId } from "../../lib/productos.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const esAdmin = (agent) => agent?.role === "admin";

async function post({ request, env, agent, waitUntil }) {
  const payload = await request.json().catch(() => null);
  const conversationId = Number(payload?.conversation_id);
  const plan = payload?.plan;
  if (!conversationId || !PLANES[plan]) return json({ error: "Falta el chat o el plan." }, 400);

  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, conv.last_inbound_at, conv.producto_id, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  ).bind(conversationId).first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);
  if (!conv.last_inbound_at) return json({ error: "El cliente nunca escribió: no se le puede mandar un plan." }, 400);

  const yaHay = await env.CRM_DB.prepare(
    "SELECT 1 FROM scheduled_messages WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND created_by LIKE ? LIMIT 1"
  ).bind(conversationId, `${PREFIJO_PLAN}%`).first();
  if (yaHay) return json({ error: "Este chat ya tiene un plan con plantilla programado. Cancélalo primero si quieres cambiarlo." }, 409);

  const producto = await productoPorId(env.CRM_DB, conv.producto_id);
  const pasos = pasosDelPlan(plan, { lastInboundAt: conv.last_inbound_at, nombre: conv.nombre, producto: producto?.nombre || "el kit de tarot" });
  const estado = esAdmin(agent) ? "pendiente" : "por_aprobar";
  const quien = agent?.displayName || agent?.username || "CRM";
  const origen = `${PREFIJO_PLAN} · ${PLANES[plan].titulo} · ${quien}`;
  await env.CRM_DB.batch(pasos.map((p) => env.CRM_DB.prepare(
    `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, template_name, template_language, template_params, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(conversationId, p.body, p.send_at, origen, p.template_name, IDIOMA_PLAN, JSON.stringify(p.params), estado)));

  // Las plantillas a revisión de Meta (si faltan), sin hacer esperar a la vendedora.
  const tarea = asegurarPlantillasDelPlan(env, conversationId, plan).catch((err) => console.error("Plantillas del plan:", err.message));
  if (waitUntil) waitUntil(tarea); else await tarea;
  return json({ ok: true, estado, pasos });
}

async function get({ env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo el administrador aprueba los planes." }, 403);
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.id, s.conversation_id, s.send_at, s.body, s.created_by, s.template_name,
            COALESCE(c.name, c.profile_name, c.wa_id) AS nombre, c.wa_id
     FROM scheduled_messages s
     JOIN conversations conv ON conv.id = s.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     WHERE s.status = 'por_aprobar'
     ORDER BY s.conversation_id, s.send_at`
  ).all();
  return json({ por_aprobar: results });
}

async function patch({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo el administrador aprueba los planes." }, 403);
  const payload = await request.json().catch(() => null);
  const ids = (Array.isArray(payload?.ids) ? payload.ids : []).map(Number).filter((n) => n > 0).slice(0, 300);
  if (!ids.length || !["aprobar", "rechazar"].includes(payload?.accion)) return json({ error: "Faltan ids o acción." }, 400);
  const nuevo = payload.accion === "aprobar" ? "pendiente" : "cancelado";
  await env.CRM_DB.batch(ids.map((id) =>
    env.CRM_DB.prepare("UPDATE scheduled_messages SET status = ? WHERE id = ? AND status = 'por_aprobar'").bind(nuevo, id)));
  return json({ ok: true, [payload.accion === "aprobar" ? "aprobados" : "rechazados"]: ids.length });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
