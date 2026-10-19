/**
 * GET /api/asesor/comisiones?quincena=2026-10-A  (x-asesor-clave)
 * La cuenta de comisiones de una quincena (src/lib/comisiones.js), para que la Routine de finanzas la copie
 * a la hoja privada del dueño. Es el mismo dato que ya ve CRM → Comisiones.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { calcularQuincena, quincenaDe, fechaLima } from "../lib/comisiones.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB) return json({ error: "Falta la base del CRM." }, 503);
  const id = new URL(request.url).searchParams.get("quincena") || quincenaDe(fechaLima(Date.now())).id;
  try {
    const d = await calcularQuincena(env.CRM_DB, id);
    return json({ quincena: d.quincena, porcentaje: d.porcentaje, porcentajes_propios: d.porcentajes_propios, total_ventas: d.total_ventas, total_valor: d.total_valor,
                  total_comision: d.total_comision, asesoras: d.asesoras.map((a) => ({ asesora: a.asesora, ventas: a.ventas, comision: a.comision })) });
  } catch (err) { return json({ error: err.message }, 400); }
}
