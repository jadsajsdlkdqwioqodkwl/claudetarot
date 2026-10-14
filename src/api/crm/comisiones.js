/**
 * Contador de comisiones por quincena (src/lib/comisiones.js).
 * GET   /api/crm/comisiones?quincena=2026-10-A → { quincena, porcentaje, asesoras: [...], ventas: [...], quincenas: [...] }
 *       El admin ve todo; una vendedora solo lo suyo (su fila y las ventas donde cobra).
 * PATCH /api/crm/comisiones { evento_id, modo: "dueno"|"mitad"|null, responsable, ayudante, nota } — solo admin.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { calcularQuincena, quincenasRecientes, quincenaDe, fechaLima, guardarAjuste } from "../../lib/comisiones.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function get({ request, env, agent }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("quincena") || quincenaDe(fechaLima(Date.now())).id;
  let datos;
  try { datos = await calcularQuincena(env.CRM_DB, id); } catch (err) { return json({ error: err.message }, 400); }
  if (agent?.role !== "admin") {
    const yo = new Set([agent?.displayName, agent?.username].filter(Boolean).map((x) => x.toLowerCase()));
    const mio = (n) => yo.has(String(n).toLowerCase());
    datos.asesoras = datos.asesoras.filter((a) => mio(a.asesora));
    datos.ventas = datos.ventas.filter((v) => Object.keys(v.reparto).some(mio));
    datos.total_ventas = datos.ventas.length;
    datos.total_valor = datos.ventas.reduce((s, v) => s + v.valor, 0);
    datos.total_comision = datos.asesoras.reduce((s, a) => s + a.comision, 0);
  }
  return json({ ...datos, quincenas: quincenasRecientes(), es_admin: agent?.role === "admin" });
}

async function patch({ request, env, agent }) {
  if (agent?.role !== "admin") return json({ error: "Solo el administrador corrige comisiones." }, 403);
  const p = await request.json().catch(() => null);
  const evento = Number(p?.evento_id);
  if (!evento) return json({ error: "Falta evento_id." }, 400);
  try { await guardarAjuste(env.CRM_DB, evento, p, agent.displayName || agent.username); } catch (err) { return json({ error: err.message }, 400); }
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPatch = conAuth(patch);
