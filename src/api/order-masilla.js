/**
 * POST /api/order-masilla — recibe el formulario COD de /masilla/ y lo guarda en
 * una pestaña propia («Masilla») de Google Sheets.
 *
 * Es el mismo mecanismo que /api/order-cable (Worker + cuenta de servicio, sin
 * Apps Script), con precios propios (src/lib/pedido-masilla.js) y las mismas
 * columnas que la pestaña «Cable». No dispara el WhatsApp automático de Tarot
 * Store ni toca la tabla `pedidos_web` del CRM.
 *
 * Por defecto cae en el mismo libro de Pedidos; GOOGLE_MASILLA_SHEET_ID (compartido
 * como Editor con la cuenta de servicio) y GOOGLE_MASILLA_SHEET_NAME lo cambian.
 */

import { appendRowsTo } from "../lib/google-sheets.js";
import { clean, toE164Peru, makeEventId } from "../lib/pedido.js";
import { PACKS, ADELANTO_PROVINCIA } from "../lib/pedido-masilla.js";
import { COLUMNAS_CABLE } from "../lib/pedido-cable.js";
import { ESTADOS } from "../lib/hoja.js";
import { notificarTelegram } from "../lib/telegram.js";
import { fechaLima, numeroDeFila } from "./order.js";
import { prepararPestana } from "./order-cable.js";

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
  // Distrito (Lima) o ciudad/departamento (provincia).
  const distrito = clean(payload.distrito, 60);
  const direccion = clean(payload.direccion, 160);
  const agencia = clean(payload.agencia, 160);

  // El precio SIEMPRE sale de la tabla del servidor, nunca del formulario.
  const pack = PACKS[payload.pack] ? payload.pack : "x1";
  const { etiqueta, precio, cantidad, sachets } = PACKS[pack];

  if (nombre.length < 3) errors.push("nombre");
  if (!telefono) errors.push("telefono");
  if (distrito.length < 3) errors.push("distrito");
  if (envio === "casa" && direccion.length < 6) errors.push("direccion");
  if (envio === "agencia" && agencia.length < 3) errors.push("agencia");

  return {
    errors,
    order: {
      nombre,
      telefono,
      envio,
      distrito,
      // Una sola columna: en Lima la dirección, en provincia la agencia.
      destino: envio === "casa" ? direccion : agencia,
      // Provincia: adelanto ahora y el resto al recoger. Lima paga todo al recibir.
      adelanto: envio === "agencia" ? ADELANTO_PROVINCIA : 0,
      pack,
      etiqueta,
      detalle: `${sachets} sachets`,
      cantidad,
      total: precio,

      // Identificadores del navegador para la Conversions API (ver order.js).
      fbp: clean(payload.fbp, 120),
      fbc: clean(payload.fbc, 255)
    }
  };
}

/** Arma la fila en el orden de COLUMNAS_CABLE (las mismas del Cable); `npm run check` verifica que cuadre. */
export function filaDePedidoMasilla(order, headers) {
  const cabecera = (nombre) => headers?.get(nombre) || "";

  return [
    order.fecha,
    order.nombre,
    `'+${order.telefono}`, // apóstrofo: evita que Sheets lo trate como número
    order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)",
    order.distrito,
    order.destino,
    order.etiqueta,
    order.detalle,
    order.cantidad,
    order.total,
    order.adelanto,
    ESTADOS[0],
    order.fbp,
    order.fbc,
    order.eventId,
    clean(cabecera("User-Agent"), 400),
    cabecera("CF-Connecting-IP")
  ];
}

export function mensajeMasillaNuevo(order) {
  const l = (t) => String(t ?? "").replace(/[_*`[]/g, "");
  return (
    `🧱 *¡Nuevo pedido: Masilla Selladora!* 🧱\n\n` +
    `🕐 *Hora:* ${l(order.fecha)}\n` +
    `👤 *Nombre:* ${l(order.nombre)}\n` +
    `📱 *WhatsApp:* +${order.telefono}\n` +
    `📦 *Pedido:* ${l(order.etiqueta)}\n` +
    `💰 *Total:* S/ ${order.total.toFixed(2)}` +
    (order.adelanto ? ` (adelanto S/ ${order.adelanto.toFixed(2)}, resto al recoger)` : "") +
    `\n🚚 *Entrega:* ${order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)"}\n` +
    `📍 *${order.envio === "casa" ? "Dirección" : "Agencia"}:* ${l(order.distrito)} — ${l(order.destino)}` +
    `\n\n🔥 _Escríbele rápido para confirmar el pedido._`
  );
}

/** Libro y pestaña donde caen los pedidos. */
export function hojaMasilla(env) {
  return {
    libro: env.GOOGLE_MASILLA_SHEET_ID || env.GOOGLE_SHEET_ID,
    pestana: env.GOOGLE_MASILLA_SHEET_NAME || "Masilla"
  };
}

/** Mismo tope por IP que /api/order (binding ORDER_LIMIT); sin binding, deja pasar. */
async function dentroDelLimite(env, ip) {
  if (!env.ORDER_LIMIT || !ip) return true;
  try {
    const { success } = await env.ORDER_LIMIT.limit({ key: ip });
    return success;
  } catch (err) {
    console.error("Rate limit:", err.message);
    return true;
  }
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
  if (clean(payload.website, 50)) return json({ ok: true, fila: 0, total: 0 });

  const { errors, order } = validate(payload);
  if (errors.length) return json({ error: "Revisa los datos del formulario.", fields: errors }, 422);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await dentroDelLimite(env, ip))) {
    return json(
      { error: "Recibimos varios pedidos desde tu conexión. Espera un minuto e inténtalo de nuevo." },
      429
    );
  }

  order.eventId = makeEventId().replace(/^TK-/, "MS-");
  order.fecha = fechaLima();

  let fila;
  try {
    // Sheets es la fuente de verdad: si falla, el pedido falla.
    const { libro, pestana } = hojaMasilla(env);
    await prepararPestana(env, libro, pestana);
    const rango = await appendRowsTo(env, libro, pestana, [filaDePedidoMasilla(order, request.headers)]);
    fila = numeroDeFila(rango);
  } catch (err) {
    console.error("Sheets (masilla):", err.message);
    return json(
      { error: "No pudimos registrar tu pedido en este momento. Intenta de nuevo en un minuto." },
      502
    );
  }

  // El pedido ya quedó guardado; el aviso va en segundo plano y nunca puede
  // atrasar ni tumbar la respuesta al cliente.
  waitUntil(notificarTelegram(env, mensajeMasillaNuevo(order)));

  return json({ ok: true, fila, total: order.total, eventId: order.eventId });
}

// Las columnas son las del Cable: si alguien las cambia allá, la fila de aquí debe cambiar también.
export const COLUMNAS_MASILLA = COLUMNAS_CABLE;
