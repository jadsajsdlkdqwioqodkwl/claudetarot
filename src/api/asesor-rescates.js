/**
 * POST /api/asesor/rescates — con la cabecera x-asesor-clave (la clave de la Routine del asesor).
 *   { rescates: [{ whatsapp, motivo }] }
 * El asesor decide a quién mandarle el rescate de lead 1 (plantilla de marketing, fuera de la ventana de
 * 24 h): solo a quien tenga posibilidades reales de comprar (no a quien quería otra cosa). Sale solo, sin
 * aprobación: lo autorizó el dueño. Reglas y tope en src/lib/rescate-lead.js.
 * Responde { programados: [whatsapp], rechazados: [{ whatsapp, razon }] }.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { rescateUnoPorAsesor } from "../lib/rescate-lead.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB) return json({ error: "Falta la base del CRM." }, 503);
  const p = await request.json().catch(() => null);
  if (!Array.isArray(p?.rescates) || !p.rescates.length) return json({ error: "Falta rescates: [{ whatsapp, motivo }]." }, 400);
  return json(await rescateUnoPorAsesor(env, p.rescates));
}
