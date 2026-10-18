/**
 * Masilla selladora multiusos (advertorial /sellador): catálogo y hoja.
 *
 * Los precios viven SOLO aquí: el navegador manda qué eligió el cliente, nunca
 * cuánto cuesta. Si cambias un precio, cámbialo aquí y en `FB` de
 * public/sellador/index.html (el "antes" solo se muestra, no se cobra).
 * `npm run check` verifica que ambos coincidan.
 *
 * Precios (dueño, 2026-10-18): cada pack trae 20 sachets de 30 g; mínimo S/79 y costo ~S/20 por pack:
 * 1 pack S/79 · 2 packs S/129 · 3 packs S/179 (los "antes" 159/259/359 solo se muestran).
 */

export const PRODUCTO = "masilla-selladora";

export const VARIANTES = {
  "1pack": { etiqueta: "Masilla selladora x1 pack (20 sachets)", cantidad: 20, precio: 79 },
  "2pack": { etiqueta: "Masilla selladora x2 packs (40 sachets)", cantidad: 40, precio: 129 },
  "3pack": { etiqueta: "Masilla selladora x3 packs (60 sachets)", cantidad: 60, precio: 179 }
};

export const VARIANTE_POR_DEFECTO = "2pack";

/** Provincia: adelanto por Yape y el resto al recoger en la agencia (igual que el Kit y el Cable). */
export const ADELANTO_PROVINCIA = 10;

/** Pestaña del MISMO libro de Pedidos (un solo GOOGLE_SHEET_ID). */
export const PESTANA = "Sellador";

/** El orden ES el orden de la fila (ver filaDeSellador en ../api/order-sellador.js). */
export const COLUMNAS = [
  "Fecha",
  "Nombre",
  "WhatsApp",
  "Envío",
  "Distrito / Ciudad",
  "Dirección / Agencia",
  "Pack",
  "Sachets",
  "Total",
  "Adelanto",
  "Estado",
  "Campaña",
  // Solo para la Conversions API (igual que las otras hojas)
  "FBP",
  "FBC",
  "Event ID",
  "User Agent",
  "IP"
];
