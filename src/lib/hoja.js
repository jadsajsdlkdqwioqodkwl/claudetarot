/**
 * Esquema de la hoja de pedidos.
 *
 * El orden de este array ES el orden en que se escribe cada fila, así que
 * cambiarlo aquí obliga a cambiar `filaDePedido` en ../api/order.js.
 * `npm run check` verifica que ambos sigan cuadrando.
 *
 * Ojo con K y L: /api/upsell las actualiza por posición.
 */
export const COLUMNAS = [
  // A–P: el pedido
  "Fecha", "Pedido", "Nombre", "WhatsApp", "Envío", "Dirección", "Agencia", "Variante",
  "Cantidad", "Subtotal", "Upsells", "Total", "Estado", "Origen", "UTM", "País",
  // Q–U: lo que necesita la Conversions API para casar el pedido con el anuncio
  "FBP", "FBC", "Event ID Lead", "User Agent", "IP"
];

/** "A1:U1" — el rango que ocupan los encabezados. */
export const RANGO_ENCABEZADOS = `A1:${String.fromCharCode(64 + COLUMNAS.length)}1`;
