/**
 * Oferta de collar extra (dueño, 2026-11-13): una sola vez por chat.
 * La ofrecen el seguimiento de +20 h de varias respuestas rápidas (texto) y el paso del día 5 del plan de 7 días
 * (plantilla seg_d5_ultimo_bono). El paso del día 5 solo sale a quien todavía no recibió ninguna oferta de collar
 * (el cron lo cancela si ya la tuvo; ver procesarSeguimientosVencidos en crm-cron.js).
 */
export const PLANTILLAS_OFERTA_COLLAR = ["seg_d5_ultimo_bono", "seg7_collar_extra"];

/** ¿Este texto ofrece un collar de regalo ADEMÁS del que trae el kit? (la bienvenida, que lista el collar incluido, no cuenta). */
export function ofreceCollarExtra(texto) {
  const t = String(texto || "");
  const b = t.toLowerCase();
  if (/collar amuleto extra|collar extra|otro collar|collar adicional/.test(b)) return true;
  return t.includes("COLLAR AMULETO") && /EXTRA|GRATIS|adicional/.test(t);
}

/** ¿Ya le salió a este chat una oferta de collar extra (mensaje enviado o plantilla de oferta)? */
export async function yaRecibioOfertaCollar(db, conversationId) {
  const plantillas = PLANTILLAS_OFERTA_COLLAR.map(() => "?").join(",");
  const plantilla = await db.prepare(
    `SELECT 1 FROM scheduled_messages WHERE conversation_id = ? AND status = 'enviado' AND template_name IN (${plantillas}) LIMIT 1`
  ).bind(conversationId, ...PLANTILLAS_OFERTA_COLLAR).first().catch(() => null);
  if (plantilla) return true;
  const { results } = await db.prepare(
    `SELECT body FROM messages WHERE conversation_id = ? AND direction = 'out' AND COALESCE(sent_by, '') NOT LIKE 'Bienvenida%'
       AND (instr(body, 'COLLAR AMULETO') > 0 OR instr(lower(body), 'collar') > 0)`
  ).bind(conversationId).all().catch(() => ({ results: [] }));
  return (results || []).some((m) => ofreceCollarExtra(m.body));
}
