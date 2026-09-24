/**
 * GET  /api/crm/catalog?conversation_id=1 — pedidos armados desde el catálogo en esa conversación
 * POST /api/crm/catalog — { conversation_id, text? } → manda el botón "Ver catálogo" completo
 *      { conversation_id, product_retailer_id, text? } → manda un solo producto
 */

import { conAuth } from "../../lib/crm-auth.js";
import { enviarCatalogo, enviarProducto, listarProductosCatalogo } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente, cancelarSeguimientosDeLead } from "../../lib/crm-db.js";
import { nombresDeProductos, guardarProductosEnCache } from "../../lib/crm-db.js";
import { pausaEnvio } from "../../lib/crm-send.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function completarNombres(env, orders) {
  const idsFaltantes = new Set();
  for (const o of orders) for (const it of o.items) if (!it.name) idsFaltantes.add(it.product_retailer_id);
  if (!idsFaltantes.size) return orders;

  let mapa = await nombresDeProductos(env.CRM_DB, [...idsFaltantes]);
  const siguenFaltando = [...idsFaltantes].filter((id) => !mapa[id]?.name);

  // Si el caché no los tiene, se piden de una a Meta y se guardan para la próxima.
  if (siguenFaltando.length && env.WHATSAPP_CATALOG_ID) {
    try {
      const productos = await listarProductosCatalogo(env, env.WHATSAPP_CATALOG_ID);
      await guardarProductosEnCache(env.CRM_DB, env.WHATSAPP_CATALOG_ID, productos);
      mapa = await nombresDeProductos(env.CRM_DB, [...idsFaltantes]);
    } catch (err) {
      console.error("Resolver nombres de catálogo:", err.message);
    }
  }

  return orders.map((o) => ({
    ...o,
    items: o.items.map((it) => ({ ...it, name: mapa[it.product_retailer_id]?.name || null }))
  }));
}

async function get({ request, env }) {
  const conversationId = Number(new URL(request.url).searchParams.get("conversation_id"));
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const { results } = await env.CRM_DB.prepare(
    "SELECT * FROM catalog_orders WHERE conversation_id = ? ORDER BY id DESC"
  )
    .bind(conversationId)
    .all();

  const orders = await completarNombres(env, results.map((o) => ({ ...o, items: JSON.parse(o.items_json) })));
  return json({ orders });
}

/** GET /api/crm/catalog-products — el picker de "elegir un producto". */
async function getProductos({ env }) {
  if (!env.WHATSAPP_CATALOG_ID) return json({ error: "Falta WHATSAPP_CATALOG_ID." }, 503);
  try {
    const productos = await listarProductosCatalogo(env, env.WHATSAPP_CATALOG_ID);
    await guardarProductosEnCache(env.CRM_DB, env.WHATSAPP_CATALOG_ID, productos);
    return json({ products: productos });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  )
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  const sentBy = agent?.displayName || agent?.username || null;
  const retailerId = payload?.product_retailer_id ? String(payload.product_retailer_id) : null;

  try {
    if (retailerId) {
      if (!env.WHATSAPP_CATALOG_ID) return json({ error: "Falta WHATSAPP_CATALOG_ID." }, 503);

      // El nombre viaja desde el picker (ya lo tenía cargado); si no vino,
      // se resuelve del caché para nunca mostrar el SKU crudo en el chat.
      let nombre = payload?.product_name ? String(payload.product_name).slice(0, 120) : null;
      if (!nombre) {
        const mapa = await nombresDeProductos(env.CRM_DB, [retailerId]);
        nombre = mapa[retailerId]?.name || null;
      }

      await pausaEnvio(env, conversationId);
      const waMessageId = await enviarProducto(env, conv.wa_id, env.WHATSAPP_CATALOG_ID, retailerId, payload?.text);
      await registrarMensajeSaliente(env.CRM_DB, conversationId, {
        waMessageId,
        type: "product",
        body: nombre || "Producto del catálogo",
        sentBy
      });
      await cancelarSeguimientosDeLead(env.CRM_DB, conversationId);
      return json({ ok: true, wa_message_id: waMessageId });
    }

    let thumbnailRetailerId;
    if (env.WHATSAPP_CATALOG_ID) {
      try {
        const productos = await listarProductosCatalogo(env, env.WHATSAPP_CATALOG_ID);
        thumbnailRetailerId = productos[0]?.retailer_id;
      } catch { /* si falla, se manda igual sin miniatura elegida a mano */ }
    }
    await pausaEnvio(env, conversationId);
    const waMessageId = await enviarCatalogo(env, conv.wa_id, payload?.text, thumbnailRetailerId);
    await registrarMensajeSaliente(env.CRM_DB, conversationId, {
      waMessageId,
      type: "catalog",
      body: "[Catálogo enviado]",
      sentBy
    });
    await cancelarSeguimientosDeLead(env.CRM_DB, conversationId);
    return json({ ok: true, wa_message_id: waMessageId });
  } catch (err) {
    return json({ error: `WhatsApp rechazó el envío: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestGetProductos = conAuth(getProductos);
