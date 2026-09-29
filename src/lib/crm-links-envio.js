/**
 * Link de seguimiento automático: a cada venta nueva de la pestaña Ventas
 * (con código TS-…) le sale sola su página, 23 h después del último mensaje
 * del cliente, dentro de su ventana de 24 h (gratis y sin plantilla). Para
 * entonces el pedido ya salió y la boleta suele estar subida; si no, aparece
 * después en el mismo link sin escribirle.
 *
 * Cómo:
 *   · cron de 15 min: lee la hoja una vez, toma las ventas de los últimos 2
 *     días que aún no tienen link programado, busca su chat por el celular y
 *     programa un seguimiento (scheduled_messages) con `mandar_siempre`;
 *   · si el cliente vuelve a escribir, el webhook corre el envío a 23 h de ese
 *     último mensaje (reprogramarLinkDeEnvio);
 *   · el texto es la respuesta rápida "Link de envío" (grupo Automáticos):
 *     la editan el admin y las vendedoras como cualquier otra, y se lee al
 *     momento de mandar. {link} y {nombre} se rellenan solos. Borrarla apaga
 *     el envío automático.
 *   · tabla envio_links: un registro por código, así nunca se programa dos
 *     veces (estado programado | enviado | sin_ventana).
 *
 * No es IA: es un aviso de sistema que sale por una acción del equipo
 * (registrar la venta).
 */

import { getValues } from "./google-sheets.js";
import { hojaVentas } from "./ventas-hoja.js";
import { RANGO_DATOS_VENTA, indiceVenta, telefonoDe, esCodigo, fechaSuelta } from "./ventas.js";
import { ORIGEN_LINK_ENVIO } from "./crm-db.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";
const DIAS_ATRAS = 2;
const MAX_POR_PASADA = 40;
const CERRADOS = new Set(["Pagado", "Cancelado"]);

export const TEXTO_LINK_POR_DEFECTO =
  "Hola estimad@ ☺️ su Kit Tarot ya está en camino 🚚 En este link va a ver su boleta y en qué va su envío 👉 {link}\n\n" +
  "Cuando le llegue, empiece por el manual: le enseña paso a paso a hacer su primera tirada, y cada carta ya trae su significado impreso, así que puede leer desde el primer día ✨";

/**
 * La respuesta rápida que da el texto. La crea la primera vez; si alguien la
 * borró después, devuelve null (= automático apagado) y no la vuelve a crear.
 */
export async function rapidaDelLink(db) {
  const guardado = await db.prepare("SELECT value FROM crm_settings WHERE key = 'rapida_link_envio_id'").first();
  if (guardado?.value) {
    const q = await db.prepare("SELECT id, body FROM quick_replies WHERE id = ?").bind(Number(guardado.value)).first();
    return q?.body ? q : null;
  }
  const creada = await db.prepare(
    "INSERT INTO quick_replies (title, body, grupo, sort_order) VALUES ('Link de envío (sale solo)', ?, 'Automáticos', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quick_replies)) RETURNING id, body"
  ).bind(TEXTO_LINK_POR_DEFECTO).first();
  await db.prepare("INSERT INTO crm_settings (key, value) VALUES ('rapida_link_envio_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(String(creada.id)).run();
  return creada;
}

/** Cuándo mandarlo: 23 h después del último mensaje del cliente; null si la ventana ya no alcanza. */
export function momentoDelLink(ultimoEntrante, ahora = Date.now()) {
  if (!ultimoEntrante) return null;
  const ultimo = new Date(String(ultimoEntrante).replace(" ", "T") + (String(ultimoEntrante).includes("Z") ? "" : "Z")).getTime();
  if (Number.isNaN(ultimo)) return null;
  const cierra = ultimo + 24 * 3600 * 1000;
  if (cierra - ahora < 15 * 60 * 1000) return null; // menos de 15 min de ventana: ya no
  return Math.max(ultimo + 23 * 3600 * 1000, ahora + 60 * 1000);
}

export async function programarLinksDeEnvio(env) {
  const db = env.CRM_DB;
  if (!db || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_SHEET_ID) return;
  const rapida = await rapidaDelLink(db);
  if (!rapida) return;

  const filas = await getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`);
  const i = (n) => indiceVenta(n);
  const desde = Date.now() - DIAS_ATRAS * 86400000;
  const candidatas = [];
  for (const f of filas) {
    const codigo = String(f[i("Código")] || "").trim().toUpperCase();
    if (!esCodigo(codigo) || CERRADOS.has(String(f[i("Estado")] || "").trim())) continue;
    const fecha = fechaSuelta(f[i("Fecha")]);
    if (!fecha || fecha.getTime() < desde) continue;
    const cel = telefonoDe(String(f[i("DNI / WSP")] || ""));
    if (cel) candidatas.push({ codigo, cel: cel.slice(-9) });
  }
  if (!candidatas.length) return;
  const lote = candidatas.slice(-MAX_POR_PASADA);

  // Una consulta para saber cuáles ya tienen link y otra para sus chats (D1: tope de 100 parámetros).
  const ya = await db.prepare(
    `SELECT codigo FROM envio_links WHERE codigo IN (${lote.map(() => "?").join(",")})`
  ).bind(...lote.map((c) => c.codigo)).all();
  const hechos = new Set(ya.results.map((r) => r.codigo));
  const nuevas = lote.filter((c) => !hechos.has(c.codigo));
  if (!nuevas.length) return;
  const { results: chats } = await db.prepare(
    `SELECT conv.id, conv.last_inbound_at, substr(c.wa_id, -9) AS cel, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id
     WHERE substr(c.wa_id, -9) IN (${nuevas.map(() => "?").join(",")})
     ORDER BY conv.last_message_at DESC`
  ).bind(...nuevas.map((c) => c.cel)).all();
  const chatDe = {};
  for (const ch of chats) chatDe[ch.cel] ||= ch;

  const registros = [];
  for (const c of nuevas) {
    const chat = chatDe[c.cel];
    if (!chat) continue; // sin chat todavía: se reintenta en la próxima pasada (mientras la venta tenga < 2 días)
    const cuando = momentoDelLink(chat.last_inbound_at);
    if (!cuando) {
      registros.push(db.prepare("INSERT OR IGNORE INTO envio_links (codigo, conversation_id, estado) VALUES (?, ?, 'sin_ventana')").bind(c.codigo, chat.id));
      continue;
    }
    const datos = JSON.stringify({ link: `${SITIO}/${c.codigo}`, nombre: String(chat.nombre || "").split(/\s+/)[0] || "" });
    // Juntos en el mismo batch (D1 lo corre como una transacción): o quedan
    // el mensaje y su registro, o ninguno. Así nunca se programa dos veces.
    registros.push(
      db.prepare(
        `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, quick_reply_id, template_params, mandar_siempre)
         VALUES (?, NULL, ?, ?, ?, ?, 1)`
      ).bind(chat.id, new Date(cuando).toISOString(), ORIGEN_LINK_ENVIO, rapida.id, datos),
      db.prepare(
        `INSERT INTO envio_links (codigo, conversation_id, scheduled_id, estado)
         VALUES (?, ?, (SELECT MAX(id) FROM scheduled_messages WHERE conversation_id = ? AND created_by = ?), 'programado')`
      ).bind(c.codigo, chat.id, chat.id, ORIGEN_LINK_ENVIO)
    );
  }
  if (registros.length) await db.batch(registros);
}

/** El cliente volvió a escribir: el link sale 23 h después de ESTE mensaje. */
export async function reprogramarLinkDeEnvio(db, conversationId) {
  await db.prepare(
    `UPDATE scheduled_messages SET send_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+23 hours')
     WHERE conversation_id = ? AND status = 'pendiente' AND created_by = ?`
  ).bind(conversationId, ORIGEN_LINK_ENVIO).run();
}
