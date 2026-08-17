/**
 * POST /api/order — recibe el formulario COD, lo guarda en Google Sheets
 * y dispara la confirmación por WhatsApp (Evolution API).
 *
 * Se ejecuta como Cloudflare Pages Function: las credenciales viven en
 * variables de entorno del proyecto, nunca en el bundle del navegador.
 */

import { appendRow } from "../_lib/google-sheets.js";
import { sendWhatsAppText, buildCustomerMessage, buildInternalMessage } from "../_lib/evolution.js";

const PRICES = { 1: 89, 2: 160, 3: 225 };
const UNIT_PRICE = 89;
const MAX_BODY_BYTES = 8 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

/** Recorta y normaliza texto libre para que no rompa la hoja ni el mensaje. */
function clean(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** 987654321 -> 51987654321 ; acepta también +51... o 51... */
function toE164Peru(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits; // otro país
  return null;
}

/** TC-8F3K2Q — corto, legible por teléfono y suficientemente único. */
function makeOrderId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `TC-${code}`;
}

function validate(payload) {
  const errors = [];

  const nombre = clean(payload.nombre, 80);
  const telefono = toE164Peru(payload.telefono);
  const email = clean(payload.email, 120);
  const departamento = clean(payload.departamento, 40);
  const distrito = clean(payload.distrito, 60);
  const direccion = clean(payload.direccion, 140);
  const referencia = clean(payload.referencia, 140);
  const notas = clean(payload.notas, 300);
  const horario = clean(payload.horario, 20) || "Cualquiera";

  let cantidad = parseInt(payload.cantidad, 10);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10) cantidad = 1;

  if (nombre.length < 3) errors.push("nombre");
  if (!telefono) errors.push("telefono");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push("email");
  if (!departamento) errors.push("departamento");
  if (distrito.length < 3) errors.push("distrito");
  if (direccion.length < 6) errors.push("direccion");

  return {
    errors,
    order: {
      nombre,
      telefono,
      email,
      departamento,
      distrito,
      direccion,
      referencia,
      notas,
      horario,
      cantidad,
      total: PRICES[cantidad] ?? cantidad * UNIT_PRICE,
      origen: clean(payload.origen, 200),
      utm: clean(payload.utm, 200)
    }
  };
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  // --- Cuerpo ---
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "El pedido es demasiado grande." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "No pudimos leer el formulario." }, 400);
  }

  // --- Honeypot: si un bot llenó el campo oculto, respondemos 200 sin guardar ---
  if (clean(payload.website, 50)) {
    return json({ ok: true, orderId: makeOrderId(), whatsappSent: true });
  }

  // --- Validación ---
  const { errors, order } = validate(payload);
  if (errors.length) {
    return json({ error: "Revisa los datos del formulario.", fields: errors }, 422);
  }

  order.orderId = makeOrderId();
  order.fecha = new Date().toISOString();

  // --- 1) Guardar en Google Sheets (fuente de verdad: si esto falla, el pedido falla) ---
  const fila = [
    order.fecha,
    order.orderId,
    order.nombre,
    `'+${order.telefono}`, // apóstrofo: evita que Sheets lo trate como número
    order.email,
    order.departamento,
    order.distrito,
    order.direccion,
    order.referencia,
    order.cantidad,
    order.total,
    order.horario,
    order.notas,
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

  // --- 2) Confirmación por WhatsApp (no bloquea: el pedido ya está guardado) ---
  let whatsappSent = true;
  try {
    await sendWhatsAppText(env, order.telefono, buildCustomerMessage(order));
  } catch (err) {
    console.error("Evolution (cliente):", err.message);
    whatsappSent = false;
  }

  // Aviso al equipo, en segundo plano: nunca debe retrasar la respuesta al cliente.
  if (env.EVO_NOTIFY_NUMBER) {
    waitUntil(
      sendWhatsAppText(env, env.EVO_NOTIFY_NUMBER, buildInternalMessage(order)).catch((err) =>
        console.error("Evolution (interno):", err.message)
      )
    );
  }

  return json({ ok: true, orderId: order.orderId, total: order.total, whatsappSent });
}

// Exportado solo para las pruebas de `npm run check`.
// Pages únicamente enruta los exports onRequest*, así que esto no crea otra ruta.
export const __test = { toE164Peru, validate, makeOrderId, clean };
