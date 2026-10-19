/**
 * Finanzas del negocio (src/lib/finanzas.js).
 *
 * GET   /api/crm/finanzas?negocio=tarot&quincena=2026-10-A | mes=2026-10 | desde=…&hasta=…   (sesión de admin)
 *       → utilidad del período, embudo, palancas (producto / CRO / ads) y alertas.
 * PATCH /api/crm/finanzas { negocio, reglas: { costo_producto, comision_pct, … } }             (solo admin)
 * GET   /api/asesor/finanzas?…   lo mismo con la clave del asesor (Routines).
 * POST  /api/asesor/finanzas { negocio, pedidos: [...], ads: [...], gastos: [...] }
 *       Carga idempotente (volver a mandar el mismo reporte no duplica nada). Formato en docs/finanzas.md.
 */

import { conAuth } from "../lib/crm-auth.js";
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { calcularFinanzas, cargarMovimientos, guardarReglas } from "../lib/finanzas.js";
import { quincenasRecientes } from "../lib/comisiones.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const parametros = (url) => {
  const g = (k) => url.searchParams.get(k) || undefined;
  return { negocio: g("negocio") || "tarot", periodo: { quincena: g("quincena"), mes: g("mes"), desde: g("desde"), hasta: g("hasta") } };
};

async function leer(env, url) {
  const { negocio, periodo } = parametros(url);
  try { return json({ ...(await calcularFinanzas(env.CRM_DB, negocio, periodo)), quincenas: quincenasRecientes() }); }
  catch (err) { return json({ error: err.message }, 400); }
}

async function puertaAsesor(request, env) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB) return json({ error: "Falta la base del CRM." }, 503);
  return null;
}

export async function onRequestGetAsesor({ request, env }) {
  return (await puertaAsesor(request, env)) || leer(env, new URL(request.url));
}

export async function onRequestPostAsesor({ request, env }) {
  const cortar = await puertaAsesor(request, env);
  if (cortar) return cortar;
  const p = await request.json().catch(() => null);
  if (!p) return json({ error: "Cuerpo inválido." }, 400);
  try { return json({ ok: true, negocio: p.negocio || "tarot", cargado: await cargarMovimientos(env.CRM_DB, p.negocio || "tarot", p) }); }
  catch (err) { return json({ error: err.message }, 400); }
}

export const onRequestGet = conAuth(async ({ request, env, agent }) => {
  if (agent?.role !== "admin") return json({ error: "Las finanzas las ve solo el administrador." }, 403);
  return leer(env, new URL(request.url));
});

export const onRequestPatch = conAuth(async ({ request, env, agent }) => {
  if (agent?.role !== "admin") return json({ error: "Solo el administrador cambia las reglas." }, 403);
  const p = await request.json().catch(() => null);
  if (!p?.reglas) return json({ error: "Falta reglas." }, 400);
  try { return json({ ok: true, reglas: await guardarReglas(env.CRM_DB, p.negocio || "tarot", p.reglas) }); }
  catch (err) { return json({ error: err.message }, 400); }
});
