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
 * Cada 10 min (cron) sube a la bandeja UN chat con recomendación pendiente del asesor (la más antigua que
 * aún no subió), para que las vendedoras las vean de a una y no de golpe. Dentro del chat se ve el mensaje
 * recomendado, editable, con «Enviar» y «Descartar». No sube de madrugada (horario de envío). Devuelve el
 * id del chat reflotado o null.
 */
export async function reflotarSugerencia(env) {
  const db = env.CRM_DB;
  if (!db || enSilencio(Date.now(), env.HORARIO_ENVIO)) return null;
  await limpiarSugerenciasViejas(db).catch((err) => console.error("Limpiar sugerencias:", err.message));
  const s = await db.prepare(
    `SELECT s.id, s.conversation_id FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND s.tipo = 'seguimiento' AND s.reflotada_at IS NULL AND conv.blocked = 0
     ORDER BY s.created_at ASC, s.id ASC LIMIT 1`
  ).first();
  if (!s) return null;
  await db.batch([
    db.prepare("UPDATE asesor_sugerencias SET reflotada_at = datetime('now') WHERE id = ?").bind(s.id),
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").bind(s.conversation_id)
  ]);
  return s.conversation_id;
}
