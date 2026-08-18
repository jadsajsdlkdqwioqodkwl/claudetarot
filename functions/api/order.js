/**
 * POST /api/order — registra el lead en Google Sheets apenas el cliente
 * confirma, ANTES de mostrarle el order bump. Así no se pierde ningún lead
 * aunque abandone en esa pantalla.
 *
 * Devuelve un eventId interno (nunca visible para el cliente) que sirve para
 * localizar su fila si luego acepta el bump, y como event_id de deduplicación
 * para la Conversions API de Meta.
 */

import { appendRow } from "../_lib/google-sheets.js";
import { checkRateLimit } from "../_lib/rate-limit.js";
import { PRODUCTOS, clean, toE164Peru, makeEventId, fechaLima, json } from "../_lib/pedido.js";

const MAX_BODY_BYTES = 8 * 1024;

export function validate(payload) {
  const errors = [];

  const nombre = clean(payload.nombre, 80);
  const telefono = toE164Peru(payload.telefono);
  const envio = payload.envio === "agencia" ? "agencia" : "casa";
  // Domicilio y agencia comparten columna: es el mismo dato para el vendedor.
  const destino = clean(envio === "agencia" ? payload.agencia : payload.direccion, 200);

  // El precio SIEMPRE sale de la tabla del servidor, nunca del formulario.
  const producto = PRODUCTOS[payload.producto] ? payload.producto : "1kit";
  const { etiqueta, precio } = PRODUCTOS[producto];

  if (nombre.length < 3) errors.push("nombre");
  if (!telefono) errors.push("telefono");
  if (destino.length < 5) errors.push(envio === "agencia" ? "agencia" : "direccion");

  return {
    errors,
    order: {
      nombre,
      telefono,
      envio: envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)",
      destino,
      producto: etiqueta,
      total: precio
    }
  };
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "El pedido es demasiado grande." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "No pudimos leer el formulario." }, 400);
  }

  // Honeypot: si un bot llenó el campo oculto respondemos 200 sin guardar,
  // para no darle señal de que fue detectado.
  if (clean(payload.website, 50)) {
    return json({ ok: true, eventId: makeEventId(), total: 0 });
  }

  const { errors, order } = validate(payload);
  if (errors.length) {
    return json({ error: "Revisa los datos del formulario.", fields: errors }, 422);
  }

  const ip = request.headers.get("CF-Connecting-IP");
  const { permitido } = await checkRateLimit(env, ip);
  if (!permitido) {
    return json({ error: "Ya registramos varios pedidos desde este dispositivo. Escríbenos por WhatsApp." }, 429);
  }

  const eventId = makeEventId();
  const { fechaHora, dia } = fechaLima();

  // Orden de columnas de la hoja "Pedidos" (A..M). Ver README.
  const fila = [
    fechaHora,          // A Fecha y hora
    dia,                // B Día
    order.nombre,       // C Nombre
    `'+${order.telefono}`, // D WhatsApp (apóstrofo: Sheets no lo vuelve número)
    order.envio,        // E Envío
    order.destino,      // F Dirección / Agencia
    order.producto,     // G Producto
    "",                 // H Order bump (lo completa /api/bump)
    order.total,        // I Total
    "Pendiente",        // J Estado
    "",                 // K Clic WhatsApp (lo marca /api/click)
    "",                 // L Notas del vendedor
    eventId             // M Event ID
  ];

  try {
    await appendRow(env, fila);
  } catch (err) {
    console.error("Sheets:", err.message);
    return json({ error: "No pudimos registrar tu pedido. Intenta de nuevo en un minuto." }, 502);
  }

  return json({ ok: true, eventId, total: order.total });
}
