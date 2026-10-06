/**
 * De qué producto es cada chat (tabla `productos`, 0045).
 *
 * Se reconoce solo, en este orden:
 *  1. "anuncio": el ad id del click-to-WhatsApp (referral.source_id) está en
 *     productos.anuncios del producto. Es lo más seguro: un anuncio = un producto.
 *  2. "palabra": alguna de productos.palabras aparece en el titular/texto del
 *     anuncio o en lo que escribió el cliente ("Hola, quiero el masajeador").
 *  3. "linea": la línea tiene un solo producto activo.
 * Una persona puede cambiarlo a mano en el chat ("manual"), y eso ya no lo
 * pisa nada automático. Un clic en OTRO anuncio sí lo cambia (vino por otra cosa).
 *
 * Con el producto el CRM elige qué respuestas rápidas mostrar primero, qué
 * bienvenida mandar y qué secuencia de seguimiento programar.
 */

const CACHE_MS = 60 * 1000;
let cache = { at: 0, lista: [] };

export async function listarProductos(db, { fresco = false } = {}) {
  if (!db) return [];
  if (!fresco && Date.now() - cache.at < CACHE_MS) return cache.lista;
  try {
    const { results } = await db.prepare("SELECT * FROM productos ORDER BY activo DESC, id ASC").all();
    cache = { at: Date.now(), lista: results };
  } catch (err) {
    console.error("Productos:", err.message); // sin la migración 0045 todavía
    cache = { at: Date.now(), lista: [] };
  }
  return cache.lista;
}

export function olvidarProductos() {
  cache = { at: 0, lista: [] };
}

export const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "a, b\nc" → ["a", "b", "c"], sin vacíos ni repetidos. */
export function listaDe(texto) {
  return [...new Set(String(texto || "").split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean))];
}

/** Las palabras clave aparecen como palabra o frase completa (no "kit" dentro de "kitchen"). */
function contienePalabra(texto, palabra) {
  const t = ` ${sinTildes(texto).replace(/[^a-z0-9ñ]+/g, " ")} `;
  const p = sinTildes(palabra).replace(/[^a-z0-9ñ]+/g, " ").trim();
  return p.length >= 3 && t.includes(` ${p} `);
}

/**
 * El producto que corresponde, o null. `lineaId` null = línea principal.
 * Solo se consideran productos activos de esa misma línea.
 */
export function reconocerProducto(productos, { lineaId = null, referral = null, texto = "" } = {}) {
  const deLinea = productos.filter((p) => p.activo && (p.linea_id || null) === (lineaId || null));
  if (!deLinea.length) return null;

  const adId = referral?.source_id ? String(referral.source_id) : "";
  if (adId) {
    const p = deLinea.find((x) => listaDe(x.anuncios).includes(adId));
    if (p) return { producto: p, origen: "anuncio" };
  }

  const fuentes = [referral?.headline, referral?.body, texto].filter(Boolean).join(" \n ");
  if (fuentes) {
    // La palabra más larga gana ("kit tarot gold" antes que "tarot").
    let mejor = null;
    for (const p of deLinea) {
      for (const palabra of listaDe(p.palabras)) {
        if (contienePalabra(fuentes, palabra) && (!mejor || palabra.length > mejor.largo)) mejor = { producto: p, largo: palabra.length };
      }
    }
    if (mejor) return { producto: mejor.producto, origen: "palabra" };
  }

  // Un solo producto en una línea que no es la principal: es ese.
  if (lineaId && deLinea.length === 1) return { producto: deLinea[0], origen: "linea" };
  return null;
}

/**
 * Le pone el producto al chat si corresponde. No pisa una elección manual;
 * un anuncio nuevo sí pisa lo reconocido por palabra o por línea. Devuelve
 * el producto_id que quedó.
 */
export async function asignarProductoSiAplica(db, conversacion, { referral, texto }) {
  if (!conversacion || conversacion.producto_origen === "manual") return conversacion?.producto_id || null;
  // Ya tiene uno: solo lo cambia un clic en un anuncio (otro producto).
  if (conversacion.producto_id && !referral?.source_id) return conversacion.producto_id;
  const productos = await listarProductos(db);
  if (!productos.length) return conversacion.producto_id || null;
  const r = reconocerProducto(productos, { lineaId: conversacion.linea_id, referral, texto: conversacion.producto_id ? "" : texto });
  if (!r || r.producto.id === conversacion.producto_id) return conversacion.producto_id || null;
  if (conversacion.producto_id && r.origen !== "anuncio") return conversacion.producto_id;
  await db.prepare("UPDATE conversations SET producto_id = ?, producto_origen = ? WHERE id = ?")
    .bind(r.producto.id, r.origen, conversacion.id).run();
  conversacion.producto_id = r.producto.id;
  conversacion.producto_origen = r.origen;
  return r.producto.id;
}

export async function productoPorId(db, id) {
  if (!id) return null;
  return (await listarProductos(db)).find((p) => p.id === Number(id)) || null;
}
