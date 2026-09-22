/** POST /api/crm/login — { password } → cookie de sesión de 12h. */

import { crearCookieSesion } from "../../lib/crm-auth.js";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });

export async function onRequestPost({ request, env }) {
  if (!env.CRM_PASSWORD) {
    return json({ error: "El CRM no está configurado (falta CRM_PASSWORD)." }, 503);
  }

  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const password = String(payload?.password || "");
  if (password.length !== env.CRM_PASSWORD.length || password !== env.CRM_PASSWORD) {
    return json({ error: "Contraseña incorrecta." }, 401);
  }

  const cookie = await crearCookieSesion(env);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
