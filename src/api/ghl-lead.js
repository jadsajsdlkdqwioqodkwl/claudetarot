/**
 * POST /api/ghl-lead — recibe el pedido del kit de tarot desde ghl/index.html
 * (la página vive en el dominio de GHL, no en este) y lo registra en GHL
 * directo por API: crea/actualiza el Contact, le deja una nota con el
 * resumen del pedido y, si hay Pipeline configurado, crea la Opportunity.
 *
 * Sustituye al Webhook entrante de un Workflow — esa función está
 * deshabilitada en el plan actual de la cuenta de GHL — sin tocar el diseño
 * ni la lógica de la página. Ver ghl/README.md, sección 5.
 */

import { clean, toE164Peru } from "../lib/pedido.js";
import { upsertContacto, agregarNota, crearOportunidad } from "../lib/ghl.js";
import { notificarTelegram, mensajeLeadNuevo } from "../lib/telegram.js";

const MAX_BODY_BYTES = 8 * 1024;
const BUMP_PRECIO = 49; // The Classic Tarot Rider Waite — igual que en ghl/index.html

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin)
    }
  });

/**
 * La página vive en un dominio de GHL, distinto al de este Worker, así que
 * el navegador exige CORS. Es el mismo trato de "público, protegido por
 * honeypot + límite por IP" que ya tenía /api/order — no hay cookies ni
 * sesión de por medio, así que abrir el origen no expone nada nuevo.
 */
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin")) });
}

function fechaLima(ahora = new Date()) {
  return new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

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

function validar(payload) {
  const errores = [];
  const nombre = clean(payload.nombre, 80);
  const telefono = toE164Peru(payload.telefono);
  const envio = payload.envio === "agencia" ? "agencia" : "casa";
  const direccion = clean(payload.direccion, 160);
  const agencia = clean(payload.agencia, 160);
  const producto = clean(payload.producto, 60) || "1 Kit de Tarot Completo";
  const bump = payload.bump === "riderwaite" ? "The Classic Tarot Rider Waite" : "";
  const precioVariante = Number(payload.precio_variante) || 79;
  const total = bump ? precioVariante + BUMP_PRECIO : precioVariante;

  if (nombre.length < 3) errores.push("nombre");
  if (!telefono) errores.push("telefono");
  if (envio === "casa" && direccion.length < 6) errores.push("direccion");
  if (envio === "agencia" && agencia.length < 3) errores.push("agencia");

  return {
    errores,
    order: {
      nombre,
      telefono,
      envio,
      destino: envio === "casa" ? direccion : agencia,
      etiqueta: producto,
      bump,
      subtotal: precioVariante,
      total,
      fecha: fechaLima(),
      fbclid: clean(payload.fbclid, 255),
      fbp: clean(payload.fbp, 120),
      fbc: clean(payload.fbc, 255),
      pagina: clean(payload.pagina, 300)
    }
  };
}

function notaDelPedido(order) {
  const entrega = order.envio === "casa" ? "Pago en casa (Lima)" : "Agencia (provincia)";
  const etiquetaDestino = order.envio === "casa" ? "Dirección" : "Agencia";
  const lineas = [
    `Pedido — Kit de Tarot (${order.fecha})`,
    `Producto: ${order.etiqueta}`,
    order.bump ? `Extra: ${order.bump}` : null,
    `Entrega: ${entrega}`,
    `${etiquetaDestino}: ${order.destino}`,
    `Total: S/ ${order.total.toFixed(2)}`,
    order.fbclid ? `fbclid: ${order.fbclid}` : null,
    order.fbp ? `_fbp: ${order.fbp}` : null,
    order.fbc ? `_fbc: ${order.fbc}` : null,
    order.pagina ? `Página: ${order.pagina}` : null
  ].filter(Boolean);
  return lineas.join("\n");
}

export async function onRequestPost({ request, env, waitUntil }) {
  const origin = request.headers.get("Origin");

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "El pedido es demasiado grande." }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "No pudimos leer el pedido." }, 400, origin);
  }

  // Honeypot: si un bot llenó el campo oculto, respondemos 200 sin registrar.
  if (clean(payload.website, 50)) {
    return json({ ok: true }, 200, origin);
  }

  const { errores, order } = validar(payload);
  if (errores.length) {
    return json({ error: "Revisa los datos del pedido.", fields: errores }, 422, origin);
  }

  if (!env.GHL_PRIVATE_TOKEN || !env.GHL_LOCATION_ID) {
    console.error("Faltan GHL_PRIVATE_TOKEN o GHL_LOCATION_ID");
    return json({ error: "El pedido no se pudo registrar (falta configuración)." }, 500, origin);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await dentroDelLimite(env, ip))) {
    return json(
      { error: "Recibimos varios pedidos desde tu conexión. Espera un minuto e inténtalo de nuevo." },
      429,
      origin
    );
  }

  try {
    const contactId = await upsertContacto(env, {
      nombre: order.nombre,
      telefono: order.telefono,
      tags: ["kit-tarot-cod"],
      source: "Kit de Tarot — Landing GHL"
    });

    await agregarNota(env, contactId, notaDelPedido(order));

    // Opcional: solo si configuraste ambos IDs de Pipeline/Stage.
    if (env.GHL_PIPELINE_ID && env.GHL_PIPELINE_STAGE_ID) {
      await crearOportunidad(env, { contactId, nombre: order.nombre, total: order.total });
    }

    waitUntil(notificarTelegram(env, mensajeLeadNuevo(order)));

    return json({ ok: true }, 200, origin);
  } catch (err) {
    console.error("GHL:", err.message);
    return json({ error: "No pudimos registrar tu pedido en este momento." }, 502, origin);
  }
}
