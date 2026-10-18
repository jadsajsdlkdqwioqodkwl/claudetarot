/**
 * Catálogo de la Masilla Selladora (landing /masilla/).
 *
 * Igual que en pedido-cable.js: los precios viven SOLO aquí. El navegador manda
 * qué pack eligió el cliente, nunca cuánto cuesta. Si cambias un precio, cámbialo
 * acá y en la constante PACKS de public/masilla/index.html (`npm run check` falla
 * si dejan de coincidir). La hoja usa las mismas columnas que la del Cable
 * (COLUMNAS_CABLE), en la pestaña «Masilla».
 */

export const PRODUCTO_MASILLA = "masilla-selladora";

/**
 * Cada kit trae 20 sobres individuales (como en los videos del proveedor). `viejo` es el
 * precio «antes». PRECIOS PROVISORIOS: el dueño aún no los confirma (ver docs/masilla.md).
 */
export const PACKS = {
  x1: { etiqueta: "1 Kit de Masilla Selladora (20 sobres)", cantidad: 1, precio: 49, viejo: 99 },
  x2: { etiqueta: "Pack Dúo: 2 Kits de Masilla Selladora (40 sobres)", cantidad: 2, precio: 79, viejo: 198 },
  x3: { etiqueta: "Pack Hogar: 3 Kits de Masilla Selladora (60 sobres)", cantidad: 3, precio: 99, viejo: 297 }
};

/** Detalle que se escribe en la hoja (la columna «Detalle» es la del Cable). */
export const SOBRES_POR_KIT = 20;

/** Provincia: adelanto por Yape/transferencia y el resto al recoger en la agencia (igual que el Kit y el Cable). */
export const ADELANTO_PROVINCIA = 10;

/** Ruta larga y descriptiva con la que se comparte la landing (el Worker la sirve como /masilla/). */
export const RUTA_LARGA_MASILLA =
  "masilla-selladora-moldeable-para-huecos-grietas-y-tuberias-sin-herramientas-envio-gratis-a-lima-pago-contra-entrega";
