/**
 * Plantillas propuestas por el CRM para mandar a Meta (src/lib/plantillas-propuestas.js).
 * Solo admin: ve el texto exacto de cada una y decide cuáles mandar a revisión.
 *
 * GET  /api/crm/plantillas-propuestas → { marcas: [{ marca, nombre, aviso, propuestas: [{ nombre, grupo, titulo, cuando, categoria, texto, botones, estado }] }] }
 *      estado: SIN_ENVIAR | PENDING | APPROVED | REJECTED | PAUSED | DISABLED | DESCONOCIDO | SIN_NUMERO
 * PATCH /api/crm/plantillas-propuestas { marca, nombre, texto, botones: [0 a 3], categoria: "MARKETING" | "UTILITY" } o { marca, nombre, restablecer: true }
 *      Cambia el texto y los botones antes de mandarla (si ya está en Meta, se reenvía a revisión con `reenviar: true` en el POST).
 * PATCH { marca, nombre: "shalom"|"lead", orden: [nombres] } cambia qué mensaje sale a cada día, sin mandar nada a Meta.
 * POST /api/crm/plantillas-propuestas { marca, nombres: [...] } → { resultados: [{ nombre, ok, error? }] }
 */

import { conAuth } from "../../lib/crm-auth.js";
import { estadoDePropuestas, mandarPropuestas, guardarCambio, guardarOrden, MARCAS } from "../../lib/plantillas-propuestas.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const esAdmin = (agent) => agent?.role === "admin";

async function get({ env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo el administrador manda plantillas a Meta." }, 403);
  return json({ marcas: await estadoDePropuestas(env) });
}

async function post({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo el administrador manda plantillas a Meta." }, 403);
  const payload = await request.json().catch(() => null);
  const nombres = (Array.isArray(payload?.nombres) ? payload.nombres : []).map(String).slice(0, 30);
  if (!MARCAS[payload?.marca] || !nombres.length) return json({ error: "Falta la marca o las plantillas." }, 400);
  try {
    return json({ resultados: await mandarPropuestas(env, payload.marca, nombres, Boolean(payload.reenviar)) });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function patch({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo el administrador cambia las plantillas." }, 403);
  const p = await request.json().catch(() => null);
  if (!MARCAS[p?.marca] || !p?.nombre) return json({ error: "Falta la marca o la plantilla." }, 400);
  try {
    if (p.orden) { await guardarOrden(env, p.marca, p.nombre, p.orden); return json({ ok: true }); } // nombre = clave del plan
    await guardarCambio(env, p.marca, p.nombre, p);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 400);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
