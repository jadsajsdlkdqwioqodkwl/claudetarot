/**
 * Pedidos que llegan por el formulario de la página (/api/order).
 *
 * Quedan en D1 (`pedidos_web`, migración 0042), terminen o no en venta, para
 * que salgan en el reporte diario (GET /api/asesor/pedidos-web → sección
 * "🌐 Pedidos de la web" del PDF que arma scripts/asesor/enviar.py).
 *
 * Corre en segundo plano (waitUntil): un fallo aquí nunca tumba el pedido,
 * que ya quedó en Sheets.
 */

export async function registrarPedidoWeb(env, order, fila) {
  if (!env.CRM_DB) return;
  try {
    await env.CRM_DB
      .prepare(
        `INSERT INTO pedidos_web (fila, nombre, wa_id, envio, destino, etiqueta, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(fila || null, order.nombre, order.telefono, order.envio, order.destino, order.etiqueta, order.total)
      .run();
  } catch (err) {
    console.error("Pedido web (D1):", err.message);
  }
}

/** El order bump que se sumó después (/api/upsell), por el número de fila de Sheets. */
export async function anotarBumpPedidoWeb(env, fila, bump, total) {
  if (!env.CRM_DB || !fila) return;
  await env.CRM_DB
    .prepare("UPDATE pedidos_web SET bump = ?, total = ? WHERE id = (SELECT MAX(id) FROM pedidos_web WHERE fila = ?)")
    .bind(bump, total, fila)
    .run()
    .catch((err) => console.error("Pedido web (bump):", err.message));
}
