/**
 * Catálogo y utilidades compartidas entre /api/order y /api/upsell.
 *
 * Los precios viven SOLO aquí: el navegador manda qué eligió el cliente,
 * nunca cuánto cuesta. Si cambias un precio, cámbialo en este archivo y en
 * los textos de index.html.
 */

export const VARIANTES = {
  "1kit": { etiqueta: "1 Kit de Tarot Completo", cantidad: 1, precio: 79 },
  "2kit": { etiqueta: "2 Kits de Tarot Completo", cantidad: 2, precio: 139 }
};

export const UPSELLS = {
  riderwaite: { etiqueta: "The Classic Tarot Rider Waite", precio: 49 }
};

/** Recorta y limpia texto libre para que no rompa la hoja ni el mensaje. */
export function clean(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** 987654321 -> 51987654321 ; acepta también +51... o 51... */
export function toE164Peru(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits; // otro país
  return null;
}

/**
 * Identificador interno del pedido. NO se le muestra al cliente: solo existe
 * como event_id para deduplicar el Lead contra la Conversions API.
 */
export function makeEventId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `TK-${code}`;
}
