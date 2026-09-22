/**
 * POST /api/crm/forgot-password — { username } → manda un código de 6
 * dígitos por WhatsApp al número registrado de esa cuenta. Sin sesión: es
 * justo para cuando no puedes entrar. Reusa el mismo límite de intentos
 * que el login normal.
 */

import { enviarTexto } from "../../lib/whatsapp.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
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

function codigoOTP() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
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

  const username = String(payload?.username || "").trim().toLowerCase();
  if (!username) return json({ error: "Escribe tu usuario." }, 400);

  const agente = await env.CRM_DB.prepare("SELECT * FROM agents WHERE username = ? AND active = 1").bind(username).first();
  if (!agente) return json({ error: "No existe ese usuario, o está desactivado." }, 404);

  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return json({ error: "No se puede mandar el código: falta configurar WhatsApp." }, 503);
  }

  const code = codigoOTP();
  const resetId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await env.CRM_DB.prepare(
    "INSERT INTO password_resets (id, agent_id, code, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(resetId, agente.id, code, expiresAt)
    .run();

  try {
    await enviarTexto(env, agente.wa_id, `Tu código para recuperar tu contraseña del CRM es: ${code}\nVence en 15 minutos. Si no lo pediste tú, ignora este mensaje.`);
  } catch (err) {
    console.error("Forgot password WhatsApp:", err.message);
    return json({ error: "No se pudo mandar el código por WhatsApp." }, 502);
  }

  return json({ ok: true, reset_id: resetId });
}
