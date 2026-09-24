/**
 * Envío compartido entre /api/crm/messages, el botón de "mandar" de una
 * respuesta rápida y los seguimientos programados: todos terminan subiendo
 * un archivo de R2 a la Cloud API y guardando el mensaje saliente igual.
 */

import { enviarTexto, enviarMedia, enviarReaccion, subirMedia, mostrarEscribiendo } from "./whatsapp.js";
import { registrarMensajeSaliente, guardarReaccionPropia } from "./crm-db.js";

/**
 * Antes de mandarle algo al cliente (respuestas a mano y bienvenida): le
 * muestra "escribiendo…" y espera 1 s, para que no llegue al instante como
 * un bot. La espera no es CPU ni suma requests del Worker; el "escribiendo"
 * es una llamada más a Meta (subrequest, sin costo), solo si el cliente
 * escribió en las últimas 24 h (si no, WhatsApp no lo muestra igual).
 */
export const PAUSA_ENVIO_MS = 1000;
export async function pausaEnvio(env, conversationId, ms = PAUSA_ENVIO_MS) {
  if (env?.CRM_DB && conversationId) {
    try {
      const ultimo = await env.CRM_DB.prepare(
        `SELECT wa_message_id FROM messages
         WHERE conversation_id = ? AND direction = 'in' AND type <> 'call' AND wa_message_id IS NOT NULL
           AND created_at >= datetime('now', '-1 day')
         ORDER BY id DESC LIMIT 1`
      )
        .bind(conversationId)
        .first();
      if (ultimo?.wa_message_id) await mostrarEscribiendo(env, ultimo.wa_message_id);
    } catch (err) {
      console.error("Escribiendo:", err.message); // nunca frena el envío
    }
  }
  await new Promise((r) => setTimeout(r, ms));
}

export async function mandarTexto(env, conversationId, waId, texto, sentBy, replyTo) {
  const waMessageId = await enviarTexto(env, waId, texto, replyTo?.wa_message_id);
  await registrarMensajeSaliente(env.CRM_DB, conversationId, { waMessageId, type: "text", body: texto, sentBy, replyToMessageId: replyTo?.id });
  return waMessageId;
}

/**
 * `mediaKey` es la clave en R2 (CRM_MEDIA). Sube una copia fresca a WhatsApp
 * y manda. `caption` es el pie de foto/video/documento. `fileName` queda en
 * el registro interno (Sheets) y, si el tipo es "document", también se
 * manda como el nombre visible del archivo (ver enviarMedia).
 */
export async function mandarMediaGuardada(env, conversationId, waId, mediaKey, type, caption, sentBy, fileName, replyTo) {
  const obj = await env.CRM_MEDIA.get(mediaKey);
  if (!obj) throw new Error("El archivo ya no está disponible.");
  const mime = obj.httpMetadata?.contentType || "application/octet-stream";
  const blob = await obj.blob();

  const mediaId = await subirMedia(env, blob, mime, mediaKey.split("/").pop());
  const waMessageId = await enviarMedia(env, waId, type, mediaId, caption, replyTo?.wa_message_id, fileName);

  await registrarMensajeSaliente(env.CRM_DB, conversationId, {
    waMessageId,
    type,
    body: caption || null,
    mediaKey,
    mediaMime: mime,
    sentBy,
    replyToMessageId: replyTo?.id,
    fileName
  });
  return waMessageId;
}

/** Reacciona (o quita la reacción, con emoji null) a un mensaje ya mandado, de cualquiera de los dos lados. */
export async function mandarReaccion(env, waId, mensajeObjetivo, emoji) {
  await enviarReaccion(env, waId, mensajeObjetivo.wa_message_id, emoji);
  await guardarReaccionPropia(env.CRM_DB, mensajeObjetivo.id, emoji);
}
