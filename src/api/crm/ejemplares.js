/**
 * Chats ejemplares (dueño, 2026-11-04): banco de conocimiento chico. El admin marca un chat con un título y notas
 * («desconfiado que al final compró: así se le respondió», «pide el pedido para hoy»); el equipo lo ve en
 * Herramientas → Chats ejemplares y el asesor lo recibe en su contexto (/api/asesor/contexto → ejemplares).
 *
 * GET    /api/crm/ejemplares                → { ejemplares: [{ id, conversation_id, wa_id, nombre, titulo, notas, created_by, updated_at }] }
 * GET    /api/crm/ejemplares?conversation_id=N → { ejemplar: {...} | null }
 * POST   /api/crm/ejemplares (admin) { conversation_id, titulo, notas? } → crea o actualiza (uno por chat)
 * DELETE /api/crm/ejemplares (admin) { id }
 */
import { conAuth, conAdmin } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const SELECT = `SELECT e.id, e.conversation_id, c.wa_id, COALESCE(c.name, c.profile_name) AS nombre, e.titulo, e.notas, e.created_by, e.updated_at
  FROM chats_ejemplares e JOIN conversations conv ON conv.id = e.conversation_id JOIN contacts c ON c.id = conv.contact_id`;

async function get({ request, env }) {
  const conversationId = Number(new URL(request.url).searchParams.get("conversation_id"));
  if (conversationId) {
    const e = await env.CRM_DB.prepare(`${SELECT} WHERE e.conversation_id = ?`).bind(conversationId).first().catch(() => null);
    return json({ ejemplar: e || null });
  }
  const { results } = await env.CRM_DB.prepare(`${SELECT} ORDER BY e.updated_at DESC LIMIT 200`).all().catch(() => ({ results: [] }));
  return json({ ejemplares: results || [] });
}

async function post({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  const conversationId = Number(p?.conversation_id);
  const titulo = String(p?.titulo || "").trim().slice(0, 120);
  if (!conversationId || !titulo) return json({ error: "Faltan conversation_id o titulo." }, 400);
  const notas = String(p?.notas || "").trim().slice(0, 4000) || null;
  await env.CRM_DB.prepare(
    `INSERT INTO chats_ejemplares (conversation_id, titulo, notas, created_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET titulo = excluded.titulo, notas = excluded.notas, updated_at = datetime('now')`
  ).bind(conversationId, titulo, notas, agent?.displayName || agent?.username || null).run();
  const e = await env.CRM_DB.prepare(`${SELECT} WHERE e.conversation_id = ?`).bind(conversationId).first();
  return json({ ok: true, ejemplar: e });
}

async function del({ request, env }) {
  const p = await request.json().catch(() => null);
  const id = Number(p?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  await env.CRM_DB.prepare("DELETE FROM chats_ejemplares WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAdmin(post);
export const onRequestDelete = conAdmin(del);
