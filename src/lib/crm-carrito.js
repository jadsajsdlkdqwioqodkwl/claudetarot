/**
 * Carrito abandonado: un recordatorio automático, uno solo, al cliente que
 * mandó un pedido desde el catálogo y se quedó callado.
 *
 * Apagado por defecto. Se enciende con la variable CARRITO_AUTO_HORAS
 * (wrangler.jsonc → vars), que es cuántas horas de silencio del cliente
 * esperar antes de escribirle. Corre en el cron de 5 min, antes de mandar los
 * seguimientos: solo agenda una fila en scheduled_messages y el mismo cron la
 * manda en esa pasada, así queda visible en el panel como cualquier otro
 * seguimiento y se cancela sola si el cliente escribe antes.
 *
 * Por qué no arriesga el número:
 *   - Solo dentro de la ventana de 24 h (texto libre, nunca plantilla de
 *     marketing): el cliente nos escribió hace menos de 22 h.
 *   - Solo a quien pidió algo en el catálogo: intención alta, no difusión.
 *   - Uno por chat, para siempre, y nunca si ya hay un seguimiento pendiente
 *     de una vendedora ni si el chat ya tiene la etiqueta de venta.
 *   - Nunca si el último mensaje es del cliente: ahí le toca responder a una
 *     persona, y eso lo avisa el asesor por Telegram.
 */

const AUTOR = "Carrito abandonado";

const MENSAJE_DEFAULT =
  "Hola{nombre} 👋 Vi que dejaste tu pedido en el catálogo. ¿Te ayudo a confirmarlo? " +
  "Respóndeme con tu distrito (Lima) o tu ciudad (provincia) y te digo cuándo te llega 🙌";

export function armarMensajeCarrito(plantilla, nombre) {
  const primer = String(nombre || "").trim().split(/\s+/)[0] || "";
  const limpio = /^[\p{L}]{2,20}$/u.test(primer) ? " " + primer : "";
  return (plantilla || MENSAJE_DEFAULT).replace(/\{nombre\}/g, limpio);
}

export async function agendarCarritosAbandonados(env) {
  const horas = Number(env.CARRITO_AUTO_HORAS);
  if (!env.CRM_DB || !(horas >= 1 && horas <= 20)) return;

  const { results } = await env.CRM_DB.prepare(
    `SELECT conv.id, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     WHERE conv.last_inbound_at IS NOT NULL
       AND datetime(conv.last_inbound_at) <= datetime('now', ?1)
       AND datetime(conv.last_inbound_at) > datetime('now', '-22 hours')
       AND instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ' purchase ') = 0
       AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conv.id
                   AND m.direction = 'in' AND m.type = 'order' AND m.created_at > datetime('now', '-22 hours'))
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = conv.id
                       AND (s.created_by = ?2 OR s.status = 'pendiente'))
       AND (SELECT m2.direction FROM messages m2 WHERE m2.conversation_id = conv.id
            ORDER BY m2.id DESC LIMIT 1) = 'out'
     LIMIT 20`
  )
    .bind(`-${horas} hours`, AUTOR)
    .all();

  for (const r of results) {
    await env.CRM_DB.prepare(
      "INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by) VALUES (?, ?, datetime('now'), ?)"
    )
      .bind(r.id, armarMensajeCarrito(env.CARRITO_MENSAJE, r.nombre), AUTOR)
      .run();
  }
}
