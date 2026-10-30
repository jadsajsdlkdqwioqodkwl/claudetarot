/**
 * Staging de boletas que el dueño manda desde su número personal al número
 * empresa de WhatsApp. El Worker solo guarda el media_id (persistente en Meta)
 * y espera el "ENVIAR" en mayúsculas para activar el lote. La Routine descarga
 * las fotos, lee los datos con visión y despacha cada boleta.
 *
 * Tabla: boletas_staging (migración 0064)
 */

const NUMERO_DUENO_DEFAULT = "51927633099";

export function numeroDueno(env) {
  return env.NUMERO_DUENO || NUMERO_DUENO_DEFAULT;
}

export function esDueno(env, waId) {
  return waId === numeroDueno(env);
}

/** Guarda una foto entrante del dueño; ignora duplicados (UNIQUE wa_message_id). */
export async function stagingGuardar(db, waMessageId, mediaId, mediaMime) {
  await db
    .prepare("INSERT OR IGNORE INTO boletas_staging (wa_message_id, media_id, media_mime) VALUES (?, ?, ?)")
    .bind(waMessageId, mediaId, mediaMime || "image/jpeg")
    .run();
}

/**
 * El dueño mandó "ENVIAR": marca todo lo pendiente con un lote_id timestamp
 * y devuelve cuántas fotos quedaron listas.
 */
export async function stagingActivarLote(db) {
  const loteId = new Date().toISOString().slice(0, 16).replace("T", "_");
  const { meta } = await db
    .prepare("UPDATE boletas_staging SET status = 'listo', lote_id = ? WHERE status = 'pendiente'")
    .bind(loteId)
    .run();
  return { loteId, cantidad: meta?.changes || 0 };
}

/** Lista los items listos para que la Routine los analice y despache. */
export async function stagingListarListos(db) {
  const { results } = await db
    .prepare(
      "SELECT id, wa_message_id, media_id, media_mime, lote_id, orden, created_at " +
      "FROM boletas_staging WHERE status = 'listo' ORDER BY lote_id, id"
    )
    .all();
  return results || [];
}

/** Actualiza solo los campos que se pasan (PATCH semántico: los que llegan null no se tocan). */
export async function stagingActualizar(db, id, { status, conversation_id, courier, nombre_boleta, dni_boleta, mensaje_texto, nro_orden, saldo, error } = {}) {
  await db
    .prepare(
      "UPDATE boletas_staging SET " +
      "status = COALESCE(?, status), conversation_id = COALESCE(?, conversation_id), " +
      "courier = COALESCE(?, courier), nombre_boleta = COALESCE(?, nombre_boleta), " +
      "dni_boleta = COALESCE(?, dni_boleta), mensaje_texto = COALESCE(?, mensaje_texto), " +
      "nro_orden = COALESCE(?, nro_orden), saldo = COALESCE(?, saldo), error = COALESCE(?, error) WHERE id = ?"
    )
    .bind(status ?? null, conversation_id ?? null, courier ?? null, nombre_boleta ?? null, dni_boleta ?? null, mensaje_texto ?? null, nro_orden ?? null, saldo ?? null, error ?? null, id)
    .run();
}

/**
 * Verifica si un NRO ORDEN ya fue procesado (status='enviado' o 'pendiente_ventana').
 * La Routine lo llama antes de despachar para evitar reenvíos si el dueño subió la misma foto dos veces.
 */
export async function stagingVerificarNroOrden(db, nroOrden) {
  return db
    .prepare("SELECT id, status, nombre_boleta, created_at FROM boletas_staging WHERE nro_orden = ? AND status IN ('enviado','pendiente_ventana') ORDER BY created_at DESC LIMIT 1")
    .bind(String(nroOrden))
    .first();
}

/**
 * Lista los items con status='pendiente_ventana' de una conversación concreta.
 * El Worker los envía automáticamente cuando el cliente responde al botón.
 */
export async function stagingListarPendientesVentana(db, conversationId) {
  const { results } = await db
    .prepare(
      "SELECT id, media_id, media_mime, orden, mensaje_texto, courier, saldo " +
      "FROM boletas_staging WHERE conversation_id = ? AND status = 'pendiente_ventana' ORDER BY orden, id"
    )
    .bind(conversationId)
    .all();
  return results || [];
}
