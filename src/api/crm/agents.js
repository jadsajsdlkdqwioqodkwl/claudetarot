/**
 * GET    /api/crm/agents — lista los vendedores (sin el hash de contraseña).
 * POST   /api/crm/agents — { username, password, display_name, wa_id } → crea uno.
 * PATCH  /api/crm/agents — { id, active } → activa/desactiva (no se borra, por el historial de mensajes).
 *
 * Cualquier sesión válida puede administrar el equipo — no hay un rol
 * "admin" separado todavía. Si hace falta restringirlo más adelante, es la
 * próxima pieza.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { hashPassword } from "../../lib/password.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare(
    "SELECT id, username, display_name, wa_id, active, created_at FROM agents ORDER BY id ASC"
  ).all();
  return json({ agents: results });
}

async function post({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const username = String(payload?.username || "").trim().toLowerCase().slice(0, 40);
  const password = String(payload?.password || "");
  const displayName = String(payload?.display_name || "").trim().slice(0, 80);
  const waId = String(payload?.wa_id || "").replace(/\D/g, "");

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json({ error: "Usuario inválido (letras, números, 3-40 caracteres)." }, 422);
  if (password.length < 8) return json({ error: "La contraseña necesita al menos 8 caracteres." }, 422);
  if (!displayName) return json({ error: "Falta el nombre." }, 400);
  if (waId.length < 9) return json({ error: "El WhatsApp del vendedor no es válido (con código de país, sin +)." }, 422);

  const existente = await env.CRM_DB.prepare("SELECT id FROM agents WHERE username = ?").bind(username).first();
  if (existente) return json({ error: "Ese usuario ya existe." }, 409);

  const passwordHash = await hashPassword(password);
  const creado = await env.CRM_DB.prepare(
    "INSERT INTO agents (username, password_hash, display_name, wa_id) VALUES (?, ?, ?, ?) RETURNING id, username, display_name, wa_id, active, created_at"
  )
    .bind(username, passwordHash, displayName, waId)
    .first();

  return json({ ok: true, agent: creado });
}

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const id = Number(payload?.id);
  if (!id) return json({ error: "Falta id." }, 400);

  await env.CRM_DB.prepare("UPDATE agents SET active = ? WHERE id = ?").bind(payload?.active ? 1 : 0, id).run();
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
