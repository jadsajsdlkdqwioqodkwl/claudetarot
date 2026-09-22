/**
 * Envío compartido entre /api/crm/messages, el botón de "mandar" de una
 * respuesta rápida y los seguimientos programados: todos terminan subiendo
 * un archivo de R2 a la Cloud API y guardando el mensaje saliente igual.
 */

import { enviarTexto, enviarMedia, enviarReaccion, subirMedia } from "./whatsapp.js";
import { registrarMensajeSaliente, guardarReaccionPropia } from "./crm-db.js";

export async function mandarTexto(env, conversationId, waId, texto, sentBy, replyTo) {
  const waMessageId = await enviarTexto(env, waId, texto, replyTo?.wa_message_id);
  await registrarMensajeSaliente(env.CRM_DB, conversationId, { waMessageId, type: "text", body: texto, sentBy, replyToMessageId: replyTo?.id });
  return waMessageId;
}

/**
 * `mediaKey` es la clave en R2 (CRM_MEDIA). Sube una copia fresca a WhatsApp
 * y manda. `caption` es lo único que ve el cliente en WhatsApp; `fileName`
 * (opcional) solo queda en el registro interno —para el reporte de
 * Sheets— cuando no hay caption, nunca se manda como texto visible.
 */
export async function mandarMediaGuardada(env, conversationId, waId, mediaKey, type, caption, sentBy, fileName, replyTo) {
  const obj = await env.CRM_MEDIA.get(mediaKey);
  if (!obj) throw new Error("El archivo ya no está disponible.");
  const mime = obj.httpMetadata?.contentType || "application/octet-stream";
  const blob = await obj.blob();

  const mediaId = await subirMedia(env, blob, mime, mediaKey.split("/").pop());
  const waMessageId = await enviarMedia(env, waId, type, mediaId, caption, replyTo?.wa_message_id);

  await registrarMensajeSaliente(env.CRM_DB, conversationId, {
    waMessageId,
    type,
    body: caption || fileName || null,
    mediaKey,
    mediaMime: mime,
    sentBy,
    replyToMessageId: replyTo?.id
  });
  return waMessageId;
}

/** Reacciona (o quita la reacción, con emoji null) a un mensaje ya mandado, de cualquiera de los dos lados. */
export async function mandarReaccion(env, waId, mensajeObjetivo, emoji) {
  await enviarReaccion(env, waId, mensajeObjetivo.wa_message_id, emoji);
  await guardarReaccionPropia(env.CRM_DB, mensajeObjetivo.id, emoji);
}
