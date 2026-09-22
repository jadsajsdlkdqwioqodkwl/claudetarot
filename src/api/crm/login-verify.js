/** POST /api/crm/login-verify — { challenge_id, code } → cookie de sesión, para el modo de cuentas por vendedor. */

import { crearCookieSesion } from "../../lib/crm-auth.js";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });

export async function onRequestPost({ request, env }) {
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
  if (!challenge || challenge.used || new Date(challenge.expires_at) < new Date()) {
    return json({ error: "El código venció. Vuelve a iniciar sesión." }, 401);
  }
  if (challenge.code !== code) {
    return json({ error: "Código incorrecto." }, 401);
  }

  await env.CRM_DB.prepare("UPDATE login_challenges SET used = 1 WHERE id = ?").bind(challengeId).run();

  const agente = await env.CRM_DB.prepare("SELECT * FROM agents WHERE id = ?").bind(challenge.agent_id).first();
  if (!agente || !agente.active) return json({ error: "Cuenta desactivada." }, 401);

  const cookie = await crearCookieSesion(env, agente);
  return json({ ok: true, display_name: agente.display_name }, 200, { "Set-Cookie": cookie });
}
