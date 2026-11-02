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

/**
 * Escribe una fila en "Boletas auto" directamente (sin auth, para uso interno del Worker).
 * { nombre, wa_id, courier, nro_orden, saldo, staging_ids, ventana }
 */
export async function registrarBoletaLog(env, { nombre, wa_id, courier, nro_orden, saldo, staging_ids, ventana = "abierta" }) {
  if (!env.GOOGLE_SHEET_ID) return;
  await asegurarPestana(env, env.GOOGLE_SHEET_ID, PESTAÑA, ENCABEZADOS);
  await appendRowsTo(env, env.GOOGLE_SHEET_ID, PESTAÑA, [[
    fechaLima(),
    String(nombre || ""),
    String(wa_id || ""),
    String(courier || ""),
    String(nro_orden || ""),
    String(saldo ?? ""),
    String(Array.isArray(staging_ids) ? staging_ids.join(", ") : staging_ids || ""),
    String(ventana)
  ]]);
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.GOOGLE_SHEET_ID) return json({ error: "Falta GOOGLE_SHEET_ID." }, 503);

  const p = await request.json().catch(() => null);
  if (!p?.nombre) return json({ error: "Falta nombre." }, 400);

  try {
    await registrarBoletaLog(env, p);
    return json({ ok: true });
  } catch (err) {
    console.error("boletas-log:", err.message);
    return json({ error: err.message }, 502);
  }
}
