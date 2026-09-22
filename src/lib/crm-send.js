/**
 * Envío compartido entre /api/crm/messages, el botón de "mandar" de una
 * respuesta rápida y los seguimientos programados: todos terminan subiendo
 * un archivo de R2 a la Cloud API y guardando el mensaje saliente igual.
 */

import { enviarTexto, enviarMedia, subirMedia } from "./whatsapp.js";
import { registrarMensajeSaliente } from "./crm-db.js";

export async function mandarTexto(env, conversationId, waId, texto, sentBy) {
  const waMessageId = await enviarTexto(env, waId, texto);
  await registrarMensajeSaliente(env.CRM_DB, conversationId, { waMessageId, type: "text", body: texto, sentBy });
  return waMessageId;
}

/**
 * `mediaKey` es la clave en R2 (CRM_MEDIA). Sube una copia fresca a WhatsApp
 * y manda. `caption` es lo único que ve el cliente en WhatsApp; `fileName`
 * (opcional) solo queda en el registro interno —para el reporte de
 * Sheets— cuando no hay caption, nunca se manda como texto visible.
 */
export async function mandarMediaGuardada(env, conversationId, waId, mediaKey, type, caption, sentBy, fileName) {
  const obj = await env.CRM_MEDIA.get(mediaKey);
  if (!obj) throw new Error("El archivo ya no está disponible.");
  const mime = obj.httpMetadata?.contentType || "application/octet-stream";
  const blob = await obj.blob();

  const mediaId = await subirMedia(env, blob, mime, mediaKey.split("/").pop());
  const waMessageId = await enviarMedia(env, waId, type, mediaId, caption);

  await registrarMensajeSaliente(env.CRM_DB, conversationId, {
    waMessageId,
    type,
    body: caption || fileName || null,
    mediaKey,
    mediaMime: mime,
    sentBy
  });
  return waMessageId;
}
