/**
 * Plantillas propuestas por el CRM para mandar a Meta (src/lib/plantillas-propuestas.js).
 * Solo admin: ve el texto exacto de cada una y decide cuáles mandar a revisión.
 *
 * GET  /api/crm/plantillas-propuestas → { marcas: [{ marca, nombre, aviso, propuestas: [{ nombre, grupo, titulo, cuando, categoria, texto, botones, estado }] }] }
 *      estado: SIN_ENVIAR | PENDING | APPROVED | REJECTED | PAUSED | DISABLED | DESCONOCIDO | SIN_NUMERO
 * POST /api/crm/plantillas-propuestas { marca, nombres: [...] } → { resultados: [{ nombre, ok, error? }] }
 */

import { conAuth } from "../../lib/crm-auth.js";
import { estadoDePropuestas, mandarPropuestas, MARCAS } from "../../lib/plantillas-propuestas.js";

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
    return json({ resultados: await mandarPropuestas(env, payload.marca, nombres) });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
