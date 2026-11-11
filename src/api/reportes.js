/**
 * Reportes de ventas en PDF que arman las Routines del asesor.
 *
 * POST /api/asesor/reporte   (x-asesor-clave) { nombre, pdf_base64 }  o  { nombre: "x.xlsx", archivo_base64 }
 *      Lo guarda en R2 (reportes/…) con un nombre imposible de adivinar y
 *      devuelve el link. Lo sube enviar.py, así el PDF no pasa por el modelo. Desde el 2026-11-08 también
 *      acepta un Excel (.xlsx): el del envío masivo de Shalom que arma shalom.py.
 * GET  /r/<id>.pdf           el PDF (quien tenga el link).  GET /r/<id>.xlsx  el Excel (se descarga).
 * GET  /r/<id>.html          el resumen semanal (lo guarda asesor-resumen.js).
 * GET  /api/crm/reportes     (sesión de admin) los últimos reportes, para el
 *      botón Reportes del CRM. /api/asesor/reportes: lo mismo con la clave.
 */

import { paginaDelDia } from "./revision.js";
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { conAuth } from "../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const MAX_BYTES = 8 * 1024 * 1024;
const RE_ID = /^[a-z0-9-]{8,120}\.(pdf|html|xlsx)$/;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function onRequestPostReporte({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_MEDIA) return json({ error: "Falta el bucket R2." }, 503);
  const payload = await request.json().catch(() => null);
  const esXlsx = /\.xlsx$/i.test(String(payload?.nombre || "")) && payload?.archivo_base64;
  // .html: la página de revisión de envíos (dinsides.py presentar --pdf), con casillas OK / corrección / no va por pedido (2026-11-09).
  const esHtml = /\.html$/i.test(String(payload?.nombre || "")) && payload?.archivo_base64;
  let bytes;
  try {
    bytes = Uint8Array.from(atob(String(((esXlsx || esHtml) ? payload?.archivo_base64 : payload?.pdf_base64) || "")), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: "Archivo inválido." }, 400);
  }
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: "Archivo vacío o demasiado grande." }, 400);
  const ext = esXlsx ? "xlsx" : esHtml ? "html" : "pdf";
  const base = String(payload?.nombre || "reporte").toLowerCase().replace(/\.(pdf|xlsx|html)$/, "").replace(/[^a-z0-9-]+/g, "-").slice(0, 60);
  const id = `${base}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`;
  await env.CRM_MEDIA.put(`reportes/${id}`, bytes, {
    httpMetadata: { contentType: esXlsx ? XLSX : esHtml ? "text/html; charset=utf-8" : "application/pdf" },
    customMetadata: { titulo: String(payload?.titulo || base).slice(0, 120) }
  });
  return json({ ok: true, id, url: `${new URL(request.url).origin}/r/${id}` });
}

export async function reportePdf({ request, env }) {
  const id = new URL(request.url).pathname.slice(3);
  // Link fijo de la revisión de envíos del día (sin extensión): siempre la última página generada, con las notas ya marcadas.
  if (/^envios-\d{4}-\d{2}-\d{2}-[a-f0-9]{16}$/.test(id)) return (await paginaDelDia(env, id)) || new Response("No encontrado", { status: 404 });
  if (!RE_ID.test(id) || !env.CRM_MEDIA) return new Response("No encontrado", { status: 404 });
  const obj = await env.CRM_MEDIA.get(`reportes/${id}`);
  if (!obj) return new Response("No encontrado", { status: 404 });
  if (id.endsWith(".html")) {
    // El resumen semanal (asesor-resumen.js): una página, no un PDF.
    return new Response(obj.body, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex, nofollow" }
    });
  }
  if (id.endsWith(".xlsx")) {
    return new Response(obj.body, {
      headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${id.replace(/-[a-f0-9]{16}\.xlsx$/, ".xlsx")}"`,
        "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex, nofollow" }
    });
  }
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${id.replace(/-[a-f0-9]{16}\.pdf$/, ".pdf")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

async function listar({ env, agent }) {
  if (agent && agent.role !== "admin") return json({ error: "Solo el admin ve los reportes." }, 403);
  if (!env.CRM_MEDIA) return json({ reportes: [] });
  const { objects } = await env.CRM_MEDIA.list({ prefix: "reportes/", limit: 500, include: ["customMetadata"] });
  const reportes = objects
    .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))
    .slice(0, 60)
    .map((o) => ({
      url: `/r/${o.key.slice("reportes/".length)}`,
      titulo: o.customMetadata?.titulo || o.key,
      fecha: o.uploaded
    }));
  return json({ reportes });
}

export const onRequestGetReportes = conAuth(listar);

/** GET /api/asesor/reportes (x-asesor-clave): la misma lista, para las Routines. */
export async function onRequestGetReportesAsesor({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  return listar({ env });
}
