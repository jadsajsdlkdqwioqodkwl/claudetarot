/**
 * Catálogo de la Espada Voladora RC (landing /espada/): planeador a control remoto con forma de espada.
 *
 * Igual que en pedido-masilla.js: los precios viven SOLO aquí. El navegador manda
 * qué pack eligió el cliente, nunca cuánto cuesta. Si cambias un precio, cámbialo
 * acá y en la constante PACKS de public/espada/index.html (`npm run check` falla
 * si dejan de coincidir). La hoja usa las mismas columnas que la del Cable
 * (COLUMNAS_CABLE), en la pestaña «Espada».
 *
 * Tienda aparte para pruebas (pedido del dueño, 2026-11-05): su píxel es OTRO
 * (PIXEL_ESPADA), no el de Puerto Secreto del Cable y la Masilla ni el de Tarot.
 */

export const PRODUCTO_ESPADA = "espada-voladora-rc";

/** Píxel de Meta de esta tienda. Toda la página y su gracias usan SOLO este. */
export const PIXEL_ESPADA = "1602561284224693";

/**
 * Tres packs por cantidad de espadas. `viejo` es el precio «antes».
 * Precios confirmados por el dueño el 2026-11-05 (docs/espada.md).
 */
export const PACKS = {
  x1: { etiqueta: "1 Espada Voladora RC", cantidad: 1, precio: 159, viejo: 318 },
  x2: { etiqueta: "Pack Dúo: 2 Espadas Voladoras RC", cantidad: 2, precio: 279, viejo: 636 },
  x3: { etiqueta: "Pack Familia: 3 Espadas Voladoras RC", cantidad: 3, precio: 379, viejo: 954 }
};

/** Provincia: adelanto por Yape/transferencia y el resto al recoger en la agencia. S/ 20 (dueño, 2026-11-05; el Kit, el Cable y la Masilla siguen con S/ 10). */
export const ADELANTO_PROVINCIA = 20;

/**
 * Dominio largo de la landing: `/` es /espada/ y `/gracias` su gracias. Sin la palabra tarot en el
 * label (un label DNS admite 63 caracteres como máximo). Hostname de Workers → `claudetarot`, más dos
 * reglas de reescritura en la zona (ver docs/espada.md).
 */
export const HOST_ESPADA = "puerto-secreto-espada-voladora-rc-planeador-a-control-remoto.tarotperu.store";
