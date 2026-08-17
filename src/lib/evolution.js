/**
 * Envío de WhatsApp vía Evolution API (endpoint /message/sendText/{instance}).
 * Documentación: https://doc.evolution-api.com
 */

/**
 * @param {object} env  Debe traer EVO_API_URL, EVO_INSTANCE y EVO_API_KEY
 * @param {string} phoneE164  Número internacional sin "+" (ej. 51987654321)
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
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: phoneE164, text, delay: 0, linkPreview: false }),
    // Si la instancia está caída no queremos colgar la respuesta al cliente.
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`Evolution API respondió ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

/** Confirmación que recibe el cliente apenas envía el formulario. */
export function buildCustomerMessage(order) {
  const entrega =
    order.envio === "casa"
      ? [
          `📍 Entrega a domicilio: ${order.direccion}`,
          "Entregamos en Lima al día siguiente, en horario de tarde.",
          "Pagas al recibir con *Yape, efectivo o POS*."
        ]
      : [
          `📦 Recojo en agencia: ${order.agencia}`,
          "Llega a provincia en 2 a 3 días hábiles por Shalom u Olva.",
          "Se coordina un adelanto de *S/ 10* y el resto lo pagas al recoger.",
          "Te enviamos por aquí la foto del comprobante con el número de seguimiento."
        ];

  return [
    `*¡Gracias por tu pedido, ${order.nombre.split(" ")[0]}!* 🔮`,
    "",
    `Pedido: *${order.orderId}*`,
    `Producto: ${order.etiqueta}`,
    `Total: *S/ ${order.total}*`,
    "",
    ...entrega,
    "",
    "Cualquier duda respóndenos por este mismo chat."
  ].join("\n");
}

/** Aviso interno al equipo de ventas (si EVO_NOTIFY_NUMBER está definido). */
export function buildInternalMessage(order) {
  return [
    `🆕 Pedido ${order.orderId}`,
    `${order.nombre} · +${order.telefono}`,
    order.envio === "casa" ? `Lima · ${order.direccion}` : `Provincia · ${order.agencia}`,
    `${order.etiqueta} · S/ ${order.total}`
  ].join("\n");
}
