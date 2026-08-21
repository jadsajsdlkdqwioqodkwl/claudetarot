/**
 * POST /api/order — recibe el formulario COD del modal y lo guarda en Google
 * Sheets. Responde con el número de fila, que /api/upsell usa después para
 * añadir el order bump sin necesidad de un código de pedido.
 *
 * Se dispara apenas el cliente pulsa CONFIRMAR, antes de la pantalla del
 * order bump: así el lead queda registrado aunque abandone ahí.
 */

import { appendRow } from "../lib/google-sheets.js";
import { VARIANTES, clean, toE164Peru, makeEventId } from "../lib/pedido.js";
import { notificarTelegram, mensajeLeadNuevo } from "../lib/telegram.js";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Fecha y hora de Lima como "YYYY-MM-DD HH:MM:SS".
 *
 * Sheets parsea ese formato como fecha-hora de verdad, no como texto, que es
 * lo que permite filtrar y agrupar por día en el panel. Un ISO con "T" y "Z"
 * se queda como cadena y rompe los totales. Perú es UTC-5 todo el año, sin
 * horario de verano, así que el desfase es fijo.
 */
export function fechaLima(ahora = new Date()) {
  return new Date(ahora.getTime() - 5 * 3600 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

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
  const { etiqueta, precio } = VARIANTES[variante];

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
      // Una sola columna: para Lima es la dirección, para provincia la agencia.
      destino: envio === "casa" ? direccion : agencia,
      variante,
      etiqueta,
      subtotal: precio,
      total: precio,

      // Identificadores del navegador para la Conversions API. Van a la hoja
      // tal cual; sin ellos Meta no puede casar el pedido con el clic del anuncio.
      fbp: clean(payload.fbp, 120),
      fbc: clean(payload.fbc, 255)
    }
  };
}

/**
 * Arma la fila tal como la espera la hoja. El orden tiene que coincidir con
 * COLUMNAS en ../lib/hoja.js — `npm run check` falla si se desalinean.
 */
export function filaDePedido(order, headers) {
  const cabecera = (nombre) => headers?.get(nombre) || "";

  return [
    order.fecha,
    order.nombre,
    `'+${order.telefono}`, // apóstrofo: evita que Sheets lo trate como número
    order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)",
    order.destino,
    order.etiqueta,
    order.subtotal,
    "", // Order bump — lo completa /api/upsell si el cliente acepta
    order.total,
    "Pendiente",

    // K–O: lo que la Conversions API necesita para casar este pedido con el
    // clic del anuncio. El user agent y la IP tienen que ser los del navegador
    // del cliente, no los del Worker.
    order.fbp,
    order.fbc,
    order.eventId,
    clean(cabecera("User-Agent"), 400),
    cabecera("CF-Connecting-IP")
  ];
}

/**
 * Tope de pedidos por IP. Usa el rate limiter nativo de Cloudflare, que no
 * necesita almacenamiento propio. Si el binding no está (dev local, o aún sin
 * desplegar) deja pasar: nunca queremos perder un lead por esto.
 */
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
  if (clean(payload.website, 50)) {
    return json({ ok: true, fila: 0, total: 0 });
  }

  const { errors, order } = validate(payload);
  if (errors.length) {
    return json({ error: "Revisa los datos del formulario.", fields: errors }, 422);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await dentroDelLimite(env, ip))) {
    return json(
      { error: "Recibimos varios pedidos desde tu conexión. Espera un minuto e inténtalo de nuevo." },
      429
    );
  }

  order.eventId = makeEventId();
  order.fecha = fechaLima();

  let fila;
  try {
    // Sheets es la fuente de verdad: si falla, el pedido falla.
    const rango = await appendRow(env, filaDePedido(order, request.headers));
    fila = numeroDeFila(rango);
  } catch (err) {
    console.error("Sheets:", err.message);
    return json(
      { error: "No pudimos registrar tu pedido en este momento. Intenta de nuevo en un minuto." },
      502
    );
  }

  // El pedido ya quedó guardado; el aviso a Telegram va en segundo plano y
  // nunca puede atrasar ni tumbar la respuesta al cliente.
  waitUntil(notificarTelegram(env, mensajeLeadNuevo(order)));

  return json({ ok: true, fila, total: order.total, eventId: order.eventId });
}

/** "Pedidos!A42:O42" -> 42. Es cómo localizamos la fila para el order bump. */
export function numeroDeFila(rangoActualizado) {
  const match = /![A-Z]+(\d+)/.exec(rangoActualizado || "");
  return match ? Number(match[1]) : 0;
}
