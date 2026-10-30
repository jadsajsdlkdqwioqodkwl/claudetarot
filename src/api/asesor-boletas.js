/**
 * GET  /api/asesor/boletas_staging → lista de items listos para análisis.
 * PATCH /api/asesor/boletas_staging → actualiza estado de un item tras el despacho.
 *
 * La Routine:
 *   1. GET → recibe los items con status='listo'
 *   2. Para cada uno: descarga la imagen con /api/asesor/imagen?id={media_id},
 *      analiza con visión, extrae nombre/DNI/courier.
 *   3. PATCH con { id, status, conversation_id, courier, nombre_boleta, dni_boleta }
 *      o { id, status: "error", error: "..." } si no encontró al cliente.
 *
 * Misma clave que /api/asesor/avisos (x-asesor-clave).
 */

import { autorizadoAsesor } from "./asesor.js";
import { stagingListarListos, stagingActualizar, stagingVerificarNroOrden } from "../lib/boletas-staging.js";
import { aplicarOlva } from "../lib/planes-plantilla.js";
// stagingListarPendientesVentana no se usa aquí: lo usa el webhook directamente.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export async function onRequestGet({ request, env }) {
  if (!autorizadoAsesor(request, env)) return json({ error: "No autorizado." }, 401);
  const url = new URL(request.url);
  const nroOrden = (url.searchParams.get("nro_orden") || "").trim();
  if (nroOrden) {
    const row = await stagingVerificarNroOrden(env.CRM_DB, nroOrden);
    return json({ ya_procesado: !!row, ...(row || {}) });
  }
  const items = await stagingListarListos(env.CRM_DB);
  return json({ items });
}

export async function onRequestPatch({ request, env }) {
  if (!autorizadoAsesor(request, env)) return json({ error: "No autorizado." }, 401);
  const p = await request.json().catch(() => null);
  if (!p?.id) return json({ error: "Falta id." }, 400);
  const valid = ["en_proceso", "enviado", "pendiente_ventana", "error"];
  if (p.status && !valid.includes(p.status)) return json({ error: `status debe ser uno de: ${valid.join(", ")}.` }, 400);
  await stagingActualizar(env.CRM_DB, p.id, p);

  // Courier Olva + conversation_id al marcar enviado o pendiente_ventana: activar el plan de recojo (3·7·13 días).
  if (p.courier === "Olva" && p.conversation_id && (p.status === "enviado" || p.status === "pendiente_ventana")) {
    await aplicarOlva(env, p.conversation_id, true, "boleta-auto").catch((err) =>
      console.error("aplicarOlva desde boletas_staging:", err.message)
    );
  }

  return json({ ok: true });
}
