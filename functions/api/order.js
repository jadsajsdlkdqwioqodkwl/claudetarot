/**
 * POST /api/order — recibe el formulario COD del modal, lo guarda en Google
 * Sheets y dispara la confirmación por WhatsApp (Evolution API).
 *
 * Se ejecuta como Cloudflare Pages Function: las credenciales viven en
 * variables de entorno del proyecto, nunca en el bundle del navegador.
 */

import { appendRow } from "../_lib/google-sheets.js";
import { sendWhatsAppText, buildCustomerMessage, buildInternalMessage } from "../_lib/evolution.js";
import { VARIANTES, clean, toE164Peru, makeOrderId } from "../_lib/pedido.js";

const MAX_BODY_BYTES = 8 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

export function validate(payload) {
  const errors = [];

  const nombre = clean(payload.nombre, 80);
  const telefono = toE164Peru(payload.telefono);
  const envio = payload.envio === "agencia" ? "agencia" : "casa";
  const direccion = clean(payload.direccion, 160);
  const agencia = clean(payload.agencia, 160);

  // El precio SIEMPRE sale de la tabla del servidor, nunca del formulario.
  const variante = VARIANTES[payload.variante] ? payload.variante : "1kit";
  const { etiqueta, cantidad, precio } = VARIANTES[variante];

  if (nombre.length < 3) errors.push("nombre");
  if (!telefono) errors.push("telefono");
  if (envio === "casa" && direccion.length < 6) errors.push("direccion");
  if (envio === "agencia" && agencia.length < 3) errors.push("agencia");

  return {
    errors,
    order: {
      nombre,
      telefono,
      envio,
      direccion,
      agencia,
      variante,
      etiqueta,
      cantidad,
      subtotal: precio,
      total: precio,
      origen: clean(payload.origen, 200),
      utm: clean(payload.utm, 200)
    }
  };
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "El pedido es demasiado grande." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "No pudimos leer el formulario." }, 400);
  }

  // Honeypot: si un bot llenó el campo oculto, respondemos 200 sin guardar.
  if (clean(payload.website, 50)) {
    return json({ ok: true, orderId: makeOrderId(), whatsappSent: true });
  }

  const { errors, order } = validate(payload);
  if (errors.length) {
    return json({ error: "Revisa los datos del formulario.", fields: errors }, 422);
  }

  order.orderId = makeOrderId();
  order.fecha = new Date().toISOString();

  // 1) Sheets es la fuente de verdad: si falla, el pedido falla.
  const fila = [
    order.fecha,
    order.orderId,
    order.nombre,
    `'+${order.telefono}`, // apóstrofo: evita que Sheets lo trate como número
    order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)",
    order.direccion,
    order.agencia,
    order.etiqueta,
    order.cantidad,
    order.subtotal,
    "", // Upsells — lo completa /api/upsell si el cliente acepta
    order.total,
    "Pendiente",
    order.origen,
    order.utm,
    request.headers.get("CF-IPCountry") || ""
  ];

  try {
    await appendRow(env, fila);
  } catch (err) {
    console.error("Sheets:", err.message);
    return json(
      { error: "No pudimos registrar tu pedido en este momento. Intenta de nuevo en un minuto." },
      502
    );
  }

  // 2) WhatsApp: el pedido ya está guardado, así que un fallo aquí no lo tumba.
  let whatsappSent = true;
  try {
    await sendWhatsAppText(env, order.telefono, buildCustomerMessage(order));
  } catch (err) {
    console.error("Evolution (cliente):", err.message);
    whatsappSent = false;
  }

  if (env.EVO_NOTIFY_NUMBER) {
    waitUntil(
      sendWhatsAppText(env, env.EVO_NOTIFY_NUMBER, buildInternalMessage(order)).catch((err) =>
        console.error("Evolution (interno):", err.message)
      )
    );
  }

  return json({ ok: true, orderId: order.orderId, total: order.total, whatsappSent });
}
