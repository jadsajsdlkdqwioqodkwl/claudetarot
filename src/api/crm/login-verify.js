/**
 * POST /api/crm/login-verify — { challenge_id, code } → cookie de sesión,
 * para el modo de cuentas por vendedor.
 *
 * Máximo 5 intentos por código: al agotarlos, el challenge queda inválido
 * aunque no haya vencido el plazo de 5 minutos — sin esto, un código de 6
 * dígitos (1 en un millón) se podría adivinar a fuerza bruta.
 */

import { crearCookieSesion } from "../../lib/crm-auth.js";

const MAX_INTENTOS = 5;

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });

async function dentroDelLimite(env, ip) {
  if (!env.LOGIN_LIMIT || !ip) return true;
  try {
    const { success } = await env.LOGIN_LIMIT.limit({ key: ip });
    return success;
  } catch {
    return true;
  }
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await dentroDelLimite(env, ip))) {
    return json({ error: "Demasiados intentos. Espera un minuto." }, 429);
  }

  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const challengeId = String(payload?.challenge_id || "");
  const code = String(payload?.code || "").trim();
  if (!challengeId || !code) return json({ error: "Falta el código." }, 400);

  const challenge = await env.CRM_DB.prepare("SELECT * FROM login_challenges WHERE id = ?").bind(challengeId).first();
  if (!challenge || challenge.used || challenge.attempts >= MAX_INTENTOS || new Date(challenge.expires_at) < new Date()) {
    return json({ error: "El código venció o se agotaron los intentos. Vuelve a iniciar sesión." }, 401);
  }

  if (challenge.code !== code) {
    await env.CRM_DB.prepare("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challengeId).run();
    return json({ error: "Código incorrecto." }, 401);
  }

  await env.CRM_DB.prepare("UPDATE login_challenges SET used = 1 WHERE id = ?").bind(challengeId).run();

  const agente = await env.CRM_DB.prepare("SELECT * FROM agents WHERE id = ?").bind(challenge.agent_id).first();
  if (!agente || !agente.active) return json({ error: "Cuenta desactivada." }, 401);

  const cookie = await crearCookieSesion(env, agente);
  return json({ ok: true, display_name: agente.display_name }, 200, { "Set-Cookie": cookie });
}
