/**
 * GET    /api/crm/agents — lista los vendedores (sin el hash de contraseña). Cualquier sesión.
 * POST   /api/crm/agents — { username, password, display_name, wa_id, role? } → crea uno. Solo admin.
 * PATCH  /api/crm/agents — { id, active?, new_password?, reset_totp? } → activa/desactiva, resetea contraseña
 *        o apaga el 2FA con app (por si perdió el celular y quedó sin poder entrar). Solo admin.
 *
 * Crear o administrar vendedores es cosa de administradores: así no puede
 * cualquiera con sesión abierta crearse una cuenta nueva para otra persona.
 */

import { conAuth, conAdmin } from "../../lib/crm-auth.js";
import { hashPassword } from "../../lib/password.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const ROLES = new Set(["admin", "vendedor"]);

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare(
    "SELECT id, username, display_name, wa_id, role, active, created_at FROM agents ORDER BY id ASC"
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
  const role = ROLES.has(payload?.role) ? payload.role : "vendedor";

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json({ error: "Usuario inválido (letras, números, 3-40 caracteres)." }, 422);
  if (password.length < 8) return json({ error: "La contraseña necesita al menos 8 caracteres." }, 422);
  if (!displayName) return json({ error: "Falta el nombre." }, 400);
  if (waId.length < 9) return json({ error: "El WhatsApp del vendedor no es válido (con código de país, sin +)." }, 422);

  const existente = await env.CRM_DB.prepare("SELECT id FROM agents WHERE username = ?").bind(username).first();
  if (existente) return json({ error: "Ese usuario ya existe." }, 409);

  const passwordHash = await hashPassword(password);
  const creado = await env.CRM_DB.prepare(
    "INSERT INTO agents (username, password_hash, display_name, wa_id, role) VALUES (?, ?, ?, ?, ?) RETURNING id, username, display_name, wa_id, role, active, created_at"
  )
    .bind(username, passwordHash, displayName, waId, role)
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

  if (typeof payload?.active === "boolean") {
    await env.CRM_DB.prepare("UPDATE agents SET active = ? WHERE id = ?").bind(payload.active ? 1 : 0, id).run();
  }

  if (typeof payload?.new_password === "string" && payload.new_password) {
    if (payload.new_password.length < 8) return json({ error: "La contraseña necesita al menos 8 caracteres." }, 422);
    const passwordHash = await hashPassword(payload.new_password);
    await env.CRM_DB.prepare("UPDATE agents SET password_hash = ? WHERE id = ?").bind(passwordHash, id).run();
  }

  if (payload?.reset_totp === true) {
    await env.CRM_DB.prepare("UPDATE agents SET totp_secret = NULL, totp_confirmed = 0 WHERE id = ?").bind(id).run();
  }

  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAdmin(post);
export const onRequestPatch = conAdmin(patch);
