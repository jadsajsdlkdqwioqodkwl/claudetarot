/**
 * Experimentos de flujo con testers (src/lib/experimentos.js).
 *
 * GET   /api/crm/experimentos?conversation_id=N[&rapida=ID] → el brazo de ese chat para quien pregunta (asigna si
 *       corresponde): { experimento: { experimento_id, nombre, brazo, etiqueta, ocultar, destacar } | null }
 * GET   /api/crm/experimentos → (admin) { experimentos: [{ ..., metricas }] }
 * POST  /api/crm/experimentos (admin) { nombre, segmento?, reparto?, brazo_a: [ids], brazo_b: [ids], etiqueta_a?, etiqueta_b?, minimo_chats? }
 * PATCH /api/crm/experimentos (admin) { id, estado?: activo|pausado|terminado, nombre?, reparto?, brazo_a?, brazo_b?, etiqueta_a?, etiqueta_b?, minimo_chats?, solo_testers? }
 *       o { id, conversation_id, brazo: "A"|"B" } → cambia el brazo de un chat a mano (queda anotado y sale de la cuenta).
 */

import { conAuth, conAdmin } from "../../lib/crm-auth.js";
import { brazoDeChat, parsearExperimento, metricasExperimento } from "../../lib/experimentos.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const listaIds = (v) => JSON.stringify([...new Set((Array.isArray(v) ? v : []).map(Number).filter(Boolean))]);

async function get({ request, env, agent }) {
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation_id"));
  if (conversationId) {
    const ex = await brazoDeChat(env.CRM_DB, { conversationId, agentId: agent?.agentId, agente: agent?.username || null, tocoRapida: Number(url.searchParams.get("rapida")) || null }).catch(() => null);
    return json({ experimento: ex });
  }
  if (agent && agent.role !== "admin") return json({ error: "Solo el admin ve los experimentos." }, 403);
  const { results } = await env.CRM_DB.prepare("SELECT * FROM experimentos ORDER BY CASE estado WHEN 'activo' THEN 0 WHEN 'pausado' THEN 1 ELSE 2 END, id").all().catch(() => ({ results: [] }));
  const experimentos = [];
  for (const r of results || []) {
    const ex = parsearExperimento(r);
    experimentos.push({ ...ex, metricas: await metricasExperimento(env.CRM_DB, ex).catch(() => null) });
  }
  const { results: testers } = await env.CRM_DB.prepare("SELECT id, display_name FROM agents WHERE tester = 1 AND active = 1").all().catch(() => ({ results: [] }));
  return json({ experimentos, testers: testers || [] });
}

async function post({ request, env }) {
  const p = await request.json().catch(() => null);
  const nombre = String(p?.nombre || "").trim().slice(0, 80);
  if (!nombre) return json({ error: "Ponle un nombre al experimento." }, 400);
  const r = await env.CRM_DB.prepare(
    "INSERT INTO experimentos (nombre, segmento, reparto, brazo_a, brazo_b, etiqueta_a, etiqueta_b, minimo_chats, solo_testers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).bind(nombre, ["general", "lima", "provincia"].includes(p.segmento) ? p.segmento : "provincia", Math.min(1, Math.max(0, Number(p.reparto) || 0.5)),
    listaIds(p.brazo_a), listaIds(p.brazo_b), String(p.etiqueta_a || "control").slice(0, 30), String(p.etiqueta_b || "nuevo").slice(0, 30),
    Math.max(10, Number(p.minimo_chats) || 150), p.solo_testers === false ? 0 : 1).first();
  return json({ ok: true, experimento: parsearExperimento(r) });
}

async function patch({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  const id = Number(p?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  if (p.conversation_id && (p.brazo === "A" || p.brazo === "B")) {
    await env.CRM_DB.prepare("INSERT INTO experimento_chats (experimento_id, conversation_id, brazo, agente, manual) VALUES (?, ?, ?, ?, 1) ON CONFLICT(experimento_id, conversation_id) DO UPDATE SET brazo = excluded.brazo, manual = 1, agente = excluded.agente")
      .bind(id, Number(p.conversation_id), p.brazo, agent?.username || "admin").run();
    return json({ ok: true });
  }
  const sets = [], vals = [];
  if (["activo", "pausado", "terminado"].includes(p.estado)) { sets.push("estado = ?"); vals.push(p.estado); if (p.estado === "terminado") sets.push("cerrado_at = datetime('now')"); }
  if ("nombre" in p) { const n = String(p.nombre || "").trim().slice(0, 80); if (n) { sets.push("nombre = ?"); vals.push(n); } }
  if ("reparto" in p) { sets.push("reparto = ?"); vals.push(Math.min(1, Math.max(0, Number(p.reparto) || 0))); }
  if ("brazo_a" in p) { sets.push("brazo_a = ?"); vals.push(listaIds(p.brazo_a)); }
  if ("brazo_b" in p) { sets.push("brazo_b = ?"); vals.push(listaIds(p.brazo_b)); }
  if ("etiqueta_a" in p) { sets.push("etiqueta_a = ?"); vals.push(String(p.etiqueta_a || "control").slice(0, 30)); }
  if ("etiqueta_b" in p) { sets.push("etiqueta_b = ?"); vals.push(String(p.etiqueta_b || "nuevo").slice(0, 30)); }
  if ("minimo_chats" in p) { sets.push("minimo_chats = ?"); vals.push(Math.max(10, Number(p.minimo_chats) || 150)); }
  if ("solo_testers" in p) { sets.push("solo_testers = ?"); vals.push(p.solo_testers ? 1 : 0); }
  if (!sets.length) return json({ error: "Nada que cambiar." }, 400);
  await env.CRM_DB.prepare(`UPDATE experimentos SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  const r = await env.CRM_DB.prepare("SELECT * FROM experimentos WHERE id = ?").bind(id).first();
  return json({ ok: true, experimento: parsearExperimento(r) });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAdmin(post);
export const onRequestPatch = conAdmin(patch);
