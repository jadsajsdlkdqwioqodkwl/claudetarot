/**
 * GET /api/crm/conversations — bandeja de entrada: una fila por conversación,
 * con el contacto y el último mensaje, ordenadas por actividad reciente.
 * Filtros opcionales: ?mine=1 (solo las asignadas a quien pregunta)
 * &agente=Nombre (las de esa asesora, dueña o compartiendo)
 * &etiqueta=contact|lead|purchase &q=texto &dias=N (0 = todo) &offset=N
 * &producto=<id> (0 = sin producto) &linea=<id> (0 = el número principal)
 *
 * Búsqueda (&q): sin tildes ni mayúsculas, por palabras (todas tienen que
 * aparecer, cada una en cualquier lado): nombre, número (con o sin 51),
 * notas, clave Shalom, anuncio, asesora y el TEXTO de los mensajes (un DNI,
 * una dirección, "amuleto"…). Si coincidió en un mensaje, la fila trae ese
 * extracto en `coincidencia`. &dias limita a chats con actividad en los
 * últimos N días; &en=cliente busca solo en lo que escribió el cliente;
 * &limite=N trae hasta N (200 por defecto, máx. 2000) y &offset salta.
 * Ocultos y bloqueados no salen, salvo con &ocultos=1 (solo esos) o
 * buscando (&q), que los trae con su marca.
 * Con &chat=<id> trae además los últimos mensajes de ese chat (y lo marca
 * leído): el poll del CRM es un solo request en vez de dos — el plan gratis
 * de Workers tiene tope de requests por día.
 */

import { extraerFechas, limitesUtc } from "../../lib/busqueda-fechas.js";
import { conAuth, chatSoloLectura } from "../../lib/crm-auth.js";
import { leerMensajes } from "./messages.js";
import { ORIGEN_SEGUIMIENTO_AUTO, PREFIJO_SEGUIMIENTO_LEAD, PREFIJO_SUGERENCIA, PREFIJO_SEGUIMIENTO_RAPIDA, PREFIJO_PLAN_PLANTILLA } from "../../lib/crm-db.js";
import { ORIGEN_DIA7 } from "../../lib/rescate-lead.js";
import { PREFIJO_SEGUIMIENTO_PLANTILLA } from "../../lib/plantillas-seguimiento.js";

/** Minúsculas y sin tildes, en SQL (SQLite no trae unaccent y su lower() no toca las tildes). */
const TILDES = [["á", "a"], ["é", "e"], ["í", "i"], ["ó", "o"], ["ú", "u"], ["ü", "u"], ["ñ", "n"],
  ["Á", "a"], ["É", "e"], ["Í", "i"], ["Ó", "o"], ["Ú", "u"], ["Ü", "u"], ["Ñ", "n"]];
export function norm(col) {
  return TILDES.reduce((expr, [de, a]) => `replace(${expr}, '${de}', '${a}')`, `lower(COALESCE(${col}, ''))`);
}

/**
 * Qué mensajes cuentan al buscar: nunca los automáticos (la bienvenida y el
 * seguimiento dicen lo mismo en todos los chats y taparían todo); con
 * &en=cliente, solo lo que escribió el cliente.
 */
const FILTRO_MENSAJES = (soloCliente, t) => soloCliente
  ? `${t}.direction = 'in'`
  : `(${t}.direction = 'in' OR (COALESCE(${t}.sent_by, '') NOT IN ('Bienvenida automática', 'Seguimiento automático') AND COALESCE(${t}.sent_by, '') NOT LIKE 'Prueba de bienvenida%'))`;

/** Las palabras de la búsqueda, sin tildes; el número sin espacios ni "+". Hasta 5. */
export function tokensBusqueda(q) {
  const limpio = String(q || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/(\d)[\s.-]+(?=\d)/g, "$1").replace(/\+/g, "");
  return [...new Set(limpio.split(/[^a-z0-9@]+/).filter((t) => t.length >= 2))].slice(0, 5);
}

/* Cola «Atención pendiente»: chats con el último mensaje del cliente sin contestar (y sin «Atendido») o con una
   recomendación del asesor pendiente, incluidas las de chats con la ventana de 24 h ya cerrada (para evaluar
   una plantilla). Las recomendaciones que aún no subieron a la bandeja y tienen ventana abierta esperan su turno. */
const ATENCION_FALTA = `(lm.direction = 'in' AND (conv.atendido_at IS NULL OR conv.atendido_at < conv.last_inbound_at))`;
const ATENCION_REC = `EXISTS (SELECT 1 FROM asesor_sugerencias sg WHERE sg.conversation_id = conv.id AND sg.estado = 'pendiente'
                AND sg.tipo = 'seguimiento' AND (sg.reflotada_at IS NOT NULL OR conv.last_inbound_at IS NULL OR conv.last_inbound_at < datetime('now', '-24 hours')))`;

// En la cola, «Falta respuesta» solo cuenta si el mensaje del cliente es de los últimos 3 días: los chats viejos
// sin contestar (leads perdidos) la llenarían de ruido; siguen con su etiqueta en la lista normal.
const ATENCION_COLA = `((${ATENCION_FALTA} AND conv.last_inbound_at >= datetime('now', '-3 days')) OR ${ATENCION_REC})`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function handler({ request, env, agent }) {
  const url = new URL(request.url);
  const soloMias = url.searchParams.get("mine") === "1";
  const q = url.searchParams.get("q");
  const chatId = Number(url.searchParams.get("chat")) || null;
  const etiqueta = ["contact", "lead", "purchase"].includes(url.searchParams.get("etiqueta")) ? url.searchParams.get("etiqueta") : null;
  const agente = soloMias ? agent?.displayName || agent?.username || "" : (url.searchParams.get("agente") || "").trim();

  const condiciones = [];
  const params = [];
  if (soloMias || agente) {
    // Los que el chat tiene asignados como dueño o compartiendo (uno por línea en shared_with).
    condiciones.push("(conv.assigned_agent = ? OR (? <> '' AND instr(char(10) || COALESCE(conv.shared_with, '') || char(10), char(10) || ? || char(10)) > 0))");
    params.push(agente, agente, agente);
  }
  if (etiqueta) {
    condiciones.push("instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ?) > 0");
    params.push(` ${etiqueta} `);
  }
  if (agent?.productoId) { // cuenta limitada a un producto (más, si lo tiene, el que solo puede leer)
    const ids = [agent.productoId, agent.productoLecturaId].filter(Boolean);
    condiciones.push(`conv.producto_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }
  const producto = url.searchParams.get("producto");
  if (producto !== null && producto !== "") {
    if (Number(producto)) { condiciones.push("conv.producto_id = ?"); params.push(Number(producto)); }
    else condiciones.push("conv.producto_id IS NULL");
  }
  const linea = url.searchParams.get("linea");
  if (linea !== null && linea !== "") {
    if (Number(linea)) { condiciones.push("conv.linea_id = ?"); params.push(Number(linea)); }
    else condiciones.push("conv.linea_id IS NULL");
  }
  if (url.searchParams.get("atencion") === "1") condiciones.push(ATENCION_COLA);
  if (url.searchParams.get("olva") === "1") condiciones.push("c.olva = 1"); // los chats marcados «Envío por Olva»
  if (url.searchParams.get("provincia") === "1") condiciones.push("(c.olva = 1 OR (c.saldo IS NOT NULL AND c.saldo <> '') OR c.shalom_code IS NOT NULL)");
  const compraFecha = url.searchParams.get("compra_fecha");
  if (compraFecha && /^\d{4}-\d{2}-\d{2}$/.test(compraFecha)) {
    condiciones.push("conv.id IN (SELECT e.conversation_id FROM capi_events e WHERE e.event_name = 'Purchase' AND date(e.created_at) = ?)");
    params.push(compraFecha);
  }
  const dias = Math.max(0, Math.min(Number(url.searchParams.get("dias")) || 0, 3650));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  // Cuántos traer: 200 por defecto; "Cargar más" en el CRM sube de a 200 (hasta 2000).
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 200, 50), 2000);
  const soloCliente = url.searchParams.get("en") === "cliente";
  if (dias) {
    condiciones.push("conv.last_message_at >= datetime('now', ?)");
    params.push(`-${dias} days`);
  }
  // Fechas en el buscador: «venta del 15/10», «ayer», «10/10 al 12/10» (ver busqueda-fechas.js).
  const fechas = extraerFechas(q);
  if (fechas.desde) {
    const [ini, fin] = limitesUtc(fechas.desde, fechas.hasta);
    if (fechas.tipo === "compra") {
      condiciones.push("conv.id IN (SELECT e.conversation_id FROM capi_events e WHERE e.event_name = 'Purchase' AND e.created_at >= ? AND e.created_at < ?)");
    } else {
      condiciones.push("conv.last_message_at >= ? AND conv.id IN (SELECT m.conversation_id FROM messages m WHERE m.created_at >= ? AND m.created_at < ?)");
      params.push(ini);
    }
    params.push(ini, fin);
  }
  const tokens = tokensBusqueda(fechas.desde ? fechas.resto : q);
  if (url.searchParams.get("ocultos") === "1") condiciones.push("(conv.hidden = 1 OR conv.blocked = 1)");
  else if (!tokens.length) condiciones.push("conv.hidden = 0 AND conv.blocked = 0");
  for (const t of tokens) {
    const tel = /^\d{4,}$/.test(t) ? (t.length === 11 && t.startsWith("51") ? t.slice(2) : t) : null;
    condiciones.push(`(
      ${norm("c.profile_name")} LIKE ? OR ${norm("c.name")} LIKE ? OR ${norm("c.notes")} LIKE ?
      OR ${norm("c.ad_headline")} LIKE ? OR ${norm("conv.assigned_agent")} LIKE ?
      OR COALESCE(c.shalom_code, '') LIKE ? ${tel ? "OR c.wa_id LIKE ?" : ""}
      OR conv.id IN (SELECT m.conversation_id FROM messages m WHERE ${norm("m.body")} LIKE ? AND ${FILTRO_MENSAJES(soloCliente, "m")})
    )`);
    const like = `%${t}%`;
    params.push(like, like, like, like, like, like, ...(tel ? [`%${tel}%`] : []), like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  // Para mostrar dónde coincidió: el mensaje más reciente con la palabra más larga.
  const clave = [...tokens].sort((a, b) => b.length - a.length)[0] || null;

  // Primero el chat (marca leído), así la lista ya sale con su unread_count en 0.
  const chat = chatId ? await leerMensajes(env, chatId, null, { marcarLeido: !await chatSoloLectura(env, agent, chatId) }) : null;

  // Exclusiones para seg_pendientes/proximo — misma lógica que esSeguimientoManual en app.js.
  const SEG_EXCL = [
    ORIGEN_SEGUIMIENTO_AUTO,
    `${PREFIJO_SEGUIMIENTO_LEAD}%`,
    `${PREFIJO_SUGERENCIA}%`,
    `${PREFIJO_SEGUIMIENTO_RAPIDA}%`,
    `${PREFIJO_PLAN_PLANTILLA}%`,
    `${PREFIJO_SEGUIMIENTO_PLANTILLA}%`,
    `%${ORIGEN_DIA7}`,
  ];

  const { results } = await env.CRM_DB.prepare(
    `SELECT
        conv.id AS conversation_id,
        conv.status,
        conv.unread_count,
        conv.assigned_agent,
        conv.shared_with,
        conv.meta_tags,
        conv.last_message_at,
        conv.last_inbound_at,
        conv.hidden,
        conv.linea_id,
        conv.producto_id,
        conv.producto_origen,
        conv.blocked,
        conv.pausa_auto,
        conv.atendido_at,
        ${ATENCION_FALTA} AS falta_respuesta,
        c.olva,
        c.saldo,
        c.id AS contact_id,
        c.wa_id,
        c.profile_name,
        c.ctwa_clid,
        c.ad_source_type,
        c.ad_headline,
        c.notes,
        c.shalom_code,
        c.name AS contact_name,
        (SELECT MAX(e.created_at) FROM capi_events e WHERE e.conversation_id = conv.id AND e.event_name = 'Purchase') AS compra_at,
        ${clave ? `(SELECT substr(m2.body, 1, 200) FROM messages m2 WHERE m2.conversation_id = conv.id AND ${norm("m2.body")} LIKE ? AND ${FILTRO_MENSAJES(soloCliente, "m2")} ORDER BY m2.id DESC LIMIT 1)` : "NULL"} AS coincidencia,
        lm.body AS last_body,
        lm.type AS last_type,
        lm.direction AS last_direction,
        ${ATENCION_REC} AS con_recomendacion,
        EXISTS (SELECT 1 FROM scheduled_messages sc WHERE sc.conversation_id = conv.id AND sc.status IN ('pendiente', 'por_aprobar')
                AND sc.created_by LIKE 'Plan con plantilla · Recojo en%') AS cobro_activo,
        seg.pendientes AS seg_pendientes,
        seg.proximo AS seg_proximo,
        seg.auto_proximo AS seg_auto_proximo
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     -- Seguimientos pendientes para las etiquetas de la lista: los manuales
     -- (ni envío masivo ni la secuencia de leads) y, aparte, la hora del
     -- próximo seguimiento automático de bienvenida del lead nuevo. Una sola
     -- pasada por los pendientes (índice status, send_at).
     LEFT JOIN (
       SELECT conversation_id,
         SUM(
           COALESCE(created_by, '') <> ? AND COALESCE(created_by, '') NOT LIKE ?
           AND COALESCE(created_by, '') NOT LIKE ? AND COALESCE(created_by, '') NOT LIKE ?
           AND COALESCE(created_by, '') NOT LIKE ? AND COALESCE(created_by, '') NOT LIKE ?
           AND COALESCE(created_by, '') NOT LIKE ?
         ) AS pendientes,
         MIN(CASE WHEN
           COALESCE(created_by, '') <> ? AND COALESCE(created_by, '') NOT LIKE ?
           AND COALESCE(created_by, '') NOT LIKE ? AND COALESCE(created_by, '') NOT LIKE ?
           AND COALESCE(created_by, '') NOT LIKE ? AND COALESCE(created_by, '') NOT LIKE ?
           AND COALESCE(created_by, '') NOT LIKE ?
         THEN send_at END) AS proximo,
         MIN(CASE WHEN created_by = ? THEN send_at END) AS auto_proximo
       FROM scheduled_messages
       WHERE status = 'pendiente' AND batch_id IS NULL
       GROUP BY conversation_id
     ) seg ON seg.conversation_id = conv.id
     -- Un solo salto al último mensaje (índice conversation_id, id) en vez de
     -- 3 subconsultas que recorrían todo el historial de cada chat.
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = conv.id)
     ${where}
     ORDER BY conv.last_message_at DESC NULLS LAST, conv.id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...(clave ? [`%${clave}%`] : []), ...SEG_EXCL, ...SEG_EXCL, ORIGEN_SEGUIMIENTO_AUTO, ...params, limite + 1, offset)
    .all();

  // Cuántos hay en la cola (con las restricciones de la cuenta, sin los filtros de la lista).
  const restr = [];
  const rp = [];
  if (agent?.productoId) {
    const ids = [agent.productoId, agent.productoLecturaId].filter(Boolean);
    restr.push(`conv.producto_id IN (${ids.map(() => "?").join(",")})`);
    rp.push(...ids);
  }
  const { n: atencionTotal } = await env.CRM_DB.prepare(
    `SELECT COUNT(*) AS n FROM conversations conv
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = conv.id)
     WHERE conv.hidden = 0 AND conv.blocked = 0 AND ${ATENCION_COLA} ${restr.map((r) => `AND ${r}`).join(" ")}`
  ).bind(...rp).first();

  const hayMas = results.length > limite;
  const conversations = hayMas ? results.slice(0, limite) : results;
  return json(chat
    ? { conversations, hay_mas: hayMas, atencion_total: atencionTotal, busqueda_fecha: fechas.desde ? { tipo: fechas.tipo, desde: fechas.desde, hasta: fechas.hasta } : null, chat: { conversation_id: chatId, ...chat } }
    : { conversations, hay_mas: hayMas, atencion_total: atencionTotal, busqueda_fecha: fechas.desde ? { tipo: fechas.tipo, desde: fechas.desde, hasta: fechas.hasta } : null });
}

export const onRequestGet = conAuth(handler);
