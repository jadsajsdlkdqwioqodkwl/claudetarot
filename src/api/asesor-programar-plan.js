/**
 * Programar un plan de seguimiento con nombre a chats antiguos (clave del asesor; pedido del dueño 2026-11-04:
 * «agenda este nuevo seguimiento a los antiguos clientes»).
 *
 * POST /api/asesor/programar-plan { plan_id, dias_min = 7, dias_max = 60, limite = 100, escalonar = 3, simular?: bool,
 *                                   desde_hoy = true, saltar_con_cadena = false, desde_id = 0 }
 *   `desde_id`: solo chats con id mayor (para paginar cuando a algunos no se les pudo programar y siguen siendo candidatos).
 *   → { candidatos, programados, sin_programar: [{ conversation_id, motivo }], ids }
 *   `desde_hoy: false`: el plan se programa como lo haría una rápida (día N contado desde el primer mensaje del cliente, con el
 *   tope de 168 h y reanudando desde el paso que falta): para los chats de la semana que aún no tienen cadena.
 *   `saltar_con_cadena: true`: no toca los chats que ya tienen cualquier cadena automática pendiente (la que sea).
 *
 * Elige chats de la línea principal creados entre `dias_min` y `dias_max` días atrás, que escribieron alguna vez, no
 * compraron, no están bloqueados ni en pausa, y que todavía no tienen pendiente ningún paso de ese plan. A cada uno
 * le programa el plan «desde hoy»: el día 1 del plan es mañana (o pasado, o en 3 días: `escalonar` reparte los
 * chats en esa cantidad de días de arranque por id, para no mandar miles de plantillas el mismo día). Los textos del
 * día 0 no salen (fuera de las 24 h); salen solo las plantillas, que Meta cobra fuera de la semana gratis: por eso
 * esto no lo dispara nadie solo, lo pide el dueño por escrito. La cadena resultante es como cualquier otra: se ve en
 * la barra del chat y la detiene el botón.
 * Cada llamada procesa hasta `limite` chats; se repite hasta que `candidatos` sea 0.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { pasosDePlan, programarPasosEnChat, origenPlan, ORIGEN_SEGUIMIENTO_AUTO, PREFIJO_SEGUIMIENTO_LEAD, PREFIJO_SEGUIMIENTO_RAPIDA, PREFIJO_PLAN } from "../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const DIA_MS = 24 * 3600 * 1000;

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const p = await request.json().catch(() => null);
  const planId = Number(p?.plan_id);
  if (!planId) return json({ error: "Falta plan_id." }, 400);
  const plan = await pasosDePlan(env.CRM_DB, planId, null);
  if (!plan?.pasos.length) return json({ error: "Ese plan no existe o no tiene pasos prendidos." }, 404);
  const diasMin = Math.max(0, Number(p.dias_min ?? 7) || 0);
  const diasMax = Math.max(diasMin, Number(p.dias_max ?? 60) || 60);
  const limite = Math.min(300, Math.max(1, Number(p.limite) || 100));
  const escalonar = Math.min(7, Math.max(1, Number(p.escalonar) || 3));
  const origen = origenPlan(plan.nombre);
  const desdeHoy = p.desde_hoy !== false;
  const sinCadena = p.saltar_con_cadena
    ? `AND NOT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = c.id AND s.status = 'pendiente' AND s.batch_id IS NULL AND s.mandar_siempre = 0
         AND (s.created_by = '${ORIGEN_SEGUIMIENTO_AUTO}' OR s.created_by LIKE '${PREFIJO_SEGUIMIENTO_LEAD}%' OR s.created_by LIKE '${PREFIJO_SEGUIMIENTO_RAPIDA}%' OR s.created_by LIKE '${PREFIJO_PLAN}%'))`
    : "";
  const { results } = await env.CRM_DB.prepare(
    `SELECT c.id FROM conversations c
     WHERE c.last_inbound_at IS NOT NULL AND COALESCE(c.etapa, 0) < 5 AND COALESCE(c.meta_tags, '') NOT LIKE '%purchase%'
       AND COALESCE(c.linea_id, 0) = 0 AND COALESCE(c.blocked, 0) = 0 AND COALESCE(c.pausa_auto, 0) = 0
       AND c.created_at < datetime('now', ?) AND c.created_at >= datetime('now', ?)
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = c.id AND s.created_by = ? AND s.status IN ('pendiente', 'enviando'))
       AND c.id > ?
       ${sinCadena}
     ORDER BY c.id LIMIT ?`
  ).bind(`-${diasMin} days`, `-${diasMax} days`, origen, Number(p.desde_id) || 0, limite).all();
  const ids = (results || []).map((r) => r.id);
  if (p.simular) return json({ candidatos: ids.length, programados: 0, sin_programar: [], ids });
  const ahora = Date.now();
  const sinProgramar = [];
  let programados = 0;
  for (const id of ids) {
    // El día 1 del plan es mañana para un tercio de los chats, pasado para otro tercio, etc. (por id, estable).
    const inicioMs = ahora + (id % escalonar) * DIA_MS;
    const meta = desdeHoy ? { plan_id: plan.id, brazo: "A", inicioMs, sinTope7d: true } : { plan_id: plan.id, brazo: "A" };
    const motivo = await programarPasosEnChat(env.CRM_DB, id, plan.pasos, origen, meta).catch((err) => err.message);
    if (motivo) sinProgramar.push({ conversation_id: id, motivo });
    else programados++;
  }
  return json({ candidatos: ids.length, programados, sin_programar: sinProgramar, ids });
}
