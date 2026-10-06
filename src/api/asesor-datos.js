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
 * POST /api/asesor/memoria
 *      { fuente, agregar: [{ tema, nota }], retirar: [id] }
 *      Lo que el bot aprende y quiere recordar la próxima vez. Se lee en
 *      /api/asesor/contexto junto con el aprendizaje medido (aprendizaje()).
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { estadisticasToques } from "../lib/toques.js";

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

  const { results } = soloPromesas ? { results: [] } : await env.CRM_DB.prepare(
    `SELECT m.created_at, m.direction, m.type, m.body, m.file_name, m.sent_by,
            c.wa_id, c.profile_name, c.name AS contact_name, c.ad_headline,
            conv.assigned_agent, conv.meta_tags
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     JOIN messages m ON m.conversation_id = conv.id AND m.created_at >= ?
     WHERE conv.last_message_at >= ?
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT 30000`
  )
    .bind(sqlFecha(desde), sqlFecha(activosDesde > desde ? activosDesde : desde))
    .all();

  const aFila = (m) => ({
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
    asesora: m.assigned_agent || "",
    embudo: m.meta_tags || ""
  });
  const filas = results.map(aFila);

  if (!promesasDias) return json({ desde: aLima(sqlFecha(desde)), filas });
  const promesasDesde = new Date(Date.now() - promesasDias * 86400000);
  const { results: prom } = await env.CRM_DB.prepare(
    `SELECT m.created_at, m.direction, m.type, m.body, m.file_name, m.sent_by,
            c.wa_id, c.profile_name, c.name AS contact_name, c.ad_headline,
            conv.assigned_agent, conv.meta_tags
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     JOIN messages m ON m.conversation_id = conv.id AND m.created_at >= ?
     WHERE conv.last_message_at >= ?
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
  // (Desde el 04/10 hasta el 06/10 este endpoint devolvía error 1101: dos líneas
  // copiadas de /chats usaban una variable `url` que aquí no existe.)
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
 * GET /api/asesor/toques?dias=30 — cómo van los toques automáticos
 * (src/lib/toques.js): por toque, enviados vs. grupo de control, cuántos
 * respondieron en 24 h y cuántos compraron en 7 días. Si a los 30 días los
 * tocados no compran más que el control, ese toque se apaga.
 */
export async function onRequestGetToques({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias")) || 30, 1), 120);
  const toques = await estadisticasToques(env.CRM_DB, dias).catch((err) => (/no such table/.test(err.message) ? null : Promise.reject(err)));
  if (!toques) return json({ dias, toques: [], nota: "La tabla toques no existe: falta aplicar migrations/0043_crm_v43.sql (los toques están apagados)." });
  return json({ dias, toques });
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
  const horas = Math.min(Math.max(Number(new URL(request.url).searchParams.get("horas")) || 24, 1), 72);
  const desde = sqlFecha(new Date(Date.now() - horas * 3600000));
  const promesasDias = Math.min(Math.max(Number(url.searchParams.get("promesas_dias")) || 0, 0), 60);
  const soloPromesas = promesasDias > 0 && url.searchParams.get("solo_promesas") === "1";

  const { results } = soloPromesas ? { results: [] } : await env.CRM_DB.prepare(
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
