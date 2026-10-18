/**
 * Que las sugerencias no se acumulen: una sugerencia para un chat deja de
 * tener sentido en cuanto alguien le escribe al cliente (a mano, una
 * respuesta rápida, otra sugerencia o un automático), si el cliente ya
 * compró o si se cerró su ventana de 24 h. Se cierran solas (estado
 * 'obsoleta', con el motivo en resuelto_por) antes de listar o contar.
 * Tres UPDATE en un batch; nada de IA.
 */
import { proponerPlanPorVentanaCerrada } from "./planes-plantilla.js";
import { enSilencio } from "./horario.js";

export async function limpiarSugerenciasViejas(db, env = null) {
  // Con `env`, lo que vence por ventana cerrada se reemplaza por un plan con plantilla por aprobar.
  if (env) await proponerPlanPorVentanaCerrada(env).catch((err) => console.error("Plan por ventana cerrada:", err.message));
  await db.batch([
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'se le escribió al cliente', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo IN ('seguimiento', 'envio') AND conversation_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = asesor_sugerencias.conversation_id
                     AND m.direction = 'out' AND m.created_at > asesor_sugerencias.created_at)`
    ),
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'ya compró', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo = 'seguimiento'
         AND conversation_id IN (SELECT id FROM conversations WHERE etapa >= 5)`
    ),
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'se cerró su ventana de 24 h', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo = 'seguimiento'
         AND conversation_id IN (SELECT id FROM conversations WHERE last_inbound_at IS NULL OR last_inbound_at < datetime('now', '-24 hours'))`
    )
  ]);
}

/**
 * Cada 10 min (cron) sube a la bandeja las recomendaciones pendientes del asesor, para que las vendedoras
 * las vean poco a poco y no de golpe: hasta POR_PASADA chats por pasada, primero las que nunca subieron
 * (la más antigua primero) y, si no queda ninguna, vuelve a subir UNA que sigue pendiente y subió hace más
 * de VUELVE_A_SUBIR_H horas (nadie la atendió). Dentro del chat se ve el mensaje recomendado, editable,
 * con «Enviar» y «Descartar». No sube de madrugada (horario de envío). Devuelve los ids reflotados.
 */
const POR_PASADA = 3;
const VUELVE_A_SUBIR_H = 3;
export async function reflotarSugerencia(env) {
  const db = env.CRM_DB;
  if (!db || enSilencio(Date.now(), env.HORARIO_ENVIO)) return [];
  await limpiarSugerenciasViejas(db).catch((err) => console.error("Limpiar sugerencias:", err.message));
  let { results } = await db.prepare(
    `SELECT s.id, s.conversation_id FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND s.tipo = 'seguimiento' AND s.reflotada_at IS NULL AND conv.blocked = 0
     ORDER BY s.created_at ASC, s.id ASC LIMIT ?`
  ).bind(POR_PASADA).all();
  if (!results.length) {
    ({ results } = await db.prepare(
      `SELECT s.id, s.conversation_id FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
       WHERE s.estado = 'pendiente' AND s.tipo = 'seguimiento' AND s.reflotada_at < datetime('now', ?) AND conv.blocked = 0
       ORDER BY s.reflotada_at ASC LIMIT 1`
    ).bind(`-${VUELVE_A_SUBIR_H} hours`).all());
  }
  if (!results.length) return [];
  await db.batch(results.flatMap((s) => [
    db.prepare("UPDATE asesor_sugerencias SET reflotada_at = datetime('now') WHERE id = ?").bind(s.id),
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").bind(s.conversation_id)
  ]));
  return results.map((s) => s.conversation_id);
}

/**
 * Cada 10 min (cron) sube a la bandeja hasta 2 chats cuyo último mensaje es del cliente y nadie le contestó
 * (etiqueta «Falta respuesta»), sin que la vendedora los haya marcado «Atendido». Un chat solo vuelve a subir
 * pasadas REFLOTE_RESP_H horas, y solo mientras el mensaje del cliente tenga menos de 3 días. No sube de
 * madrugada. Es solo orden de bandeja: no manda nada ni toca «sin leer». Devuelve los ids reflotados.
 */
const REFLOTE_RESP_H = 4;
export async function reflotarSinRespuesta(env) {
  const db = env.CRM_DB;
  if (!db || enSilencio(Date.now(), env.HORARIO_ENVIO)) return [];
  const { results } = await db.prepare(
    `SELECT conv.id FROM conversations conv
     JOIN messages lm ON lm.id = (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = conv.id)
     WHERE conv.hidden = 0 AND conv.blocked = 0 AND lm.direction = 'in' AND lm.type NOT IN ('reaction', 'sticker')
       AND conv.last_inbound_at >= datetime('now', '-3 days') AND conv.last_message_at <= datetime('now', ?)
       AND (conv.atendido_at IS NULL OR conv.atendido_at < conv.last_inbound_at)
       AND (conv.reflotada_resp_at IS NULL OR conv.reflotada_resp_at < datetime('now', ?))
     ORDER BY conv.last_inbound_at ASC LIMIT 2`
  ).bind(`-${REFLOTE_RESP_H} hours`, `-${REFLOTE_RESP_H} hours`).all();
  if (!results.length) return [];
  await db.batch(results.map((c) =>
    db.prepare("UPDATE conversations SET last_message_at = datetime('now'), reflotada_resp_at = datetime('now') WHERE id = ?").bind(c.id)));
  return results.map((c) => c.id);
}
