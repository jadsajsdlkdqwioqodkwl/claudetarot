/**
 * POST /api/crm/login — { password, code } → cookie de sesión de 12h.
 *
 * Si `CRM_TOTP_SECRET` está configurado, además de la contraseña pide el
 * código de 6 dígitos del autenticador (Google Authenticator, Authy…). Sin
 * ese secret, el 2FA queda apagado y solo pide la contraseña.
 */

import { crearCookieSesion } from "../../lib/crm-auth.js";
import { codigoValido } from "../../lib/totp.js";

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

  if (env.CRM_TOTP_SECRET) {
    const codigo = String(payload?.code || "").trim();
    if (!codigo) return json({ error: "Falta el código de 6 dígitos.", requiere2FA: true }, 401);
    if (!(await codigoValido(env.CRM_TOTP_SECRET, codigo))) {
      return json({ error: "Código incorrecto.", requiere2FA: true }, 401);
    }
  }

  const cookie = await crearCookieSesion(env);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
