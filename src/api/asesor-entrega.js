/**
 * GET /api/asesor/entrega?fecha=AAAA-MM-DD  (x-asesor-clave)
 * Salud de WhatsApp de un día (hora de Lima), para el reporte «Saldos y reposiciones» del dueño (2026-11-11):
 *   - salientes: cuántos mensajes se mandaron, cuántos NO entregó Meta y por qué (error_detail del estado «failed»);
 *   - entrantes: cuántos mensajes de clientes entraron y cuántos NO se pudieron procesar (webhook_errores);
 *   - archivos entrantes (foto, audio, documento) que todavía no se guardaron.
 * Solo lee. Los motivos se agrupan por el título del error de Meta.
 */
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { servirMensaje } from "./crm/media.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const MOTIVOS = [
  [/healthy ecosystem/i, "Límite de marketing por cliente que pone Meta (el cliente ya recibió muchas promociones)"],
  [/payment issue|eligibility/i, "Problema de pago de la cuenta de WhatsApp"],
  [/part of an experiment/i, "El número del cliente está en un experimento de Meta (no recibe marketing)"],
  [/Re-engagement|24 hou/i, "Fuera de la ventana de 24 h (solo cabía una plantilla)"],
  [/stop receiv/i, "El cliente eligió no recibir marketing"],
  [/undeliverable/i, "No entregable (número sin WhatsApp, bloqueó al negocio o versión antigua)"],
  [/rate limit|too many/i, "Demasiados envíos seguidos (límite de velocidad)"]
];
const motivoDe = (detalle) => (MOTIVOS.find(([re]) => re.test(String(detalle || ""))) || [null, String(detalle || "Sin detalle").split(":")[0].slice(0, 90)])[1];

export async function onRequestGet({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const fecha = new URL(request.url).searchParams.get("fecha") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "Falta fecha AAAA-MM-DD." }, 400);
  // Día de Lima = de las 05:00 UTC de ese día a las 05:00 UTC del siguiente.
  const desde = `${fecha} 05:00:00`;
  const hasta = new Date(new Date(`${fecha}T05:00:00Z`).getTime() + 86400000).toISOString().slice(0, 19).replace("T", " ");
  const db = env.CRM_DB;
  try {
    const sal = await db.prepare(
      `SELECT type, COUNT(*) AS n, SUM(status = 'failed') AS fallidos FROM messages WHERE direction = 'out' AND created_at >= ? AND created_at < ? GROUP BY type`
    ).bind(desde, hasta).all();
    const fall = await db.prepare(
      `SELECT COALESCE(error_detail, '') AS detalle, type, COUNT(*) AS n FROM messages WHERE direction = 'out' AND status = 'failed' AND created_at >= ? AND created_at < ? GROUP BY detalle, type`
    ).bind(desde, hasta).all();
    const ent = await db.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT conversation_id) AS chats FROM messages WHERE direction = 'in' AND created_at >= ? AND created_at < ?`).bind(desde, hasta).first();
    const err = await db.prepare(`SELECT substr(error, 1, 110) AS error, COUNT(*) AS n, COUNT(DISTINCT COALESCE(wa_id, wa_message_id)) AS personas FROM webhook_errores WHERE created_at >= ? AND created_at < ? GROUP BY 1`).bind(desde, hasta).all();
    const media = await db.prepare(
      `SELECT COUNT(*) AS n FROM messages WHERE direction = 'in' AND media_id IS NOT NULL AND (media_key IS NULL OR media_key = '') AND type IN ('image', 'audio', 'video', 'document') AND created_at >= ? AND created_at < ?`
    ).bind(desde, hasta).first();
    const porMotivo = new Map();
    for (const f of fall.results || []) {
      const k = motivoDe(f.detalle);
      const x = porMotivo.get(k) || { motivo: k, mensajes: 0, plantillas: 0 };
      x.mensajes += f.n; if (f.type === "template") x.plantillas += f.n;
      porMotivo.set(k, x);
    }
    const total = (sal.results || []).reduce((s, r) => s + r.n, 0);
    const fallidos = (sal.results || []).reduce((s, r) => s + (r.fallidos || 0), 0);
    return json({
      ok: true, fecha,
      salientes: { total, fallidos, plantillas: (sal.results || []).find((r) => r.type === "template")?.n || 0, por_motivo: [...porMotivo.values()].sort((a, b) => b.mensajes - a.mensajes) },
      entrantes: { mensajes: ent?.n || 0, chats: ent?.chats || 0, no_procesados: (err.results || []).reduce((s, r) => s + r.n, 0), errores: err.results || [], archivos_sin_guardar: media?.n || 0 }
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

/**
 * Cron: guarda en R2 los archivos entrantes (audio, foto, video, documento) que nadie abrió todavía. Antes solo se bajaban de
 * WhatsApp la primera vez que alguien los abría en el CRM; si nadie los abría a tiempo, Meta dejaba de servirlos (auditoría
 * 2026-11-11: 10 de 445 sin guardar). Pocos por pasada para no gastar el cupo de consultas del cron.
 */
export async function guardarArchivosEntrantesPendientes(env, tope = 3) {
  if (!env.CRM_DB || !env.CRM_MEDIA) return 0;
  const { results } = await env.CRM_DB.prepare(
    `SELECT id FROM messages WHERE direction = 'in' AND media_id IS NOT NULL AND (media_key IS NULL OR media_key = '') AND type IN ('image', 'audio', 'video', 'document')
     AND created_at >= datetime('now', '-25 days') AND created_at <= datetime('now', '-2 minutes') AND COALESCE(view_once, 0) = 0 ORDER BY id DESC LIMIT ?`
  ).bind(tope).all();
  let hechos = 0;
  for (const m of results || []) {
    const r = await servirMensaje(env, m.id).catch(() => null);
    if (r?.ok) hechos++;
    // El que Meta ya no sirve se marca para no reintentarlo en cada pasada.
    else await env.CRM_DB.prepare("UPDATE messages SET media_key = 'expirado' WHERE id = ? AND (media_key IS NULL OR media_key = '')").bind(m.id).run().catch(() => {});
  }
  return hechos;
}
