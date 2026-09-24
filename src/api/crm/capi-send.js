/**
 * GET  /api/crm/capi-send?conversation_id=1 — historial de eventos a Meta de ese chat
 * POST /api/crm/capi-send — le reporta a Meta lo que pasó en el chat:
 *      { conversation_id, tipo: "venta" | "intencion", value?, currency?, product_label? }
 *      { order_id, value?, currency? } — venta a partir de un pedido del catálogo
 *
 * Lo dispara la asesora o un admin a mano, desde los botones del header del
 * chat (carrito = intención de compra, bolsa = venta) o el panel de detalle.
 * Conversions API, no es un mensaje de WhatsApp: nunca cobra ni le manda
 * nada al cliente. Ver src/lib/meta-capi.js para cómo elige el camino.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { reportarEventoMeta } from "../../lib/meta-capi.js";
import { registrarEventoCapi } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ request, env }) {
  const conversationId = Number(new URL(request.url).searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const { results } = await env.CRM_DB.prepare(
    "SELECT * FROM capi_events WHERE conversation_id = ? ORDER BY id DESC LIMIT 20"
  )
    .bind(conversationId)
    .all();
  return json({ events: results });
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const tipo = payload?.tipo === "intencion" ? "intencion" : "venta";
  const orderId = payload?.order_id ? Number(payload.order_id) : null;
  let conversationId = payload?.conversation_id ? Number(payload.conversation_id) : null;
  let waId, ctwaClid, nombreCompleto;

  if (orderId) {
    const pedido = await env.CRM_DB.prepare(
      `SELECT o.*, conv.id AS conversation_id, c.wa_id, c.ctwa_clid, c.name, c.profile_name
       FROM catalog_orders o
       JOIN conversations conv ON conv.id = o.conversation_id
       JOIN contacts c ON c.id = conv.contact_id
       WHERE o.id = ?`
    )
      .bind(orderId)
      .first();
    if (!pedido) return json({ error: "Pedido no encontrado." }, 404);
    conversationId = pedido.conversation_id;
    waId = pedido.wa_id;
    ctwaClid = pedido.ctwa_clid;
    nombreCompleto = pedido.name || pedido.profile_name;
    if (payload?.value === undefined && pedido.total_amount) payload.value = pedido.total_amount;
    if (!payload?.currency && pedido.currency) payload.currency = pedido.currency;
  } else if (conversationId) {
    const conv = await env.CRM_DB.prepare(
      `SELECT c.wa_id, c.ctwa_clid, c.name, c.profile_name FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
    )
      .bind(conversationId)
      .first();
    if (!conv) return json({ error: "Conversación no encontrada." }, 404);
    waId = conv.wa_id;
    ctwaClid = conv.ctwa_clid;
    nombreCompleto = conv.name || conv.profile_name;
  } else {
    return json({ error: "Falta order_id o conversation_id." }, 400);
  }

  // Primer nombre del contacto como base — muchos "profile_name" de WhatsApp
  // traen emojis o apodos que mejor no mandar completos.
  const primerNombre = nombreCompleto ? String(nombreCompleto).trim().split(/\s+/)[0].replace(/[^\p{L}]/gu, "") : null;
  const nombreManual = payload?.first_name ? String(payload.first_name).trim().slice(0, 100) : null;
  const apellidoManual = payload?.last_name ? String(payload.last_name).trim().slice(0, 100) : null;
  const emailManual = payload?.email ? String(payload.email).trim().slice(0, 200) : null;

  const valor = Number(payload?.value) || 0;
  const moneda = payload?.currency || "PEN";
  if (tipo === "venta" && valor <= 0) return json({ error: "Necesita un monto (value) mayor a 0." }, 400);

  const productLabel = payload?.product_label ? String(payload.product_label).trim().slice(0, 200) : null;
  const createdBy = agent?.displayName || agent?.username || null;
  const eventId = orderId ? `capi-order-${orderId}` : `capi-${tipo}-${conversationId}-${Date.now()}`;

  try {
    const r = await reportarEventoMeta(env, {
      tipo,
      waId,
      ctwaClid,
      valor,
      moneda,
      eventId,
      contentName: productLabel,
      firstName: nombreManual || primerNombre || undefined,
      lastName: apellidoManual || undefined,
      email: emailManual || undefined,
      testEventCode: payload?.test_event_code || undefined
    });

    if (orderId) {
      await env.CRM_DB.prepare("UPDATE catalog_orders SET capi_status = 'enviado', capi_sent_at = datetime('now') WHERE id = ?")
        .bind(orderId)
        .run();
    }
    await registrarEventoCapi(env.CRM_DB, { conversationId, orderId, productLabel, valor, moneda, status: "enviado", createdBy, eventName: r.eventName, modo: r.modo, error: r.aviso });
    return json({ ok: true, modo: r.modo, event_name: r.eventName, aviso: r.aviso, meta_response: r.respuesta });
  } catch (err) {
    if (orderId) {
      await env.CRM_DB.prepare("UPDATE catalog_orders SET capi_status = 'fallido' WHERE id = ?").bind(orderId).run();
    }
    await registrarEventoCapi(env.CRM_DB, { conversationId, orderId, productLabel, valor, moneda, status: "fallido", createdBy, eventName: tipo === "venta" ? "Purchase" : "InitiateCheckout", error: err.message.slice(0, 500) });
    return json({ error: `Meta rechazó el evento: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
