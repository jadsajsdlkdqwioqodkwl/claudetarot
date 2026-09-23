/**
 * GET  /api/crm/capi-send?conversation_id=1 — historial de eventos CAPI mandados en ese chat
 * POST /api/crm/capi-send — manda a mano el evento de Purchase a Meta:
 *      { order_id, value?, currency? } — a partir de un pedido real del catálogo
 *      { conversation_id, value, currency?, product_label? } — sin catálogo,
 *        para la mayoría de ventas que se cierran por chat y nunca pasan por
 *        el checkout nativo de WhatsApp (no hace falta armar un pedido falso
 *        ni mandarle al cliente ninguna notificación para poder reportarla)
 *
 * Nunca automático — un admin lo dispara después de revisar que la venta es
 * real. Solo admin.
 *
 * `test_event_code` (opcional): lo da Events Manager → Test Events, para
 * confirmar que el evento llega bien antes de mandarlo "de verdad".
 *
 * Conversions API, no es un mensaje de WhatsApp — nunca cobra, sea con
 * ctwa_clid o en modo manual. Ver docs/whatsapp-ventanas-y-costos.md.
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { construirEventoCapi, enviarEventoCapi } from "../../lib/meta-capi.js";

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

  // Primer nombre del contacto como base — muchos "profile_name" de
  // WhatsApp ya vienen con emojis o apodos raros que mejor no mandar
  // completos. El agente puede pisarlo a mano desde el form (mejora el
  // Event Match Quality, sobre todo útil en el reporte manual sin
  // ctwa_clid, donde no hay más que ph para hacer match).
  const primerNombre = nombreCompleto ? String(nombreCompleto).trim().split(/\s+/)[0].replace(/[^\p{L}]/gu, "") : null;
  const nombreManual = payload?.first_name ? String(payload.first_name).trim().slice(0, 100) : null;
  const apellidoManual = payload?.last_name ? String(payload.last_name).trim().slice(0, 100) : null;
  const emailManual = payload?.email ? String(payload.email).trim().slice(0, 200) : null;

  const valor = Number(payload?.value);
  const moneda = payload?.currency || "PEN";
  if (!valor || Number.isNaN(valor) || valor <= 0) return json({ error: "Necesita un monto (value) mayor a 0." }, 400);

  const productLabel = payload?.product_label ? String(payload.product_label).trim().slice(0, 200) : null;
  const createdBy = agent?.displayName || agent?.username || null;

  try {
    const evento = await construirEventoCapi({
      waId,
      ctwaClid,
      valor,
      moneda,
      eventId: orderId ? `capi-order-${orderId}` : `capi-conv-${conversationId}-${Date.now()}`,
      contentName: productLabel,
      firstName: nombreManual || primerNombre || undefined,
      lastName: apellidoManual || undefined,
      email: emailManual || undefined,
      testEventCode: payload?.test_event_code || undefined
    });
    const respuesta = await enviarEventoCapi(env, evento);

    if (orderId) {
      await env.CRM_DB.prepare("UPDATE catalog_orders SET capi_status = 'enviado', capi_sent_at = datetime('now') WHERE id = ?")
        .bind(orderId)
        .run();
    }
    await env.CRM_DB.prepare(
      `INSERT INTO capi_events (conversation_id, order_id, product_label, value, currency, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'enviado', ?)`
    )
      .bind(conversationId, orderId, productLabel, valor, moneda, createdBy)
      .run();

    return json({ ok: true, meta_response: respuesta });
  } catch (err) {
    if (orderId) {
      await env.CRM_DB.prepare("UPDATE catalog_orders SET capi_status = 'fallido' WHERE id = ?").bind(orderId).run();
    }
    await env.CRM_DB.prepare(
      `INSERT INTO capi_events (conversation_id, order_id, product_label, value, currency, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'fallido', ?)`
    )
      .bind(conversationId, orderId, productLabel, valor, moneda, createdBy)
      .run();
    return json({ error: `Meta rechazó el evento: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAdmin(get);
export const onRequestPost = conAdmin(post);
