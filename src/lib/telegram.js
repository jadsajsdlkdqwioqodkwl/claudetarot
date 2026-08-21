/**
 * Aviso de pedidos nuevos por Telegram.
 *
 * Se llama desde /api/order justo después de guardar en Sheets, con
 * `waitUntil` para no atrasar la respuesta al cliente. Un fallo de Telegram
 * (token vencido, chat borrado, red caída) nunca puede tumbar el pedido: la
 * hoja ya es la fuente de verdad, así que aquí solo se registra el error.
 */

// Legacy Markdown de Telegram: basta con no dejar pasar estos cuatro
// caracteres en texto libre del cliente para que no rompan el formato.
function limpiar(texto) {
  return String(texto ?? "").replace(/[_*`[]/g, "");
}

/** Arma el mensaje a partir del mismo `order` que ya arma la fila de Sheets. */
export function mensajeLeadNuevo(order) {
  const entrega = order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)";
  const etiquetaDestino = order.envio === "casa" ? "Dirección" : "Agencia";

  return (
    `🚨 *¡Nuevo pedido!* 🚨\n\n` +
    `👤 *Nombre:* ${limpiar(order.nombre)}\n` +
    `📱 *WhatsApp:* +${order.telefono}\n` +
    `📦 *Producto:* ${limpiar(order.etiqueta)}\n` +
    `💰 *Total:* S/ ${order.total.toFixed(2)}\n` +
    `🚚 *Entrega:* ${entrega}\n` +
    `📍 *${etiquetaDestino}:* ${limpiar(order.destino)}\n\n` +
    `🔥 _Escríbele rápido para confirmar el pedido._`
  );
}

/**
 * @param {object} env  Necesita TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID (secrets)
 * @param {string} mensaje  Ya formateado, en Markdown de Telegram
 */
export async function notificarTelegram(env, mensaje) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // Sin credenciales no se avisa; el pedido no se pierde.

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: "Markdown" })
    });
    if (!res.ok) {
      console.error("Telegram:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Telegram:", err.message);
  }
}
