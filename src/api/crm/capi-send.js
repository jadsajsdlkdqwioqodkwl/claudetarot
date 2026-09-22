/**
 * POST /api/crm/capi-send — { order_id, value?, currency?, test_event_code? }
 * Manda a mano el evento de Purchase a Meta Conversions API para ese pedido
 * del catálogo — nunca automático, un admin lo dispara después de revisar
 * que la venta es real. Solo admin.
 *
 * `test_event_code` (opcional): lo da Events Manager → Test Events, para
 * confirmar que el evento llega bien antes de mandarlo "de verdad".
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { construirEventoCapi, enviarEventoCapi } from "../../lib/meta-capi.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const orderId = Number(payload?.order_id);
  if (!orderId) return json({ error: "Falta order_id." }, 400);

  const pedido = await env.CRM_DB.prepare(
    `SELECT o.*, c.wa_id, c.ctwa_clid
     FROM catalog_orders o
     JOIN conversations conv ON conv.id = o.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     WHERE o.id = ?`
  )
    .bind(orderId)
    .first();
  if (!pedido) return json({ error: "Pedido no encontrado." }, 404);

  const valor = payload?.value !== undefined ? Number(payload.value) : pedido.total_amount;
  const moneda = payload?.currency || pedido.currency || "PEN";
  if (!valor || Number.isNaN(valor)) return json({ error: "Necesita un monto (value) — este pedido no tiene total_amount guardado." }, 400);

  try {
    const evento = await construirEventoCapi({
      waId: pedido.wa_id,
      ctwaClid: pedido.ctwa_clid,
      valor,
      moneda,
      eventId: `capi-order-${orderId}`,
      testEventCode: payload?.test_event_code || undefined
    });
    const respuesta = await enviarEventoCapi(env, evento);

    await env.CRM_DB.prepare("UPDATE catalog_orders SET capi_status = 'enviado', capi_sent_at = datetime('now') WHERE id = ?")
      .bind(orderId)
      .run();

    return json({ ok: true, meta_response: respuesta });
  } catch (err) {
    await env.CRM_DB.prepare("UPDATE catalog_orders SET capi_status = 'fallido' WHERE id = ?").bind(orderId).run();
    return json({ error: `Meta rechazó el evento: ${err.message}` }, 502);
  }
}

export const onRequestPost = conAdmin(post);
