/**
 * Webhook de la WhatsApp Cloud API.
 *
 * GET  — verificación que hace Meta una sola vez al configurar el webhook.
 * POST — cada mensaje entrante y cada actualización de estado (enviado,
 *        entregado, leído) de los que mandamos nosotros.
 *
 * Meta reintenta el POST si no responde 200 rápido, así que el handler
 * guarda todo en D1 en el propio request (D1 es rápido) y no hace ninguna
 * llamada de red antes de responder.
 */

import {
  obtenerOCrearContacto,
  obtenerOCrearConversacion,
  registrarMensajeEntrante,
  cancelarSeguimientosPendientes,
  actualizarEstadoMensaje,
  registrarPedidoCatalogo,
  nombresDeProductos,
  guardarProductosEnCache,
  idPorWaMessageId,
  registrarReaccionCliente
} from "../lib/crm-db.js";
import { firmaValida, listarProductosCatalogo } from "../lib/whatsapp.js";
import { mandarSecuenciaBienvenida } from "../lib/crm-welcome-sequence.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (modo === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }
  return json({ error: "Token de verificación inválido." }, 403);
}

function tipoYCuerpo(msg) {
  switch (msg.type) {
    case "text":
      return { type: "text", body: msg.text?.body || "" };
    case "image":
      return { type: "image", body: msg.image?.caption || "", mediaId: msg.image?.id, mediaMime: msg.image?.mime_type };
    case "video":
      return { type: "video", body: msg.video?.caption || "", mediaId: msg.video?.id, mediaMime: msg.video?.mime_type };
    case "audio":
      return { type: "audio", mediaId: msg.audio?.id, mediaMime: msg.audio?.mime_type };
    case "document":
      return { type: "document", body: msg.document?.filename || "", mediaId: msg.document?.id, mediaMime: msg.document?.mime_type };
    case "sticker":
      return { type: "sticker", mediaId: msg.sticker?.id, mediaMime: msg.sticker?.mime_type };
    case "location":
      return { type: "location", body: `${msg.location?.latitude},${msg.location?.longitude}` };
    case "button":
      return { type: "text", body: msg.button?.text || "" };
    case "order": {
      const items = msg.order?.product_items || [];
      const total = items.reduce((s, i) => s + (i.item_price || 0) * (i.quantity || 1), 0);
      const resumen = items.map((i) => `${i.quantity}× ${i.product_retailer_id}`).join(", ");
      return { type: "order", body: resumen, order: { catalogId: msg.order?.catalog_id, items, total, currency: items[0]?.currency } };
    }
    case "interactive": {
      const r = msg.interactive?.button_reply || msg.interactive?.list_reply;
      return { type: "text", body: r?.title || "" };
    }
    default:
      return { type: msg.type || "unknown", body: "" };
  }
}

/** Rellena `name` en cada item del pedido, resolviendo contra el caché o Meta. */
async function resolverNombresPedido(env, order) {
  const ids = order.items.map((i) => i.product_retailer_id).filter(Boolean);
  let mapa = await nombresDeProductos(env.CRM_DB, ids);
  const faltan = ids.filter((id) => !mapa[id]?.name);

  if (faltan.length && (order.catalogId || env.WHATSAPP_CATALOG_ID)) {
    try {
      const productos = await listarProductosCatalogo(env, order.catalogId || env.WHATSAPP_CATALOG_ID);
      await guardarProductosEnCache(env.CRM_DB, order.catalogId || env.WHATSAPP_CATALOG_ID, productos);
      mapa = await nombresDeProductos(env.CRM_DB, ids);
    } catch (err) {
      console.error("Resolver nombres del pedido:", err.message);
    }
  }

  order.items = order.items.map((i) => ({ ...i, name: mapa[i.product_retailer_id]?.name || null }));
  return order;
}

/** Si el contacto es nuevo y vino de un anuncio, manda la respuesta rápida configurada como bienvenida. */
async function mandarBienvenidaSiAplica(env, contacto, conversacion) {
  if (!contacto._isNew || !contacto.ctwa_clid) return;
  try {
    await mandarSecuenciaBienvenida(env, conversacion.id, contacto.wa_id, "Bienvenida automática");
  } catch (err) {
    console.error("Bienvenida automática:", err.message);
  }
}

async function procesarCambio(env, db, value) {
  const contactoMeta = value.contacts?.[0];

  for (const msg of value.messages || []) {
    const waId = msg.from;
    const contacto = await obtenerOCrearContacto(db, waId, contactoMeta?.profile?.name, msg.referral);
    const conversacion = await obtenerOCrearConversacion(db, contacto.id);

    // Una reacción no es un mensaje nuevo — solo marca la que ya existe. Un
    // emoji vacío ("") es al cliente sacándose su reacción anterior.
    if (msg.type === "reaction") {
      await registrarReaccionCliente(db, conversacion.id, msg.reaction?.message_id, msg.reaction?.emoji || null);
      continue;
    }

    const { type, body, mediaId, mediaMime, order } = tipoYCuerpo(msg);
    let bodyFinal = body;
    let ordenResuelta = order;
    if (type === "order" && order) {
      ordenResuelta = await resolverNombresPedido(env, order);
      bodyFinal = ordenResuelta.items.map((i) => `${i.quantity}× ${i.name || i.product_retailer_id}`).join(", ");
    }
    const replyToMessageId = msg.context?.id ? await idPorWaMessageId(db, msg.context.id) : null;
    await registrarMensajeEntrante(db, conversacion.id, { waMessageId: msg.id, type, body: bodyFinal, mediaId, mediaMime, replyToMessageId });
    await cancelarSeguimientosPendientes(db, conversacion.id);
    if (type === "order" && ordenResuelta) {
      await registrarPedidoCatalogo(db, conversacion.id, msg.id, ordenResuelta);
    }
    await mandarBienvenidaSiAplica(env, contacto, conversacion);
  }

  for (const st of value.statuses || []) {
    const err = st.errors?.[0];
    const errorDetail = err ? `${err.title || err.code || "Error"}${err.error_data?.details ? `: ${err.error_data.details}` : ""}` : null;
    await actualizarEstadoMensaje(db, st.id, st.status, errorDetail);
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  const cuerpoCrudo = await request.text();

  if (!(await firmaValida(env, cuerpoCrudo, request.headers.get("X-Hub-Signature-256")))) {
    return json({ error: "Firma inválida." }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(cuerpoCrudo);
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  if (!env.CRM_DB) {
    console.error("Webhook de WhatsApp: falta el binding CRM_DB.");
    return json({ ok: true }); // 200 igual: no queremos que Meta reintente sin parar
  }

  const tareas = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      tareas.push(procesarCambio(env, env.CRM_DB, change.value));
    }
  }

  // Se procesa en segundo plano pero sin perder errores: Meta solo necesita
  // el 200 rápido, no el resultado.
  waitUntil(
    Promise.all(tareas).catch((err) => console.error("Webhook WhatsApp:", err.message))
  );

  return json({ ok: true });
}
