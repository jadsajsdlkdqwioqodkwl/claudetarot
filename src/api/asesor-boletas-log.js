/**
 * POST /api/asesor/boletas-log — registra un despacho de boleta en la pestaña
 * "Boletas auto" del libro de ventas (GOOGLE_SHEET_ID) para consulta visual.
 *
 * Body: { nombre, wa_id, courier, nro_orden, saldo, staging_ids, ventana }
 *   ventana: "abierta" | "pendiente"
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { appendRowsTo, asegurarPestana } from "../lib/google-sheets.js";

const PESTAÑA = "Boletas auto";
const ENCABEZADOS = ["Fecha Lima", "Nombre", "WA", "Courier", "NRO Orden", "Saldo", "Staging IDs", "Ventana"];
const LIMA_OFFSET_MS = -5 * 3600 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

function fechaLima() {
  return new Date(Date.now() + LIMA_OFFSET_MS)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.GOOGLE_SHEET_ID) return json({ error: "Falta GOOGLE_SHEET_ID." }, 503);

  const p = await request.json().catch(() => null);
  if (!p?.nombre) return json({ error: "Falta nombre." }, 400);

  try {
    await asegurarPestana(env, env.GOOGLE_SHEET_ID, PESTAÑA, ENCABEZADOS);
    await appendRowsTo(env, env.GOOGLE_SHEET_ID, PESTAÑA, [[
      fechaLima(),
      String(p.nombre || ""),
      String(p.wa_id || ""),
      String(p.courier || ""),
      String(p.nro_orden || ""),
      String(p.saldo ?? ""),
      String(Array.isArray(p.staging_ids) ? p.staging_ids.join(", ") : p.staging_ids || ""),
      String(p.ventana || "abierta")
    ]]);
    return json({ ok: true });
  } catch (err) {
    console.error("boletas-log:", err.message);
    return json({ error: err.message }, 502);
  }
}
