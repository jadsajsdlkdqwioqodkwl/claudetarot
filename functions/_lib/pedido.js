/**
 * Catálogo y utilidades compartidas por los endpoints.
 *
 * Los precios viven SOLO aquí: el navegador manda qué eligió el cliente,
 * nunca cuánto cuesta. Si cambias un precio, cámbialo también en index.html.
 */

export const PRODUCTOS = {
  "1kit": { etiqueta: "1 Kit de Tarot Completo", precio: 79 },
  "2kit": { etiqueta: "2 Kits de Tarot Completo", precio: 139 }
};

/** Único order bump: el set de velas. */
export const BUMPS = {
  velas: { etiqueta: "Set de velas + incienso", precio: 30 }
};

/** Recorta y limpia texto libre: fuera caracteres de control e invisibles. */
export function clean(value, maxLength) {
  return String(value ?? "")
    .replace(/\p{C}/gu, " ")
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
 * Identificador interno del lead. Nunca se le muestra al cliente: sirve para
 * localizar su fila al añadir el order bump y como event_id de deduplicación
 * en la Conversions API de Meta.
 */
export function makeEventId() {
  return crypto.randomUUID();
}

/**
 * Fecha en hora de Lima con formato que Google Sheets interpreta como fecha
 * real (no texto), imprescindible para filtrar y sumar por día.
 */
export function fechaLima(date = new Date()) {
  const texto = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(date); // "2026-08-17 12:34:56"
  return { fechaHora: texto, dia: texto.slice(0, 10) };
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
