/**
 * Esquema de la pestaña "WhatsApp": el registro de mensajes entrantes.
 *
 * Se crea a mano en el mismo libro que "Pedidos" y "Ventas" — el Worker solo
 * escribe filas, no crea la pestaña ni sus encabezados.
 */
export const COLUMNAS_WHATSAPP = [
  "Fecha",
  "Nombre",
  "Teléfono",
  "Mensaje",
  "Tipo",
  // Id del mensaje en WhatsApp: sirve para no duplicar la fila si Meta
  // reintenta el mismo webhook (los reintentos mandan el mismo Message ID).
  "Message ID"
];

export function hojaWhatsapp(env) {
  return env.GOOGLE_WHATSAPP_NAME || "WhatsApp";
}
