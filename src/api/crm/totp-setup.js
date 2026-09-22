/**
 * 2FA con app authenticator (Google Authenticator, Authy, etc.), alternativa
 * al código por WhatsApp — cada vendedor la activa sola, gratis, sin
 * depender de que le haya escrito al negocio en las últimas 24h.
 *
 * GET    /api/crm/totp-setup — { active } → si ya la tiene confirmada
 * POST   /api/crm/totp-setup — { current_password } → genera un secreto
 *        nuevo (todavía no activo) y devuelve { secret, otpauth_url }
 * PATCH  /api/crm/totp-setup — { code } → confirma con el primer código que
 *        generó la app; recién ahí queda activa de verdad
 * DELETE /api/crm/totp-setup — { current_password } → la apaga y vuelve al
 *        código por WhatsApp
 *
 * POST y DELETE piden la contraseña actual (igual que change-password): son
 * los dos que cambian qué hace falta para entrar a la cuenta, así que no
 * alcanza con tener la cookie de sesión.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { generarSecreto, otpauthUrl, codigoValido } from "../../lib/totp.js";
import { verificarPassword } from "../../lib/password.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

function soloAgente({ agent }) {
  if (!agent?.agentId) {
    return json({ error: "No disponible en el modo de contraseña única — solo aplica a cuentas de vendedor." }, 400);
  }
  return null;
}

async function get({ env, agent }) {
  const bloqueo = soloAgente({ agent });
  if (bloqueo) return bloqueo;
  const cuenta = await env.CRM_DB.prepare("SELECT totp_confirmed FROM agents WHERE id = ?").bind(agent.agentId).first();
  return json({ active: Boolean(cuenta?.totp_confirmed) });
}

/**
 * Pide la contraseña actual antes de activar/desactivar el 2FA — igual que
 * cambiar la contraseña. Sin esto, alguien que robe la cookie de sesión
 * (XSS, navegador compartido) podría plantar su propio 2FA persistente o
 * apagar el de la víctima sin saber la contraseña.
 */
async function verificarPasswordActual(request, env, agentId) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return { error: json({ error: "Solicitud inválida." }, 400) };
  }
  const actual = String(payload?.current_password || "");
  const cuenta = await env.CRM_DB.prepare("SELECT password_hash FROM agents WHERE id = ?").bind(agentId).first();
  if (!actual || !cuenta || !(await verificarPassword(actual, cuenta.password_hash))) {
    return { error: json({ error: "La contraseña actual no es correcta." }, 401) };
  }
  return { payload };
}

async function post({ request, env, agent }) {
  const bloqueo = soloAgente({ agent });
  if (bloqueo) return bloqueo;

  const { error } = await verificarPasswordActual(request, env, agent.agentId);
  if (error) return error;

  const secreto = generarSecreto();
  await env.CRM_DB.prepare("UPDATE agents SET totp_secret = ?, totp_confirmed = 0 WHERE id = ?")
    .bind(secreto, agent.agentId)
    .run();

  const url = otpauthUrl(secreto, agent.username || "vendedor", "CRM WhatsApp");
  return json({ secret: secreto, otpauth_url: url });
}

async function patch({ request, env, agent }) {
  const bloqueo = soloAgente({ agent });
  if (bloqueo) return bloqueo;

  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const code = String(payload?.code || "").trim();
  if (!code) return json({ error: "Falta el código." }, 400);

  const cuenta = await env.CRM_DB.prepare("SELECT totp_secret FROM agents WHERE id = ?").bind(agent.agentId).first();
  if (!cuenta?.totp_secret) return json({ error: "Primero genera el código secreto (POST)." }, 400);
  if (!(await codigoValido(cuenta.totp_secret, code))) return json({ error: "Código incorrecto." }, 401);

  await env.CRM_DB.prepare("UPDATE agents SET totp_confirmed = 1 WHERE id = ?").bind(agent.agentId).run();
  return json({ ok: true });
}

async function del({ request, env, agent }) {
  const bloqueo = soloAgente({ agent });
  if (bloqueo) return bloqueo;

  const { error } = await verificarPasswordActual(request, env, agent.agentId);
  if (error) return error;

  await env.CRM_DB.prepare("UPDATE agents SET totp_secret = NULL, totp_confirmed = 0 WHERE id = ?").bind(agent.agentId).run();
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
export const onRequestDelete = conAuth(del);
