/**
 * Envío de WhatsApp vía Evolution API (endpoint /message/sendText/{instance}).
 * Documentación: https://doc.evolution-api.com
 */

/**
 * @param {object} env  Debe traer EVO_API_URL, EVO_INSTANCE y EVO_API_KEY
 * @param {string} phoneE164  Número en formato internacional sin "+" (ej. 51987654321)
 * @param {string} text  Mensaje a enviar
 */
export async function sendWhatsAppText(env, phoneE164, text) {
  const baseUrl = (env.EVO_API_URL || "").replace(/\/+$/, "");
  const instance = env.EVO_INSTANCE;
  const apiKey = env.EVO_API_KEY;

  if (!baseUrl || !instance || !apiKey) {
    throw new Error("Faltan EVO_API_URL, EVO_INSTANCE o EVO_API_KEY");
  }

  const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey
    },
    body: JSON.stringify({
      number: phoneE164,
      text,
      delay: 0,
      linkPreview: false
    }),
    // Si la instancia está caída no queremos colgar la respuesta al cliente.
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`Evolution API respondió ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

/**
 * Mensaje de confirmación que recibe el cliente.
 */
export function buildCustomerMessage(order) {
  const lineas = [
    `*¡Gracias por tu pedido, ${order.nombre.split(" ")[0]}!* 🔮`,
    "",
    `Pedido: *${order.orderId}*`,
    `Producto: Mazo Tarot Claude — Edición Luna`,
    `Cantidad: ${order.cantidad}`,
    `Total a pagar al recibir: *S/ ${order.total}*`,
    "",
    `Entrega en: ${order.direccion}, ${order.distrito}, ${order.departamento}`,
    `Horario preferido: ${order.horario}`,
    "",
    "Tu pedido es *pago contra entrega*: pagas en efectivo o Yape cuando el repartidor llegue.",
    "Te escribimos de nuevo cuando salga a ruta. ¿Alguna duda? Respóndenos por aquí."
  ];
  return lineas.join("\n");
}

/**
 * Aviso interno al equipo de ventas (opcional, si EVO_NOTIFY_NUMBER está definido).
 */
export function buildInternalMessage(order) {
  return [
    `🆕 Pedido COD ${order.orderId}`,
    `${order.nombre} · +${order.telefono}`,
    `${order.direccion}, ${order.distrito}, ${order.departamento}`,
    `${order.cantidad} u. · S/ ${order.total} · ${order.horario}`,
    order.notas ? `Nota: ${order.notas}` : null
  ]
    .filter(Boolean)
    .join("\n");
}
