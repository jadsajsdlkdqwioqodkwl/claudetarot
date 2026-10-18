/**
 * Catálogo de la Masilla Selladora (landing /masilla/): ofertas de 10, 20 y 40 sachets.
 *
 * Igual que en pedido-cable.js: los precios viven SOLO aquí. El navegador manda
 * qué pack eligió el cliente, nunca cuánto cuesta. Si cambias un precio, cámbialo
 * acá y en la constante PACKS de public/masilla/index.html (`npm run check` falla
 * si dejan de coincidir). La hoja usa las mismas columnas que la del Cable
 * (COLUMNAS_CABLE), en la pestaña «Masilla».
 */

export const PRODUCTO_MASILLA = "masilla-selladora";

/**
 * Tres ofertas por cantidad de sachets (pedido del dueño, 2026-10-18). Cada oferta es 1 pedido
 * (`cantidad: 1`); lo que cambia es `sachets`. `viejo` es el precio «antes». Precios confirmados por el
 * dueño el 2026-10-18: S/ 69 · S/ 99 · S/ 129.
 */
export const PACKS = {
  x1: { etiqueta: "Oferta 1: 10 sachets de Masilla Selladora", sachets: 10, cantidad: 1, precio: 69, viejo: 99 },
  x2: { etiqueta: "Oferta 2: 20 sachets de Masilla Selladora", sachets: 20, cantidad: 1, precio: 99, viejo: 159 },
  x3: { etiqueta: "Oferta 3: 40 sachets de Masilla Selladora", sachets: 40, cantidad: 1, precio: 129, viejo: 259 }
};

/** Provincia: adelanto por Yape/transferencia y el resto al recoger en la agencia (igual que el Kit y el Cable). */
export const ADELANTO_PROVINCIA = 10;

/** Ruta larga y descriptiva con la que se comparte la landing (el Worker la sirve como /masilla/). */
export const RUTA_LARGA_MASILLA =
  "masilla-selladora-moldeable-para-huecos-grietas-y-tuberias-sin-herramientas-envio-gratis-a-lima-pago-contra-entrega";

/** Dominio largo de la VERSION 2 de la Masilla (hero en GIF, `/masilla-v2/`): `/` es esa landing y `/gracias` su gracias. Sin la palabra tarot. Un label DNS admite 63 caracteres como máximo. */
export const HOST_MASILLA_V2 = "puerto-secreto-masilla-selladora-moldeable-huecos-y-tuberias.tarotperu.store";
