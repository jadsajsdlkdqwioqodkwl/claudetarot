/**
 * Datos para las Routines del asesor, directo de D1 (sin pasar por la hoja
 * de Google ni por Drive). Todo con la cabecera x-asesor-clave.
 *
 * GET  /api/asesor/chats?dias=3[&activos_horas=6]
 *      Los mensajes de los últimos `dias` días (hora de Lima), con las mismas
 *      columnas que la hoja de chats. Con `activos_horas`, solo los chats que
 *      tuvieron algún mensaje en esas últimas horas (pero con su historial
 *      completo de esos días), para las corridas que solo miran lo nuevo.
 *
 * POST /api/asesor/memoria
 *      { fuente, agregar: [{ tema, nota }], retirar: [id] }
 *      Lo que el bot aprende y quiere recordar la próxima vez. Se lee en
 *      /api/asesor/contexto junto con el aprendizaje medido (aprendizaje()).
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";

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

  const { results } = await env.CRM_DB.prepare(
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

  const filas = results.map((m) => ({
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
  }));
  return json({ desde: aLima(sqlFecha(desde)), filas });
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
              SUM(COALESCE(conv.meta_tags, '') LIKE '%purchase%') AS compraron
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
