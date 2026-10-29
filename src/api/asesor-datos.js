/**
 * Datos para las Routines del asesor, directo de D1 (sin pasar por la hoja
 * de Google ni por Drive). Todo con la cabecera x-asesor-clave.
 *
 * GET  /api/asesor/chats?dias=3[&activos_horas=6]
 *      Los mensajes de los últimos `dias` días (hora de Lima), con las mismas
 *      columnas que la hoja de chats. Con `activos_horas`, solo los chats que
 *      tuvieron algún mensaje en esas últimas horas (pero con su historial
 *      completo de esos días), para las corridas que solo miran lo nuevo.
 *      Con `promesas_dias=21` agrega `promesas`: los mensajes de esos días (de
 *      esos mismos chats, automáticos incluidos) que hablan de collar, regalo,
 *      mazo, oráculo, kits, yapa o gratis. El collar del toque del día 7 se
 *      promete antes de la ventana que se lee y el que empaca debe saberlo
 *      (scripts/asesor/promesas.py filtra las promesas de verdad). Sin
 *      `activos_horas`, de todos los chats con mensajes en esos días; con
 *      `solo_promesas=1` no trae `filas`.
 *
 * GET  /api/asesor/control-ventas?fecha=AAAA-MM-DD   (día de Lima; hoy por defecto)
 *      El control que NO depende de que una Routine lea bien: todo lo que el
 *      sistema ya sabe de ventas ese día, de TODAS las líneas de WhatsApp.
 *      `compras` (eventos Purchase del CRM, con su asesora), `pedidos_web`,
 *      `pedidos_catalogo`, `compra_otro_dia` (chats con etiqueta purchase y
 *      actividad hoy, pero cuya compra es de otro día) y `lineas` (chats
 *      activos por número). enviar.py lo cuadra contra el reporte de ventas:
 *      no sale el PDF si queda un candidato sin explicar.
 *
 * POST /api/asesor/memoria
 *      { fuente, agregar: [{ tema, nota }], retirar: [id] }
 *      Lo que el bot aprende y quiere recordar la próxima vez. Se lee en
 *      /api/asesor/contexto junto con el aprendizaje medido (aprendizaje()).
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { servirMensaje } from "./crm/media.js";
import { descargarMedia } from "../lib/whatsapp.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const LIMA_MS = 5 * 3600 * 1000;
const sqlFecha = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const aLima = (utc) => sqlFecha(new Date(new Date(utc.replace(" ", "T") + "Z").getTime() - LIMA_MS));

async function puerta(request, env) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB) return json({ error: "Falta la base del CRM." }, 503);
  return null;
}

export async function onRequestGetChats({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const url = new URL(request.url);
  const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 3, 1), 14);
  const activosHoras = Number(url.searchParams.get("activos_horas")) || 0;

  // Desde las 00:00 de Lima de hace (dias - 1) días.
  const hoyLima = new Date(Date.now() - LIMA_MS);
  hoyLima.setUTCHours(0, 0, 0, 0);
  const desde = new Date(hoyLima.getTime() - (dias - 1) * 86400000 + LIMA_MS);
  const activosDesde = activosHoras > 0 ? new Date(Date.now() - activosHoras * 3600000) : desde;

  const promesasDias = Math.min(Math.max(Number(url.searchParams.get("promesas_dias")) || 0, 0), 60);
  const soloPromesas = promesasDias > 0 && url.searchParams.get("solo_promesas") === "1";
  // Varios números (src/lib/lineas.js): por defecto solo Tarot Store (la
  // línea principal), así un mismo cliente en dos números no se mezcla.
  // &linea=<id> lee otro número.
  const lineaId = Number(url.searchParams.get("linea")) || 0;
  const filtroLinea = lineaId ? `conv.linea_id = ${lineaId}` : "conv.linea_id IS NULL";

  const { results } = soloPromesas ? { results: [] } : await env.CRM_DB.prepare(
    `SELECT m.id AS msg_id, m.created_at, m.direction, m.type, m.body, m.file_name, m.sent_by,
            c.wa_id, c.profile_name, c.name AS contact_name, c.ad_headline,
            conv.assigned_agent, conv.meta_tags, pr.nombre AS producto
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     LEFT JOIN productos pr ON pr.id = conv.producto_id
     JOIN messages m ON m.conversation_id = conv.id AND m.created_at >= ?
     WHERE conv.last_message_at >= ? AND ${filtroLinea}
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT 30000`
  )
    .bind(sqlFecha(desde), sqlFecha(activosDesde > desde ? activosDesde : desde))
    .all();

  const aFila = (m) => ({
    id: m.msg_id || 0,
    t: aLima(m.created_at),
    wa: m.wa_id,
    nombre: m.contact_name || m.profile_name || "",
    quien: m.direction === "in" ? "Cliente" : "Vendedor",
    vend: m.sent_by || "",
    tipo: m.type || "text",
    // En fotos, videos y archivos el cuerpo es el pie de foto; el nombre del
    // archivo ("WhatsApp Image 2026-…jpeg") solo mete ruido: se lee como [image].
    msg: (m.body || (m.type === "document" ? m.file_name : "") || "").slice(0, 2000),
    anuncio: m.ad_headline || "",
    producto: m.producto || "",
    asesora: m.assigned_agent || "",
    embudo: m.meta_tags || ""
  });
  const filas = results.map(aFila);

  if (!promesasDias) return json({ desde: aLima(sqlFecha(desde)), filas });
  const promesasDesde = new Date(Date.now() - promesasDias * 86400000);
  const { results: prom } = await env.CRM_DB.prepare(
    `SELECT m.created_at, m.direction, m.type, m.body, m.file_name, m.sent_by,
            c.wa_id, c.profile_name, c.name AS contact_name, c.ad_headline,
            conv.assigned_agent, conv.meta_tags, pr.nombre AS producto
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     LEFT JOIN productos pr ON pr.id = conv.producto_id
     JOIN messages m ON m.conversation_id = conv.id AND m.created_at >= ?
     WHERE conv.last_message_at >= ? AND ${filtroLinea}
       AND COALESCE(m.sent_by, '') NOT LIKE '%ienvenida%'
       AND (m.body LIKE '%collar%' OR m.body LIKE '%regal%' OR m.body LIKE '%obsequ%' OR m.body LIKE '%yap%'
            OR m.body LIKE '%mazo%' OR m.body LIKE '%culo%' OR m.body LIKE '%kits%' OR m.body LIKE '%gratis%'
            OR m.body LIKE '%adicional%' OR m.body LIKE '%extra%' OR m.body LIKE '%agreg%' OR m.body LIKE '%inclu%')
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 5000`
  )
    .bind(sqlFecha(promesasDesde), sqlFecha(activosHoras > 0 ? activosDesde : promesasDesde))
    .all();
  return json({ desde: aLima(sqlFecha(desde)), filas, promesas: prom.reverse().map(aFila) });
}

export async function onRequestGetControlVentas({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const url = new URL(request.url);
  const hoyLima = sqlFecha(new Date(Date.now() - LIMA_MS)).slice(0, 10);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("fecha") || "") ? url.searchParams.get("fecha") : hoyLima;
  // Día de Lima = de las 05:00 UTC de esa fecha a las 05:00 UTC de la siguiente.
  const ini = new Date(`${fecha}T00:00:00Z`).getTime() + LIMA_MS;
  const desde = sqlFecha(new Date(ini));
  const hasta = sqlFecha(new Date(ini + 86400000));

  const compras = await env.CRM_DB.prepare(
    `SELECT e.id, e.created_at, e.value, e.currency, e.status, e.mode, e.created_by, e.product_label,
            c.wa_id, COALESCE(c.name, c.profile_name, '') AS nombre, conv.assigned_agent, conv.linea_id
     FROM capi_events e
     JOIN conversations conv ON conv.id = e.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     WHERE e.event_name = 'Purchase' AND e.created_at >= ? AND e.created_at < ?
     ORDER BY e.created_at`
  ).bind(desde, hasta).all();
  const web = await env.CRM_DB.prepare(
    `SELECT created_at, wa_id, nombre, destino, total, etiqueta FROM pedidos_web
     WHERE created_at >= ? AND created_at < ? ORDER BY created_at`
  ).bind(desde, hasta).all();
  const catalogo = await env.CRM_DB.prepare(
    `SELECT o.created_at, o.total_amount, c.wa_id, conv.assigned_agent, conv.linea_id
     FROM catalog_orders o
     JOIN conversations conv ON conv.id = o.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     WHERE o.created_at >= ? AND o.created_at < ? ORDER BY o.created_at`
  ).bind(desde, hasta).all();
  const otroDia = await env.CRM_DB.prepare(
    `SELECT c.wa_id, COALESCE(c.name, c.profile_name, '') AS nombre, conv.assigned_agent, conv.linea_id,
            (SELECT max(e.created_at) FROM capi_events e WHERE e.conversation_id = conv.id AND e.event_name = 'Purchase') AS ultima_compra
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     WHERE conv.last_message_at >= ? AND conv.last_message_at < ?
       AND instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ' purchase ') > 0
       AND NOT EXISTS (SELECT 1 FROM capi_events e WHERE e.conversation_id = conv.id AND e.event_name = 'Purchase'
                       AND e.created_at >= ? AND e.created_at < ?)`
  ).bind(desde, hasta, desde, hasta).all();
  const lineas = await env.CRM_DB.prepare(
    `SELECT COALESCE(linea_id, 0) AS linea, count(*) AS chats_activos FROM conversations
     WHERE last_message_at >= ? AND last_message_at < ? GROUP BY 1`
  ).bind(desde, hasta).all();

  const lima = (r) => ({ ...r, created_at: r.created_at ? aLima(r.created_at) : r.created_at, ultima_compra: r.ultima_compra ? aLima(r.ultima_compra) : r.ultima_compra });
  return json({
    fecha,
    compras: compras.results.map(lima),
    pedidos_web: web.results.map(lima),
    pedidos_catalogo: catalogo.results.map(lima),
    compra_otro_dia: otroDia.results.map(lima),
    lineas: lineas.results
  });
}

/**
 * GET /api/asesor/imagen?id=<id de mensaje>   (x-asesor-clave)
 *      La foto de un mensaje del cliente (captura de Yape, DNI, ubicación…). La
 *      Routine de ventas la mira para confirmar monto, fecha y nombre; mismas
 *      reglas que /api/crm/media (la primera vez la baja de WhatsApp y la guarda).
 */
export async function onRequestGetImagen({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const url = new URL(request.url);
  // staging_id: descarga directamente de Meta por media_id del dueño (boletas).
  const stagingId = Number(url.searchParams.get("staging_id"));
  if (stagingId) {
    const item = await env.CRM_DB.prepare("SELECT media_id, media_mime FROM boletas_staging WHERE id = ?").bind(stagingId).first();
    if (!item?.media_id) return json({ error: "No encontré esa foto en staging." }, 404);
    let blob, mime;
    try {
      ({ blob, mime } = await descargarMedia(env, item.media_id));
    } catch (err) {
      return json({ error: "No se pudo descargar la boleta." }, 502);
    }
    return new Response(blob, { headers: { "Content-Type": mime || item.media_mime || "image/jpeg", "Cache-Control": "no-store" } });
  }
  const id = Number(url.searchParams.get("id"));
  if (!id || !env.CRM_MEDIA) return json({ error: "Falta id o el almacenamiento." }, 400);
  const row = await env.CRM_DB.prepare("SELECT type, direction FROM messages WHERE id = ?").bind(id).first();
  // Solo lo que mandó el cliente y solo imágenes: nada del equipo ni videos.
  if (!row || row.direction !== "in" || row.type !== "image") return json({ error: "No es una imagen del cliente." }, 404);
  return servirMensaje(env, id);
}

/**
 * GET/PUT /api/asesor/ventas-estado?fecha=AAAA-MM-DD   (x-asesor-clave)
 *      Lo último que se reportó de las ventas de ese día (el salida.json ya
 *      fusionado) y hasta qué hora se leyeron los chats (`corte`). Cada corrida
 *      de la noche lee solo lo que pasó después del corte y suma a esto: así las
 *      de las 23:00 y 00:00 no releen el día entero. Lo escribe enviar.py al
 *      mandar bien el reporte, nunca la Routine a mano.
 *      Con `&tipo=pedidos` es lo mismo para el reporte de PEDIDOS (10:30, 11:30,
 *      16:30, 22:30) de esa fecha de despacho: lo último reportado, el historial
 *      de corridas y los pedidos agendados para ese día desde otros días.
 */
export async function onRequestVentasEstado({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  if (!env.CRM_MEDIA) return json({ error: "Falta el almacenamiento." }, 503);
  const url = new URL(request.url);
  const fecha = url.searchParams.get("fecha") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "fecha inválida." }, 400);
  const tipo = url.searchParams.get("tipo") === "pedidos" ? "pedidos" : "ventas";
  const key = `${tipo}-estado/${fecha}.json`;
  if (request.method === "PUT") {
    const cuerpo = await request.text();
    if (cuerpo.length > 2_000_000) return json({ error: "Demasiado grande." }, 413);
    try { JSON.parse(cuerpo); } catch { return json({ error: "JSON inválido." }, 400); }
    await env.CRM_MEDIA.put(key, cuerpo, { httpMetadata: { contentType: "application/json" } });
    return json({ ok: true, tipo });
  }
  const obj = await env.CRM_MEDIA.get(key);
  if (!obj) return json({ existe: false, tipo });
  return json({ existe: true, tipo, estado: JSON.parse(await obj.text()) });
}

export async function onRequestPostMemoria({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const payload = await request.json().catch(() => null);
  const fuente = String(payload?.fuente || "asesor").slice(0, 80);
  let agregadas = 0;
  let retiradas = 0;
  for (const n of (Array.isArray(payload?.agregar) ? payload.agregar : []).slice(0, 10)) {
    const tema = String(n?.tema || "").trim().slice(0, 60);
    const nota = String(n?.nota || "").trim().slice(0, 600);
    if (!tema || !nota) continue;
    await env.CRM_DB.prepare("INSERT INTO asesor_memoria (tema, nota, fuente) VALUES (?, ?, ?)").bind(tema, nota, fuente).run();
    agregadas++;
  }
  for (const id of (Array.isArray(payload?.retirar) ? payload.retirar : []).slice(0, 20)) {
    const r = await env.CRM_DB.prepare("UPDATE asesor_memoria SET activa = 0, retirada_at = datetime('now') WHERE id = ? AND activa = 1")
      .bind(Number(id))
      .run();
    retiradas += r.meta?.changes || 0;
  }
  return json({ agregadas, retiradas });
}

/**
 * Lo que el bot puede aprender de cómo le fue, sin que nadie edite nada:
 * qué se aprobó y qué se descartó, cómo corrigieron las personas sus textos,
 * y si el cliente respondió o compró después de que salió el mensaje.
 */
export async function aprendizaje(env) {
  const [porOrigen, ediciones, descartadas, resultados, memoria] = await Promise.all([
    env.CRM_DB.prepare(
      `SELECT COALESCE(origen, '?') AS origen, tipo, estado, COUNT(*) AS n
       FROM asesor_sugerencias WHERE created_at >= datetime('now', '-21 days')
         AND COALESCE(resuelto_por, '') != 'rehecha a pedido del dueño'
       GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`
    ).all(),
    env.CRM_DB.prepare(
      `SELECT tipo, texto_original AS antes, texto AS despues, resuelto_por AS quien
       FROM asesor_sugerencias
       WHERE estado = 'aprobada' AND texto_original IS NOT NULL AND texto_original != texto
       ORDER BY resuelto_at DESC LIMIT 12`
    ).all(),
    env.CRM_DB.prepare(
      `SELECT tipo, substr(COALESCE(texto_original, texto), 1, 220) AS texto, motivo, resuelto_por AS quien
       FROM asesor_sugerencias
       WHERE estado = 'descartada' AND COALESCE(resuelto_por, '') != 'rehecha a pedido del dueño'
       ORDER BY resuelto_at DESC LIMIT 10`
    ).all(),
    env.CRM_DB.prepare(
      `SELECT s.tipo, s.origen,
              COUNT(*) AS aprobadas,
              SUM(EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = s.conversation_id
                          AND m.direction = 'in' AND m.created_at > s.resuelto_at
                          AND m.created_at <= datetime(s.resuelto_at, '+24 hours'))) AS respondieron,
              -- Solo cuenta la compra que vino DESPUÉS de aprobar la sugerencia (antes
              -- sumaba cualquier chat con la etiqueta purchase, aunque ya hubiera comprado).
              SUM(EXISTS (SELECT 1 FROM capi_events e WHERE e.conversation_id = s.conversation_id
                          AND e.event_name = 'Purchase' AND e.created_at > s.resuelto_at)
                  OR (conv.etapa >= 5 AND conv.etapa_at > s.resuelto_at)) AS compraron
       FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
       WHERE s.estado = 'aprobada' AND s.tipo != 'respuesta_rapida' AND s.resuelto_at >= datetime('now', '-21 days')
       GROUP BY s.tipo, s.origen`
    ).all(),
    env.CRM_DB.prepare("SELECT id, tema, nota, fuente, created_at FROM asesor_memoria WHERE activa = 1 ORDER BY tema, created_at").all()
  ]);
  return {
    sugerencias_por_origen: porOrigen.results,
    correcciones_humanas: ediciones.results,
    descartadas_recientes: descartadas.results,
    resultado_de_lo_enviado: resultados.results,
    memoria: memoria.results
  };
}

/**
 * GET /api/asesor/anuncios?dias=7 — lo que Meta no sabe: por cada anuncio
 * (ad_source_id del click-to-WhatsApp), cuántos chats trajo, cuántos pasaron
 * del saludo automático y cuántos terminaron en compra (etiqueta purchase).
 * El director CRO lo cruza con el gasto de Meta para sacar el costo por venta.
 */
export async function onRequestGetAnuncios({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias")) || 7, 1), 60);

  const { results } = await env.CRM_DB.prepare(
    `SELECT COALESCE(c.ad_source_id, '') AS ad_id, MAX(c.ad_headline) AS titular,
            COUNT(*) AS chats,
            SUM(EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conv.id AND m.direction = 'in'
                        AND m.body NOT LIKE '%gustaría más información%')) AS conversaron,
            SUM(COALESCE(conv.meta_tags, '') LIKE '%lead%') AS leads,
            SUM(COALESCE(conv.meta_tags, '') LIKE '%purchase%') AS compras
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id
     WHERE conv.created_at >= datetime('now', ?)
     GROUP BY 1 ORDER BY chats DESC LIMIT 100`
  ).bind(`-${dias} days`).all();
  return json({ dias, anuncios: results, nota: "compras = chats etiquetados purchase en el CRM (puede quedarse corto si las vendedoras no marcan la venta)" });
}

/**
 * GET /api/asesor/pedidos-web?horas=24
 *      Los formularios de la página de las últimas `horas` (máx. 72), hayan
 *      terminado o no en venta, con lo que pasó en su chat de WhatsApp: si el
 *      cliente escribió después del pedido, la etapa del embudo y si compró.
 *      Lo lee enviar.py para la sección "🌐 Pedidos de la web" del PDF.
 */
export async function onRequestGetPedidosWeb({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const url = new URL(request.url);
  const horas = Math.min(Math.max(Number(url.searchParams.get("horas")) || 24, 1), 72);
  const desde = sqlFecha(new Date(Date.now() - horas * 3600000));

  const { results } = await env.CRM_DB.prepare(
    `SELECT p.id, p.created_at, p.nombre, p.wa_id, p.envio, p.destino, p.etiqueta, p.bump, p.total,
            conv.etapa, conv.meta_tags,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conv.id AND m.direction = 'in'
               AND m.created_at >= p.created_at) AS mensajes_cliente
     FROM pedidos_web p
     LEFT JOIN contacts c ON c.wa_id = p.wa_id
     LEFT JOIN conversations conv ON conv.contact_id = c.id
     WHERE p.created_at >= ?
     ORDER BY p.created_at ASC
     LIMIT 300`
  ).bind(desde).all();
  const pedidos = results.map((p) => {
    const compro = /\bpurchase\b/.test(p.meta_tags || "") || Number(p.etapa) >= 5;
    return {
      hora: aLima(p.created_at).slice(5, 16),
      nombre: p.nombre,
      whatsapp: p.wa_id,
      destino: p.envio === "casa" ? "LIMA" : "PROVINCIA",
      direccion_o_agencia: p.destino,
      producto: p.bump ? `${p.etiqueta} + ${p.bump}` : p.etiqueta,
      total: p.total,
      escribio: p.mensajes_cliente > 0,
      etapa: p.etapa ?? null,
      resultado: compro ? "COMPRÓ" : p.mensajes_cliente > 0 ? "EN CONVERSACIÓN" : "SIN RESPUESTA"
    };
  });
  return json({ horas, pedidos });
}

/**
 * GET /api/asesor/buscar-dni?dni=XXXXXXXX
 * Busca en los mensajes del CRM el número de DNI para identificar al cliente
 * de una boleta cuando no aparece en Sheets Ventas.
 * Devuelve: { encontrado, conversation_id, wa_id, nombre }
 * o { encontrado: false } si ningún mensaje contiene ese DNI.
 */
export async function onRequestGetBuscarDni({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const url = new URL(request.url);
  const dni = (url.searchParams.get("dni") || "").replace(/\D/g, "");
  if (!dni || dni.length < 7) return json({ error: "dni inválido (mínimo 7 dígitos)." }, 400);

  // Busca en texto de mensajes (cliente o vendedora) del último año.
  const hace1ano = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const { results } = await env.CRM_DB.prepare(
    `SELECT conv.id AS conversation_id, c.wa_id,
            COALESCE(c.name, c.profile_name, '') AS nombre,
            MAX(m.created_at) AS ultimo_match
     FROM messages m
     JOIN conversations conv ON conv.id = m.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     WHERE m.body LIKE ? AND m.type = 'text' AND m.created_at >= ?
     GROUP BY conv.id
     ORDER BY ultimo_match DESC
     LIMIT 5`
  ).bind(`%${dni}%`, hace1ano).all();

  if (!results.length) return json({ encontrado: false });
  const mejor = results[0];
  // Normalizar wa_id (9 dígitos → 51 + 9)
  const telRaw = String(mejor.wa_id || "").replace(/\D/g, "");
  const waId = telRaw.length === 9 ? "51" + telRaw : telRaw;
  return json({
    encontrado: true,
    conversation_id: mejor.conversation_id,
    wa_id: waId || null,
    nombre: mejor.nombre,
    coincidencias: results.length
  });
}
