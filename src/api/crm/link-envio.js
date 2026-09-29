/**
 * 🔗 Link de seguimiento del pedido, desde el panel derecho del chat.
 *
 * GET  /api/crm/link-envio?conversation_id=N → { codigo, link, texto, ventana_abierta }
 *      Busca la venta abierta de ese cliente en la pestaña Ventas por su
 *      celular y arma el texto con la respuesta rápida "Link de envío".
 * POST /api/crm/link-envio { conversation_id, codigo, texto }
 *      Lo manda en ese momento ("escribiendo…" 1,5 s antes, como todo).
 *
 * Nada sale solo: una persona abre el chat, lee, revisa el texto y lo manda.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { getValues } from "../../lib/google-sheets.js";
import { RANGO_DATOS_VENTA, indiceVenta } from "../../lib/ventas.js";
import { hojaVentas } from "../../lib/ventas-hoja.js";
import { buscarFila } from "../asesor-ventas.js";
import { fueraDeVentana } from "./scheduled.js";
import { mandarTexto, pausaEnvio } from "../../lib/crm-send.js";
import { rapidaDelLink, textoDelLink } from "../../lib/crm-links-envio.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function chatPorId(env, id) {
  return env.CRM_DB.prepare(
    `SELECT conv.id, c.wa_id, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  ).bind(id).first();
}

async function get({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get("conversation_id"));
  if (!id) return json({ error: "Falta conversation_id." }, 400);
  const chat = await chatPorId(env, id);
  if (!chat) return json({ error: "No encontré el chat." }, 404);
  if (!env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_SHEET_ID) return json({ error: "La hoja Ventas no está conectada." }, 503);
  const filas = await getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`);
  const hallada = buscarFila(filas, { dni: String(chat.wa_id).slice(-9) });
  if (!hallada) return json({ error: "No encontré una venta abierta con el celular de este cliente en la pestaña Ventas." }, 404);
  const codigo = String(hallada.valores[indiceVenta("Código")] || "").trim().toUpperCase();
  const link = `${SITIO}/${codigo}`;
  const rapida = await rapidaDelLink(env.CRM_DB).catch(() => null);
  return json({
    codigo,
    link,
    texto: textoDelLink(rapida?.body, { link, nombre: String(chat.nombre || "").split(/\s+/)[0] }),
    ventana_abierta: !(await fueraDeVentana(env.CRM_DB, id, new Date()))
  });
}

async function post({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  const id = Number(p?.conversation_id);
  const codigo = String(p?.codigo || "").trim().toUpperCase();
  const texto = String(p?.texto || "").trim().slice(0, 4096);
  if (!id || !texto) return json({ error: "Falta el chat o el texto." }, 400);
  const chat = await chatPorId(env, id);
  if (!chat) return json({ error: "No encontré el chat." }, 404);
  const error = await fueraDeVentana(env.CRM_DB, id, new Date());
  if (error) return json({ error }, 409);
  const quien = agent?.displayName || agent?.username || "CRM";
  // ⚠️ "escribiendo…" 1,5 s antes de todo mensaje (regla del dueño, ver crm-send.js).
  await pausaEnvio(env, id);
  await mandarTexto(env, id, chat.wa_id, texto, quien);
  if (/^TS-/.test(codigo)) {
    await env.CRM_DB.prepare(
      `INSERT INTO envio_links (codigo, conversation_id, estado, actualizado_at) VALUES (?, ?, 'enviado', datetime('now'))
       ON CONFLICT(codigo) DO UPDATE SET estado = 'enviado', actualizado_at = datetime('now')`
    ).bind(codigo, id).run().catch(() => {});
  }
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
