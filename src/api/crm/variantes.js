/**
 * Pruebas de mensajes (solo admin): versiones del texto de una respuesta
 * rápida o de un paso de la bienvenida. Ver crm-variantes.js.
 *
 * GET    /api/crm/variantes?tipo=rapida|bienvenida&ref_id=N
 *        → { original, versiones: [{ id (0 = original), texto, usos,
 *            respondieron, avanzaron, cerraron, editadas, peso, origen, motivo }] }
 *        Sin ref_id: todas las pruebas en curso de ese tipo.
 * POST   { tipo, ref_id, texto, motivo? } → agrega una versión a la prueba
 * PATCH  { tipo, ref_id, ganadora } → cierra la prueba: `ganadora` (id, 0 =
 *        la original) queda como el texto de siempre y las demás se retiran
 * DELETE { id } → retira una sola versión
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { versionesEnPrueba, estadisticas, cerrarPrueba } from "../../lib/crm-variantes.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const TABLAS = { rapida: "quick_replies", bienvenida: "welcome_steps" };
const quien = (agent) => agent?.displayName || agent?.username || "admin";

async function get({ request, env }) {
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  if (!TABLAS[tipo]) return json({ error: "tipo inválido." }, 400);
  const refId = Number(url.searchParams.get("ref_id")) || null;
  const pruebas = await versionesEnPrueba(env.CRM_DB, tipo, refId ? [refId] : null);
  if (!refId) return json({ pruebas });

  const actual = await env.CRM_DB.prepare(`SELECT body FROM ${TABLAS[tipo]} WHERE id = ?`).bind(refId).first();
  if (!actual) return json({ error: "No encontrado." }, 404);
  let versiones = pruebas[refId];
  if (!versiones) {
    // Sin prueba en curso: igual se muestran los números de la original.
    const [n] = await estadisticas(env.CRM_DB, tipo, [refId]);
    versiones = [{ id: 0, texto: null, usos: n?.usos || 0, respondieron: n?.respondieron || 0, avanzaron: n?.avanzaron || 0, cerraron: n?.cerraron || 0, editadas: n?.editadas || 0, peso: 1 }];
  }
  return json({ original: actual.body || "", versiones });
}

async function post({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  const refId = Number(p?.ref_id);
  const texto = String(p?.texto || "").trim().slice(0, 4096);
  if (!TABLAS[p?.tipo] || !refId || !texto) return json({ error: "Falta tipo, ref_id o texto." }, 400);
  const existe = await env.CRM_DB.prepare(`SELECT 1 FROM ${TABLAS[p.tipo]} WHERE id = ?`).bind(refId).first();
  if (!existe) return json({ error: "No encontrado." }, 404);
  const { n } = await env.CRM_DB.prepare("SELECT COUNT(*) AS n FROM variantes WHERE tipo = ? AND ref_id = ? AND estado = 'activa'").bind(p.tipo, refId).first();
  if (n >= 3) return json({ error: "Ya hay 3 versiones en prueba: cierra o quita una antes (con más, ninguna junta datos suficientes)." }, 409);
  await env.CRM_DB.prepare("INSERT INTO variantes (tipo, ref_id, texto, origen, motivo) VALUES (?, ?, ?, ?, ?)")
    .bind(p.tipo, refId, texto, quien(agent), String(p.motivo || "").slice(0, 300) || null)
    .run();
  return json({ ok: true });
}

async function patch({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  const refId = Number(p?.ref_id);
  if (!TABLAS[p?.tipo] || !refId) return json({ error: "Falta tipo o ref_id." }, 400);
  try {
    await cerrarPrueba(env.CRM_DB, p.tipo, refId, Number(p.ganadora) || 0, quien(agent));
  } catch (err) {
    return json({ error: err.message }, 409);
  }
  return json({ ok: true });
}

async function del({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  const id = Number(p?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  await env.CRM_DB.prepare("UPDATE variantes SET estado = 'retirada', cerrada_at = datetime('now'), cerrada_por = ? WHERE id = ? AND estado = 'activa'")
    .bind(quien(agent), id)
    .run();
  return json({ ok: true });
}

export const onRequestGet = conAdmin(get);
export const onRequestPost = conAdmin(post);
export const onRequestPatch = conAdmin(patch);
export const onRequestDelete = conAdmin(del);
