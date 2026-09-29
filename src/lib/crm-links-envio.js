/**
 * Link de seguimiento del pedido (página /TS-…): se manda A MANO, desde el
 * panel derecho del chat (🔗 Link de seguimiento) o desde Links de Shalom.
 * Ya no sale solo: el envío automático 23 h después se apagó a pedido del
 * dueño (cada mensaje lo decide y lo lee una persona).
 *
 * El texto es la respuesta rápida "Link de envío" (la editan el admin y las
 * vendedoras con el lápiz); {link} y {nombre} se rellenan al abrirlo, y la
 * vendedora lo puede cambiar antes de mandarlo.
 */

import { ORIGEN_LINK_ENVIO } from "./crm-db.js";

export const TEXTO_LINK_POR_DEFECTO =
  "Hola estimad@ ☺️ su Kit Tarot ya está en camino 🚚 En este link va a ver su boleta y en qué va su envío 👉 {link}\n\n" +
  "Cuando le llegue, empiece por el manual: le enseña paso a paso a hacer su primera tirada, y cada carta ya trae su significado impreso, así que puede leer desde el primer día ✨";

/**
 * La respuesta rápida que da el texto. La crea la primera vez; si alguien la
 * borró después, devuelve null (se usa el texto por defecto) y no la vuelve a crear.
 */
export async function rapidaDelLink(db) {
  const guardado = await db.prepare("SELECT value FROM crm_settings WHERE key = 'rapida_link_envio_id'").first();
  if (guardado?.value) {
    const q = await db.prepare("SELECT id, body FROM quick_replies WHERE id = ?").bind(Number(guardado.value)).first();
    return q?.body ? q : null;
  }
  const creada = await db.prepare(
    "INSERT INTO quick_replies (title, body, grupo, sort_order) VALUES ('Link de envío', ?, 'Automáticos', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quick_replies)) RETURNING id, body"
  ).bind(TEXTO_LINK_POR_DEFECTO).first();
  await db.prepare("INSERT INTO crm_settings (key, value) VALUES ('rapida_link_envio_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(String(creada.id)).run();
  return creada;
}

/** El texto listo para este cliente: {link} y {nombre} ya puestos. */
export function textoDelLink(plantilla, { link, nombre }) {
  return String(plantilla || TEXTO_LINK_POR_DEFECTO)
    .replace(/\{link\}/gi, link || "")
    .replace(/\{nombre\}/gi, nombre || "estimad@");
}

/** Ya no se programa nada: cancela lo que hubiera quedado pendiente de la versión automática. */
export async function cancelarLinksAutomaticos(db) {
  await db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE status = 'pendiente' AND created_by = ?").bind(ORIGEN_LINK_ENVIO).run();
}
