/**
 * Seguimiento de interesados de un chat: la secuencia "tras no respuesta" de SU tienda.
 * El producto del chat trae la suya (producto.secuencia_id); sin producto, la general
 * (`ad_followup_sequence_id`), que es solo de la línea principal (Tarot Store).
 * Siempre que sale la bienvenida de anuncios (automática o a mano) sale también esto.
 */

import { obtenerAjuste, programarSecuenciaSeguimiento, ORIGEN_SEGUIMIENTO_AUTO } from "./crm-db.js";
import { productoPorId } from "./productos.js";

export async function secuenciaDeInteresados(db, { producto_id, linea_id }) {
  const producto = await productoPorId(db, producto_id);
  if (producto?.secuencia_id) return Number(producto.secuencia_id);
  return linea_id ? null : Number(await obtenerAjuste(db, "ad_followup_sequence_id")) || null;
}

/** Programa la secuencia del chat reemplazando la que ya tuviera de este origen (nunca se duplica). Devuelve cuántos pasos. */
export async function programarSeguimientoDeInteresados(env, conversationId) {
  const db = env.CRM_DB;
  const conv = await db.prepare("SELECT id, producto_id, linea_id, pausa_auto FROM conversations WHERE id = ?").bind(conversationId).first();
  if (!conv || conv.pausa_auto) return 0;
  const sequenceId = await secuenciaDeInteresados(db, conv);
  if (!sequenceId) return 0;
  await db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status = 'pendiente' AND created_by = ?")
    .bind(conversationId, ORIGEN_SEGUIMIENTO_AUTO).run();
  return programarSecuenciaSeguimiento(db, conversationId, sequenceId, ORIGEN_SEGUIMIENTO_AUTO);
}
