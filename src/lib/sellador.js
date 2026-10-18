/**
 * Masilla selladora multiusos (advertorial /sellador): catálogo y hoja.
 *
 * Los precios viven SOLO aquí: el navegador manda qué eligió el cliente, nunca
 * cuánto cuesta. Si cambias un precio, cámbialo aquí y en `FB` de
 * public/sellador/index.html (el "antes" solo se muestra, no se cobra).
 * `npm run check` verifica que ambos coincidan.
 *
 * PRECIOS PROVISIONALES: el dueño los define antes de abrir anuncios.
 */

export const PRODUCTO = "masilla-selladora";

export const VARIANTES = {
  "2pack": { etiqueta: "Masilla selladora x2 sachets (60 g)", cantidad: 2, precio: 39 },
  "5pack": { etiqueta: "Masilla selladora x5 sachets (150 g)", cantidad: 5, precio: 69 },
  "10pack": { etiqueta: "Masilla selladora x10 sachets (300 g)", cantidad: 10, precio: 109 }
};

export const VARIANTE_POR_DEFECTO = "5pack";

/** Pestaña del MISMO libro de Pedidos (un solo GOOGLE_SHEET_ID). */
export const PESTANA = "Sellador";

/** El orden ES el orden de la fila (ver filaDeSellador en ../api/order-sellador.js). */
export const COLUMNAS = [
  "Fecha",
  "Nombre",
  "WhatsApp",
  "Envío",
  "Dirección / Agencia",
  "Producto",
  "Sachets",
  "Total",
  "Estado",
  "Campaña",
  // K–O: solo para la Conversions API (igual que la hoja de Tarot)
  "FBP",
  "FBC",
  "Event ID",
  "User Agent",
  "IP"
];
