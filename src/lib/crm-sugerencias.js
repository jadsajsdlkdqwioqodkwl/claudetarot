/**
 * Que las sugerencias no se acumulen: una sugerencia para un chat deja de
 * tener sentido en cuanto alguien le escribe al cliente (a mano, una
 * respuesta rápida, otra sugerencia o un automático), si el cliente ya
 * compró. Las que quedaron con la ventana de 24 h cerrada NO se cierran: siguen en la cola «Atención
 * pendiente» para que la asesora evalúe mandarles una plantilla (2026-10-18). Se cierran solas (estado
 * 'obsoleta', con el motivo en resuelto_por) antes de listar o contar.
 * Dos UPDATE en un batch; nada de IA.
 * Y el cron (sugerirSinPregunta) propone «agéndale seguimiento o hazle una pregunta» cuando el último mensaje
 * nuestro no tiene pregunta y el chat no tiene nada programado (2026-10-23).
 */
import { proponerPlanPorVentanaCerrada } from "./planes-plantilla.js";
import { enSilencio } from "./horario.js";

/**
 * Un seguimiento que cuenta como «tiene seguimiento» para la recomendación sin pregunta. El rescate universal
 * (día 7 y «Rescate de interesado») no cuenta: está agendado a casi todos los leads, sin importar la conversación.
 */
const SEGUIMIENTO_PROPIO = "instr(sm.created_by, 'Automático (día 7)') = 0 AND instr(sm.created_by, 'Rescate de interesado') = 0";

export async function limpiarSugerenciasViejas(db, env = null) {
  // Con `env`, lo que vence por ventana cerrada se reemplaza por un plan con plantilla por aprobar.
  if (env) await proponerPlanPorVentanaCerrada(env).catch((err) => console.error("Plan por ventana cerrada:", err.message));
  await db.batch([
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'se le escribió al cliente', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo IN ('seguimiento', 'envio', 'sin_pregunta') AND conversation_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = asesor_sugerencias.conversation_id
                     AND m.direction = 'out' AND m.created_at > asesor_sugerencias.created_at)`
    ),
    // «Sin pregunta»: ya no hace falta cuando el chat tiene un seguimiento programado.
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'ya tiene seguimiento', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo = 'sin_pregunta'
         AND EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.conversation_id = asesor_sugerencias.conversation_id
                     AND sm.status IN ('pendiente', 'por_aprobar') AND ${SEGUIMIENTO_PROPIO})`
    ),
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'ya compró', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo = 'seguimiento'
         AND conversation_id IN (SELECT id FROM conversations WHERE etapa >= 5)`
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
  await sugerirSinPregunta(db).catch((err) => console.error("Sugerir sin pregunta:", err.message));
  let { results } = await db.prepare(
    `SELECT s.id, s.conversation_id FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND s.tipo IN ('seguimiento', 'sin_pregunta') AND s.reflotada_at IS NULL AND conv.blocked = 0
       AND conv.last_inbound_at >= datetime('now', '-24 hours')
     ORDER BY s.created_at ASC, s.id ASC LIMIT ?`
  ).bind(POR_PASADA).all();
  if (!results.length) {
    ({ results } = await db.prepare(
      `SELECT s.id, s.conversation_id FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
       WHERE s.estado = 'pendiente' AND s.tipo IN ('seguimiento', 'sin_pregunta') AND s.reflotada_at < datetime('now', ?) AND conv.blocked = 0
         AND conv.last_inbound_at >= datetime('now', '-24 hours')
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
 * Último mensaje nuestro de un chat activo SIN pregunta (ni «?» ni «¿»), sin nada programado y sin una
 * sugerencia ya hecha para ese mensaje: se propone «agéndale seguimiento o hazle una pregunta». Lo sube
 * reflotarSugerencia. Solo chats dentro de la ventana de 24 h y de clientes que todavía no compraron.
 */
export async function sugerirSinPregunta(db) {
  const { results } = await db.prepare(
    `SELECT conv.id AS conversation_id FROM conversations conv
     JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE conversation_id = conv.id)
     WHERE m.direction = 'out' AND m.type = 'text' AND m.body IS NOT NULL AND m.body <> ''
       AND m.body NOT LIKE '%?%' AND m.body NOT LIKE '%¿%'
       AND conv.blocked = 0 AND COALESCE(conv.etapa, 0) < 5
       AND conv.last_inbound_at >= datetime('now', '-24 hours')
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.conversation_id = conv.id AND sm.status IN ('pendiente', 'por_aprobar') AND ${SEGUIMIENTO_PROPIO})
       AND NOT EXISTS (SELECT 1 FROM asesor_sugerencias s WHERE s.conversation_id = conv.id AND s.tipo = 'sin_pregunta' AND s.created_at >= m.created_at)
     LIMIT 50`
  ).all();
  if (!results.length) return 0;
  const motivo = "Tu último mensaje no tenía pregunta y el chat no tiene seguimiento: agéndale seguimiento o hazle una pregunta.";
  await db.batch(results.map((r) => db.prepare(
    "INSERT INTO asesor_sugerencias (tipo, conversation_id, texto, motivo, origen) VALUES ('sin_pregunta', ?, '', ?, 'cron (sin pregunta)')"
  ).bind(r.conversation_id, motivo)));
  return results.length;
}
