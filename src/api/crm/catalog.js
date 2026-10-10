/**
 * GET  /api/crm/catalog?conversation_id=1 — pedidos armados desde el catálogo en esa conversación
 * POST /api/crm/catalog — { conversation_id, text? } → manda el botón "Ver catálogo" completo
 *      { conversation_id, product_retailer_id, text? } → manda un solo producto
 *      Ambos aceptan quick_reply_id (+ variante_id, editada, a_mano) cuando el
 *      catálogo es lo único que sale de una respuesta rápida "con catálogo":
 *      programa su seguimiento y anota el uso, como /api/crm/messages.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { enviarCatalogoConPortada, enviarProducto, listarProductosCatalogo } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente, cancelarSeguimientosDeLead } from "../../lib/crm-db.js";
import { nombresDeProductos, guardarProductosEnCache, programarSeguimientoDeRapida } from "../../lib/crm-db.js";
import { registrarUso } from "../../lib/crm-variantes.js";
import { mandarAlToque } from "../../lib/crm-send.js";
import { envDeConversacion, envDeLinea, lineaPorId } from "../../lib/lineas.js";

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

/** GET /api/crm/catalog-products — el picker de "elegir un producto" (?conversation_id= el catálogo del número de ese chat). */
async function getProductos({ request, env: envBase }) {
  const q = new URL(request.url).searchParams;
  // ?linea_id= el catálogo de ese número (la galería de fotos); ?conversation_id= el del chat.
  const lineaId = Number(q.get("linea_id")) || null;
  const env = lineaId ? envDeLinea(envBase, await lineaPorId(envBase.CRM_DB, lineaId)) : await envDeConversacion(envBase, Number(q.get("conversation_id")) || null);
  if (!env.WHATSAPP_CATALOG_ID) return json({ error: "Falta WHATSAPP_CATALOG_ID." }, 503);
  try {
    const productos = await listarProductosCatalogo(env, env.WHATSAPP_CATALOG_ID);
    await guardarProductosEnCache(env.CRM_DB, env.WHATSAPP_CATALOG_ID, productos);
    return json({ products: productos });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function post({ request, env: envBase, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);
  // El catálogo es el del número de ese chat (lineas.catalog_id en otra línea).
  const env = await envDeConversacion(envBase, conversationId);

  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  )
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  const sentBy = agent?.displayName || agent?.username || null;
  // Después de cancelarSeguimientosDeLead: si no, se cancelaría el que se acaba de programar.
  const quickReplyId = Number(payload?.quick_reply_id) || null;
  const programarRapida = async () => {
    if (!quickReplyId) return;
    await programarSeguimientoDeRapida(env.CRM_DB, conversationId, quickReplyId).catch((err) => console.error("Seguimiento de rápida:", err.message));
    let varianteId = Number(payload?.variante_id) || 0;
    if (varianteId) {
      const v = await env.CRM_DB.prepare("SELECT 1 FROM variantes WHERE id = ? AND tipo = 'rapida' AND ref_id = ?").bind(varianteId, quickReplyId).first().catch(() => null);
      if (!v) varianteId = 0;
    }
    await registrarUso(env.CRM_DB, { tipo: "rapida", refId: quickReplyId, varianteId, conversationId, agente: sentBy, editada: Boolean(payload?.editada), aMano: Boolean(payload?.a_mano), textoEnviado: payload?.text || null });
  };
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

      const waMessageId = await mandarAlToque(env, conversationId, (e) => enviarProducto(e, conv.wa_id, e.WHATSAPP_CATALOG_ID, retailerId, payload?.text));
      await registrarMensajeSaliente(env.CRM_DB, conversationId, {
        waMessageId,
        type: "product",
        body: nombre || "Producto del catálogo",
        sentBy
      });
      await cancelarSeguimientosDeLead(env.CRM_DB, conversationId);
      await programarRapida();
      return json({ ok: true, wa_message_id: waMessageId });
    }

    // Portadas candidatas: productos en stock y con foto primero.
    let portadas = [];
    if (env.WHATSAPP_CATALOG_ID) {
      try {
        const productos = await listarProductosCatalogo(env, env.WHATSAPP_CATALOG_ID);
        const buenos = productos.filter((p) => p.image_url && (!p.availability || p.availability === "in stock"));
        portadas = [...buenos, ...productos].map((p) => p.retailer_id);
      } catch { /* si falla, se manda igual sin miniatura elegida a mano */ }
    }
    const waMessageId = await mandarAlToque(env, conversationId, (e) => enviarCatalogoConPortada(e, conv.wa_id, payload?.text, portadas));
    await registrarMensajeSaliente(env.CRM_DB, conversationId, {
      waMessageId,
      type: "catalog",
      body: "[Catálogo enviado]",
      sentBy
    });
    await cancelarSeguimientosDeLead(env.CRM_DB, conversationId);
    await programarRapida();
    return json({ ok: true, wa_message_id: waMessageId });
  } catch (err) {
    return json({ error: `WhatsApp rechazó el envío: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestGetProductos = conAuth(getProductos);
