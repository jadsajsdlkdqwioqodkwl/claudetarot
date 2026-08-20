/**
 * Esquema de la hoja de pedidos.
 *
 * El orden de este array ES el orden en que se escribe cada fila, así que
 * cambiarlo aquí obliga a revisar `filaDePedido` en ../api/order.js.
 * `npm run check` verifica que ambos sigan cuadrando.
 *
 * No hay columna de "código de pedido": las filas se localizan por su
 * número, que devuelve Sheets al insertarlas. El "Event ID" es interno y solo
 * existe para deduplicar contra la Conversions API — nunca se le muestra
 * al cliente.
 */
export const COLUMNAS = [
  // A–J: lo que ve y edita el vendedor
  "Fecha",
  "Nombre",
  "WhatsApp",
  "Envío",
  "Dirección / Agencia",
  "Producto",
  "Subtotal",
  "Order bump",
  "Total",
  "Estado",
  // K–O: solo para la Conversions API
  "FBP",
  "FBC",
  "Event ID",
  "User Agent",
  "IP"
];

/** Estados posibles de un pedido. El primero es el que se escribe al entrar. */
export const ESTADOS = ["Pendiente", "Contactado", "Enviado", "Pagado", "Cancelado"];

/** Los que cuentan como venta cerrada para los totales del panel. */
export const ESTADOS_VENDIDOS = ["Enviado", "Pagado"];

/** Índice 0-based de una columna por nombre. Lanza si no existe. */
export function indiceDe(nombre) {
  const i = COLUMNAS.indexOf(nombre);
  if (i === -1) throw new Error(`La hoja no tiene la columna "${nombre}"`);
  return i;
}

/** "A" para 0, "B" para 1… Solo llegamos a la O, no hace falta más. */
export function letraDe(indice) {
  return String.fromCharCode(65 + indice);
}

/** "A1:O1" — el rango que ocupan los encabezados. */
export const RANGO_ENCABEZADOS = `A1:${letraDe(COLUMNAS.length - 1)}1`;
