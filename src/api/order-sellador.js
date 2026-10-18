/**
 * POST /api/order-sellador — formulario COD de la landing /sellador.
 *
 * Mismo molde que /api/order (Tarot), pero aparte a propósito: escribe en su
 * propia pestaña ("Sellador") y NO pasa por `pedidos_web` de D1, porque ese
 * registro dispara la plantilla de WhatsApp "recibimos su pedido" por el número
 * de Tarot Store. Sin Apps Script: el Worker escribe en Sheets con la cuenta de
 * servicio (src/lib/google-sheets.js).
 */

import { appendRowsTo, asegurarPestana } from "../lib/google-sheets.js";
import { clean, toE164Peru, makeEventId } from "../lib/pedido.js";
import { notificarTelegram } from "../lib/telegram.js";
import { fechaLima, numeroDeFila } from "./order.js";
import { VARIANTES, VARIANTE_POR_DEFECTO, PESTANA, COLUMNAS } from "../lib/sellador.js";

const MAX_BODY_BYTES = 8 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export function validate(payload) {
  const errors = [];

  const nombre = clean(payload.nombre, 80);
  const telefono = toE164Peru(payload.telefono);
  const envio = payload.envio === "agencia" ? "agencia" : "casa";
  const direccion = clean(payload.direccion, 160);
  const agencia = clean(payload.agencia, 160);

  // El precio SIEMPRE sale de la tabla del servidor, nunca del formulario.
  const variante = VARIANTES[payload.variante] ? payload.variante : VARIANTE_POR_DEFECTO;
  const { etiqueta, precio, cantidad } = VARIANTES[variante];

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
      destino: envio === "casa" ? direccion : agencia,
      variante,
      etiqueta,
      cantidad,
      total: precio,
      campana: clean(payload.campana, 120),
      fbp: clean(payload.fbp, 120),
      fbc: clean(payload.fbc, 255)
    }
  };
}

export function filaDeSellador(order, headers) {
  const cabecera = (nombre) => headers?.get(nombre) || "";

  return [
    order.fecha,
    order.nombre,
    `'+${order.telefono}`, // apóstrofo: evita que Sheets lo trate como número
    order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)",
    order.destino,
    order.etiqueta,
    order.cantidad,
    order.total,
    "Pendiente",
    order.campana,
    order.fbp,
    order.fbc,
    order.eventId,
    clean(cabecera("User-Agent"), 400),
    cabecera("CF-Connecting-IP")
  ];
}

export function mensajeSelladorNuevo(order) {
  const limpiar = (t) => String(t ?? "").replace(/[_*`[]/g, "");
  const entrega = order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)";
  return (
    `🧱 *Nuevo pedido: MASILLA SELLADORA* 🧱\n\n` +
    `🕐 *Hora:* ${limpiar(order.fecha)}\n` +
    `👤 *Nombre:* ${limpiar(order.nombre)}\n` +
    `📱 *WhatsApp:* +${order.telefono}\n` +
    `📦 *Producto:* ${limpiar(order.etiqueta)}\n` +
    `💰 *Total:* S/ ${order.total.toFixed(2)}\n` +
    `🚚 *Entrega:* ${entrega}\n` +
    `📍 *Destino:* ${limpiar(order.destino)}`
  );
}

async function dentroDelLimite(env, ip) {
  if (!env.ORDER_LIMIT || !ip) return true;
  try {
    const { success } = await env.ORDER_LIMIT.limit({ key: ip });
    return success;
  } catch (err) {
    console.error("Rate limit:", err.message);
    return true; // nunca se pierde un lead por esto
  }
}

// La pestaña se crea sola con el primer pedido; una vez por isolate basta.
let pestanaLista = false;

async function prepararPestana(env) {
  if (pestanaLista) return;
  try {
    await asegurarPestana(env, env.GOOGLE_SHEET_ID, PESTANA, COLUMNAS);
  } catch (err) {
    // Dos primeros pedidos a la vez pueden chocar al crearla: el segundo falla
    // por "ya existe", y eso está bien. Si el problema es otro, el append de
    // abajo lo dirá.
    console.error("Pestaña Sellador:", err.message);
  }
  pestanaLista = true;
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

  // Honeypot: si un bot llenó el campo oculto, 200 sin guardar.
  if (clean(payload.website, 50)) return json({ ok: true, fila: 0, total: 0 });

  const { errors, order } = validate(payload);
  if (errors.length) return json({ error: "Revisa los datos del formulario.", fields: errors }, 422);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await dentroDelLimite(env, ip))) {
    return json({ error: "Recibimos varios pedidos desde tu conexión. Espera un minuto e inténtalo de nuevo." }, 429);
  }

  order.eventId = makeEventId().replace(/^TK-/, "MS-");
  order.fecha = fechaLima();

  let fila;
  try {
    await prepararPestana(env);
    const rango = await appendRowsTo(env, env.GOOGLE_SHEET_ID, PESTANA, [filaDeSellador(order, request.headers)]);
    fila = numeroDeFila(rango);
  } catch (err) {
    console.error("Sheets (Sellador):", err.message);
    return json({ error: "No pudimos registrar tu pedido en este momento. Intenta de nuevo en un minuto." }, 502);
  }

  waitUntil(notificarTelegram(env, mensajeSelladorNuevo(order)));

  return json({ ok: true, fila, total: order.total, eventId: order.eventId });
}
