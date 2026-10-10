/**
 * Planes con plantilla (src/lib/planes-plantilla.js): recojo en Shalom y
 * rescate de interesados, a los 4, 7 y 21 días del último mensaje del cliente.
 *
 * POST  /api/crm/planes — { conversation_id, plan: "shalom"|"lead" } → programa
 *       los 3 envíos. De una vendedora quedan 'por_aprobar'; del admin, aprobados.
 * GET   /api/crm/planes — (admin) los que esperan aprobación, por chat.
 * PATCH /api/crm/planes — (admin) { ids: [...], accion: "aprobar"|"rechazar" }
 *       o { dias: "4,7,21", auto: true|false }: los días de los envíos y si la
 *       cadena de 24 h deja el rescate por aprobar sola (encadenarRescate).
 */

import { conAuth } from "../../lib/crm-auth.js";
import { PLANES, programarPlan, asegurarPlantillasDelPlan, leerDias } from "../../lib/planes-plantilla.js";
import { obtenerAjuste, guardarAjuste } from "../../lib/crm-db.js";

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

  const estado = esAdmin(agent) ? "pendiente" : "por_aprobar";
  const r = await programarPlan(env, conversationId, plan, { estado, quien: agent?.displayName || agent?.username });
  if (r.error) return json({ error: r.error }, 409);
  const pasos = r.pasos;

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
  const [dias, auto] = await Promise.all([obtenerAjuste(env.CRM_DB, "plan_dias"), obtenerAjuste(env.CRM_DB, "plan_auto")]);
  return json({ por_aprobar: results, dias: leerDias(dias), auto: auto !== "0" });
}

async function patch({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo el administrador aprueba los planes." }, 403);
  const payload = await request.json().catch(() => null);
  if (payload?.dias !== undefined || payload?.auto !== undefined) {
    if (payload.dias !== undefined) {
      const dias = leerDias(payload.dias);
      if (dias.join(",") !== String(payload.dias).replace(/\s/g, "")) return json({ error: "Pon 3 días de menor a mayor, entre 1 y 60 (ej. 4,7,21)." }, 400);
      await guardarAjuste(env.CRM_DB, "plan_dias", dias.join(","));
    }
    if (payload.auto !== undefined) await guardarAjuste(env.CRM_DB, "plan_auto", payload.auto ? "1" : "0");
    return json({ ok: true });
  }
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
