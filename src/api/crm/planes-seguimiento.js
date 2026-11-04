/**
 * Planes de seguimiento con nombre (dueño, 2026-11-03). Solo admin.
 *
 * GET   /api/crm/planes-seguimiento → { planes: [{ id, nombre, segmento, activo, pasos, version_b, reparto_b, rapidas: [{id, title}],
 *          interesados: bool, calendario: [{ dia, hora, pagado }] }], plan_interesados_id }
 * POST  /api/crm/planes-seguimiento { nombre, segmento?, pasos?, duplicar_de? } → { plan }
 * PATCH /api/crm/planes-seguimiento { id, nombre?, segmento?, pasos?, activo?, version_b?: pasos[]|null, reparto_b?: 0..1 } → { plan }
 *       Un plan nunca se borra: se apaga (activo = 0). Los pasos ya programados en los chats no cambian.
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { leerPlan, normalizarPasosSeguimiento, obtenerAjuste, guardarAjuste, calendarioDePasos, medianocheLima, espacioMinimoMs, ESPACIO_MINIMO_H } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const SEGMENTOS = ["general", "lima", "provincia"];

/** Vista previa del calendario para un chat que empezó hoy a las 10:00 Lima y escribió ahora mismo. */
function vistaPrevia(pasos, espacioMs) {
  const ahora = Date.now();
  const inicio = medianocheLima(ahora) + 10 * 3600 * 1000;
  return calendarioDePasos(pasos, { inicioMs: inicio, ultimoMs: ahora, ahoraMs: ahora, espacioMs }).map((c) => ({
    dia: c.dia, hora: new Date(c.cuando - 5 * 3600 * 1000).toISOString().slice(11, 16), pagado: c.pagado, salta: c.salta, motivo: c.motivo, espaciado: c.espaciado
  }));
}

async function completo(db, id) {
  const plan = await leerPlan(db, id);
  if (!plan) return null;
  const { results: rapidas } = await db.prepare("SELECT id, title FROM quick_replies WHERE followup_plan_id = ? OR (? = 1 AND followup_universal = 1 AND followup_plan_id IS NULL) ORDER BY title")
    .bind(plan.id, plan.id).all().catch(() => ({ results: [] }));
  const interesados = Number(await obtenerAjuste(db, "plan_interesados_id")) === plan.id;
  const espacioMs = await espacioMinimoMs(db);
  return { ...plan, rapidas: rapidas || [], interesados, calendario: vistaPrevia(plan.pasos, espacioMs), calendario_b: plan.version_b ? vistaPrevia(plan.version_b, espacioMs) : null };
}

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare("SELECT id FROM planes_seguimiento ORDER BY activo DESC, id").all();
  const planes = [];
  for (const r of results || []) planes.push(await completo(env.CRM_DB, r.id));
  return json({ planes: planes.filter(Boolean), plan_interesados_id: Number(await obtenerAjuste(env.CRM_DB, "plan_interesados_id")) || null,
    espacio_min_h: (await espacioMinimoMs(env.CRM_DB)) / 3600000, espacio_min_h_defecto: ESPACIO_MINIMO_H });
}

async function post({ request, env }) {
  const p = await request.json().catch(() => null);
  const nombre = String(p?.nombre || "").trim().slice(0, 80);
  if (!nombre) return json({ error: "Ponle un nombre al plan." }, 400);
  const base = p?.duplicar_de ? await leerPlan(env.CRM_DB, p.duplicar_de) : null;
  const segmento = SEGMENTOS.includes(p?.segmento) ? p.segmento : base?.segmento || "general";
  const pasos = normalizarPasosSeguimiento(Array.isArray(p?.pasos) ? p.pasos : base?.pasos || []);
  const r = await env.CRM_DB.prepare("INSERT INTO planes_seguimiento (nombre, segmento, pasos, version_b, reparto_b) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(nombre, segmento, JSON.stringify(pasos), base?.version_b ? JSON.stringify(base.version_b) : null, base?.reparto_b || 0).first();
  return json({ ok: true, plan: await completo(env.CRM_DB, r.id) });
}

async function patch({ request, env }) {
  const p = await request.json().catch(() => null);
  // Ajuste general (no de un plan): mínimo de horas entre seguimientos (dueño, 2026-11-04). 0 lo apaga; vacío vuelve a 5.
  if (p && "espacio_min_h" in p && !p.id) {
    const h = p.espacio_min_h === null || p.espacio_min_h === "" ? null : Number(p.espacio_min_h);
    if (h !== null && !(Number.isFinite(h) && h >= 0 && h <= 48)) return json({ error: "El mínimo entre seguimientos va de 0 a 48 horas." }, 400);
    await guardarAjuste(env.CRM_DB, "seguimiento_espacio_min_h", h === null ? "" : String(h));
    return json({ ok: true, espacio_min_h: (await espacioMinimoMs(env.CRM_DB)) / 3600000 });
  }
  const id = Number(p?.id);
  const plan = id ? await leerPlan(env.CRM_DB, id) : null;
  if (!plan) return json({ error: "Ese plan no existe." }, 404);
  const sets = [], vals = [];
  if ("nombre" in p) { const n = String(p.nombre || "").trim().slice(0, 80); if (!n) return json({ error: "El nombre no puede quedar vacío." }, 400); sets.push("nombre = ?"); vals.push(n); }
  if ("segmento" in p && SEGMENTOS.includes(p.segmento)) { sets.push("segmento = ?"); vals.push(p.segmento); }
  if ("pasos" in p) { sets.push("pasos = ?"); vals.push(JSON.stringify(normalizarPasosSeguimiento(p.pasos))); }
  if ("activo" in p) { sets.push("activo = ?"); vals.push(p.activo ? 1 : 0); }
  if ("version_b" in p) {
    const b = p.version_b === null ? [] : normalizarPasosSeguimiento(p.version_b);
    sets.push("version_b = ?"); vals.push(b.length ? JSON.stringify(b) : null);
  }
  if ("reparto_b" in p) { sets.push("reparto_b = ?"); vals.push(Math.min(1, Math.max(0, Number(p.reparto_b) || 0))); }
  if (!sets.length) return json({ error: "Nada que cambiar." }, 400);
  sets.push("updated_at = datetime('now')");
  await env.CRM_DB.prepare(`UPDATE planes_seguimiento SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  // El plan 1 «Universal» sigue espejado en el ajuste viejo, por si algo todavía lo lee.
  if (id === 1 && "pasos" in p) await guardarAjuste(env.CRM_DB, "seguimiento_universal", JSON.stringify(normalizarPasosSeguimiento(p.pasos))).catch(() => {});
  return json({ ok: true, plan: await completo(env.CRM_DB, id) });
}

export const onRequestGet = conAdmin(get);
export const onRequestPost = conAdmin(post);
export const onRequestPatch = conAdmin(patch);
