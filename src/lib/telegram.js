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
    `🕐 *Hora:* ${limpiar(order.fecha)}\n` +
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
 * Arma el aviso de que un pedido ya en la hoja sumó el order bump. Va
 * aparte de mensajeLeadNuevo porque llega en un segundo request
 * (/api/upsell), después de que el cliente ya vio el pedido base: el bump
 * es una decisión que toma más tarde, así que no puede ir en el primer aviso.
 */
export function mensajeBumpAgregado({ nombre, telefono, envio, destino, bump, total }) {
  return (
    `🎁 *¡Se sumó el order bump!* 🎁\n\n` +
    `👤 *Nombre:* ${limpiar(nombre)}\n` +
    `📱 *WhatsApp:* ${limpiar(telefono)}\n` +
    `➕ *Extra:* ${limpiar(bump)}\n` +
    `💰 *Nuevo total:* S/ ${total.toFixed(2)}\n` +
    `🚚 *Entrega:* ${limpiar(envio)}\n` +
    `📍 *Destino:* ${limpiar(destino)}`
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

/**
 * Llamada cruda a la Bot API con el mismo TELEGRAM_BOT_TOKEN de los pedidos.
 * Devuelve `result` o lanza con la descripción de Telegram (y `status`, para
 * distinguir un chat bloqueado — 403 — de un fallo de red).
 */
export async function llamarTelegram(env, metodo, datos = {}) {
  if (!env.TELEGRAM_BOT_TOKEN) throw Object.assign(new Error("Falta TELEGRAM_BOT_TOKEN."), { status: 503 });
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos)
  });
  const salida = await res.json().catch(() => ({}));
  if (!res.ok || !salida.ok) {
    throw Object.assign(new Error(salida.description || `HTTP ${res.status}`), { status: res.status });
  }
  return salida.result;
}

/** Para texto libre dentro de parse_mode HTML (nombres y mensajes de clientes). */
export function escaparHtml(texto) {
  return String(texto ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
