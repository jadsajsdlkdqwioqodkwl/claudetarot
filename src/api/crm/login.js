/**
 * POST /api/crm/login
 *
 * Modo cuentas por vendedor (si existe al menos un agente activo):
 *   { username, password } → manda un código de 6 dígitos por WhatsApp al
 *   número del vendedor y responde { requiere2FA: true, challenge_id }.
 *   El login se completa en /api/crm/login-verify.
 *
 * Modo compatibilidad (sin agentes creados todavía):
 *   { password, code? } → la contraseña única de siempre (+ TOTP si
 *   CRM_TOTP_SECRET está configurado). Así no se corta el acceso mientras
 *   se crea la primera cuenta de vendedor.
 */

import { crearCookieSesion } from "../../lib/crm-auth.js";
import { codigoValido } from "../../lib/totp.js";
import { verificarPassword } from "../../lib/password.js";
import { enviarTexto } from "../../lib/whatsapp.js";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });

async function hayAgentes(env) {
  const fila = await env.CRM_DB?.prepare("SELECT COUNT(*) AS n FROM agents WHERE active = 1").first();
  return (fila?.n || 0) > 0;
}

function codigoOTP() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

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

  if (await hayAgentes(env)) {
    const username = String(payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    if (!username || !password) return json({ error: "Falta usuario o contraseña." }, 400);

    const agente = await env.CRM_DB.prepare("SELECT * FROM agents WHERE username = ? AND active = 1").bind(username).first();
    if (!agente || !(await verificarPassword(password, agente.password_hash))) {
      return json({ error: "Usuario o contraseña incorrectos." }, 401);
    }

    if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      return json({ error: "No se puede mandar el código: falta configurar WhatsApp." }, 503);
    }

    const code = codigoOTP();
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await env.CRM_DB.prepare(
      "INSERT INTO login_challenges (id, agent_id, code, expires_at) VALUES (?, ?, ?, ?)"
    )
      .bind(challengeId, agente.id, code, expiresAt)
      .run();

    try {
      await enviarTexto(env, agente.wa_id, `Tu código de acceso al CRM es: ${code}\nVence en 5 minutos.`);
    } catch (err) {
      console.error("OTP WhatsApp:", err.message);
      return json({ error: "No se pudo mandar el código por WhatsApp." }, 502);
    }

    return json({ requiere2FA: true, challenge_id: challengeId });
  }

  // Modo compatibilidad: contraseña única.
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
