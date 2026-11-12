/**
 * POST /api/asesor/marcar-compra  { whatsapp, valor?, product_label?, motivo? }
 *   → { ok, conversation_id, ya_marcado?, meta: { modo, event_name, aviso } | { error } }
 *
 * Marca la venta en el CRM (etiqueta `purchase` del chat, igual que el botón de la bolsa) y reporta el Purchase a Meta por la
 * Conversions API, cuando el reporte «Pedidos y ventas» ve una venta que la asesora no marcó (`sin_marcar_compra`).
 * Autorizado por el dueño el 2026-11-09 («si ve que una venta es compra y no la han marcado, tiene que marcarla»).
 * No manda nada al cliente. Si Meta rechaza el evento, la etiqueta queda igual (la venta pasó) y se devuelve el error.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { reportarEventoMeta } from "../lib/meta-capi.js";
import { envDeConversacion } from "../lib/lineas.js";
import { registrarEventoCapi, agregarEtiquetaMeta } from "../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const n9 = (v) => String(v ?? "").replace(/\D/g, "").slice(-9);

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const p = await request.json().catch(() => null);
  const wa = n9(p?.whatsapp);
  if (!wa) return json({ error: "Falta whatsapp." }, 400);
  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, conv.meta_tags, c.wa_id, CASE WHEN conv.linea_id IS NULL THEN COALESCE(conv.ctwa_clid, c.ctwa_clid) ELSE conv.ctwa_clid END AS ctwa_clid,
            COALESCE(c.name, c.profile_name, '') AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE substr(c.wa_id, -9) = ? ORDER BY conv.id DESC LIMIT 1`
  ).bind(wa).first();
  if (!conv) return json({ error: "No hay chat con ese WhatsApp." }, 404);
  if (/\bpurchase\b/.test(conv.meta_tags || "")) return json({ ok: true, conversation_id: conv.id, ya_marcado: true });

  const valor = Number(p?.valor) > 0 ? Number(p.valor) : 89;
  const productLabel = p?.product_label ? String(p.product_label).slice(0, 200) : "Kit Tarot de aprendizaje";
  const createdBy = `reporte pedidos y ventas${p?.motivo ? ` (${String(p.motivo).slice(0, 80)})` : ""}`;
  const eventId = `capi-venta-${conv.id}-${Date.now()}`;
  await agregarEtiquetaMeta(env.CRM_DB, conv.id, "purchase");
  const primerNombre = conv.nombre ? String(conv.nombre).trim().split(/\s+/)[0].replace(/[^\p{L}]/gu, "") : undefined;
  try {
    const r = await reportarEventoMeta(await envDeConversacion(env, conv.id), { tipo: "venta", waId: conv.wa_id, ctwaClid: conv.ctwa_clid, valor, moneda: "PEN", eventId, contentName: productLabel, firstName: primerNombre || undefined });
    await registrarEventoCapi(env.CRM_DB, { conversationId: conv.id, orderId: null, productLabel, valor, moneda: "PEN", status: "enviado", createdBy, eventName: r.eventName, modo: r.modo, error: r.aviso });
    return json({ ok: true, conversation_id: conv.id, meta: { modo: r.modo, event_name: r.eventName, aviso: r.aviso } });
  } catch (err) {
    await registrarEventoCapi(env.CRM_DB, { conversationId: conv.id, orderId: null, productLabel, valor, moneda: "PEN", status: "fallido", createdBy, eventName: "Purchase", error: String(err.message).slice(0, 500) }).catch(() => null);
    return json({ ok: true, conversation_id: conv.id, etiqueta: "purchase", meta: { error: `Meta rechazó el evento: ${err.message}` } });
  }
}
