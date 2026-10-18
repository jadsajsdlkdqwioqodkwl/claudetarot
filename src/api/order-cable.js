/**
 * POST /api/order-cable — recibe el formulario COD de /cable/ y lo guarda en
 * una pestaña propia («Cable») de Google Sheets.
 *
 * Es el mismo mecanismo que /api/order (Worker + cuenta de servicio, sin
 * Apps Script), pero aparte a propósito: no comparte columnas, precios ni
 * flujo con el Kit de Tarot, y NO dispara el WhatsApp automático de «pedido
 * recibido» (esa plantilla es de Tarot Store). Solo Lima: el envío es siempre
 * pago en casa.
 *
 * La hoja es, por defecto, el mismo libro de Pedidos (ya compartido con la
 * cuenta de servicio): la pestaña se crea sola con el primer pedido. Si se
 * prefiere otro libro, basta GOOGLE_CABLE_SHEET_ID (y compartirlo con la
 * cuenta de servicio como Editor); GOOGLE_CABLE_SHEET_NAME cambia el nombre.
 */

import { appendRowsTo, batchUpdate, getSpreadsheet } from "../lib/google-sheets.js";
import { clean, toE164Peru, makeEventId } from "../lib/pedido.js";
import { PACKS, CONECTORES, COLUMNAS_CABLE, ADELANTO_PROVINCIA } from "../lib/pedido-cable.js";
import { ESTADOS } from "../lib/hoja.js";
import { notificarTelegram } from "../lib/telegram.js";
import { fechaLima, numeroDeFila } from "./order.js";

const MAX_BODY_BYTES = 8 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

/** Un valor de lista cerrada: lo que mande el navegador, o el primero si no existe. */
function deLista(valor, lista) {
  return lista.includes(valor) ? valor : lista[0];
}

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
  const { etiqueta, precio, cantidad } = PACKS[pack];

  // Un cable por unidad del pack: solo se elige el conector (todos son naranja).
  const recibidos = Array.isArray(payload.cables) ? payload.cables : [];
  const cables = Array.from({ length: cantidad }, (_, i) => ({
    conector: deLista(recibidos[i]?.conector, CONECTORES)
  }));
  const detalle = cables.map((c, i) => `${i + 1}) ${c.conector}`).join(" · ");

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
      detalle,
      cantidad,
      total: precio,

      // Identificadores del navegador para la Conversions API (ver order.js).
      fbp: clean(payload.fbp, 120),
      fbc: clean(payload.fbc, 255)
    }
  };
}

/** Arma la fila en el orden de COLUMNAS_CABLE; `npm run check` verifica que cuadre. */
export function filaDePedidoCable(order, headers) {
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

export function mensajeCableNuevo(order) {
  const l = (t) => String(t ?? "").replace(/[_*`[]/g, "");
  return (
    `🔌 *¡Nuevo pedido: Cable 2 en 1!* 🔌\n\n` +
    `🕐 *Hora:* ${l(order.fecha)}\n` +
    `👤 *Nombre:* ${l(order.nombre)}\n` +
    `📱 *WhatsApp:* +${order.telefono}\n` +
    `📦 *Pedido:* ${l(order.etiqueta)}\n` +
    `🔧 *Detalle:* ${l(order.detalle)}\n` +
    `💰 *Total:* S/ ${order.total.toFixed(2)}` +
    (order.adelanto ? ` (adelanto S/ ${order.adelanto.toFixed(2)}, resto al recoger)` : "") +
    `\n🚚 *Entrega:* ${order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)"}\n` +
    `📍 *${order.envio === "casa" ? "Dirección" : "Agencia"}:* ${l(order.distrito)} — ${l(order.destino)}` +
    `\n\n🔥 _Escríbele rápido para confirmar el pedido._`
  );
}

/** Libro y pestaña donde caen los pedidos. */
export function hojaCable(env) {
  return {
    libro: env.GOOGLE_CABLE_SHEET_ID || env.GOOGLE_SHEET_ID,
    pestana: env.GOOGLE_CABLE_SHEET_NAME || "Cable"
  };
}

// Pestañas ya verificadas en este isolate: la comprobación cuesta una llamada a
// Sheets y solo hace falta la primera vez.
const pestanasListas = new Set();

/**
 * Deja lista la pestaña (idempotente): si no existe la crea con sus
 * encabezados, filtro, desplegable de Estado y las columnas de la CAPI ocultas.
 * Si ya existe no toca nada, para no pisar lo que el vendedor haya cambiado.
 */
export async function prepararPestana(env, libro, pestana) {
  const clave = `${libro}|${pestana}`;
  if (pestanasListas.has(clave)) return;

  const actual = await getSpreadsheet(env, libro);
  if (actual.sheets?.some((s) => s.properties.title === pestana)) {
    pestanasListas.add(clave);
    return;
  }

  const creada = await batchUpdate(
    env,
    [{ addSheet: { properties: { title: pestana, gridProperties: { frozenRowCount: 1 } } } }],
    libro
  );
  const sheetId = creada.replies?.[0]?.addSheet?.properties?.sheetId;
  await appendRowsTo(env, libro, pestana, [COLUMNAS_CABLE]);

  const iEstado = COLUMNAS_CABLE.indexOf("Estado");
  const iTotal = COLUMNAS_CABLE.indexOf("Total");
  const iAdelanto = COLUMNAS_CABLE.indexOf("Adelanto");
  const iFbp = COLUMNAS_CABLE.indexOf("FBP");
  const col = (i) => ({ sheetId, startColumnIndex: i, endColumnIndex: i + 1, startRowIndex: 1 });

  await batchUpdate(
    env,
    [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.07, green: 0.07, blue: 0.07 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)"
        }
      },
      {
        repeatCell: {
          range: col(0),
          cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "dd/mm/yyyy hh:mm" } } },
          fields: "userEnteredFormat.numberFormat"
        }
      },
      ...[iTotal, iAdelanto].map((i) => ({
        repeatCell: {
          range: col(i),
          cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"S/ "#,##0.00' } } },
          fields: "userEnteredFormat.numberFormat"
        }
      })),
      {
        setDataValidation: {
          range: col(iEstado),
          rule: {
            condition: { type: "ONE_OF_LIST", values: ESTADOS.map((e) => ({ userEnteredValue: e })) },
            showCustomUi: true,
            strict: false
          }
        }
      },
      { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: COLUMNAS_CABLE.length } } } },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: iFbp, endIndex: COLUMNAS_CABLE.length },
          properties: { hiddenByUser: true },
          fields: "hiddenByUser"
        }
      }
    ],
    libro
  );
  pestanasListas.add(clave);
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

  order.eventId = makeEventId().replace(/^TK-/, "CB-");
  order.fecha = fechaLima();

  let fila;
  try {
    // Sheets es la fuente de verdad: si falla, el pedido falla.
    const { libro, pestana } = hojaCable(env);
    await prepararPestana(env, libro, pestana);
    const rango = await appendRowsTo(env, libro, pestana, [filaDePedidoCable(order, request.headers)]);
    fila = numeroDeFila(rango);
  } catch (err) {
    console.error("Sheets (cable):", err.message);
    return json(
      { error: "No pudimos registrar tu pedido en este momento. Intenta de nuevo en un minuto." },
      502
    );
  }

  // El pedido ya quedó guardado; el aviso va en segundo plano y nunca puede
  // atrasar ni tumbar la respuesta al cliente.
  waitUntil(notificarTelegram(env, mensajeCableNuevo(order)));

  return json({ ok: true, fila, total: order.total, eventId: order.eventId });
}
