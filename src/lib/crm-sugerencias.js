/**
 * Que las sugerencias no se acumulen: una sugerencia para un chat deja de
 * tener sentido en cuanto alguien le escribe al cliente (a mano, una
 * respuesta rápida, otra sugerencia o un automático), si el cliente ya
 * compró o si se cerró su ventana de 24 h. Se cierran solas (estado
 * 'obsoleta', con el motivo en resuelto_por) antes de listar o contar.
 * Tres UPDATE en un batch; nada de IA.
 */
export async function limpiarSugerenciasViejas(db) {
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
