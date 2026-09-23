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
  if (!env.CRM_PASSWORD) {
    return json({ error: "El CRM no está configurado (falta CRM_PASSWORD)." }, 503);
  }

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

  if (await hayAgentes(env)) {
    const username = String(payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    if (!username || !password) return json({ error: "Falta usuario o contraseña." }, 400);

    const agente = await env.CRM_DB.prepare("SELECT * FROM agents WHERE username = ? AND active = 1").bind(username).first();
    if (!agente || !(await verificarPassword(password, agente.password_hash))) {
      return json({ error: "Usuario o contraseña incorrectos." }, 401);
    }

    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Con la app authenticator activada no hace falta mandar nada por
    // WhatsApp: el código lo genera la app del vendedor, offline.
    if (agente.totp_confirmed) {
      await env.CRM_DB.prepare(
        "INSERT INTO login_challenges (id, agent_id, code, expires_at, method) VALUES (?, ?, '', ?, 'totp')"
      )
        .bind(challengeId, agente.id, expiresAt)
        .run();
      return json({ requiere2FA: true, challenge_id: challengeId, metodo2FA: "totp" });
    }

    if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      return json({ error: "No se puede mandar el código: falta configurar WhatsApp." }, 503);
    }

    const code = codigoOTP();
    await env.CRM_DB.prepare(
      "INSERT INTO login_challenges (id, agent_id, code, expires_at, method) VALUES (?, ?, ?, ?, 'whatsapp')"
    )
      .bind(challengeId, agente.id, code, expiresAt)
      .run();

    try {
      await enviarTexto(env, agente.wa_id, `Tu código de acceso al CRM es: ${code}\nVence en 5 minutos.`);
    } catch (err) {
      console.error("OTP WhatsApp:", err.message);
      // El motivo real de Meta importa acá — el típico es "más de 24h desde
      // que escribiste" (el texto libre solo funciona dentro de esa ventana,
      // aunque el vendedor SÍ le haya escrito al negocio, si fue hace más de
      // un día). Antes esto se perdía en el console.error y a la vendedora
      // solo le llegaba un "no se pudo mandar" genérico, imposible de
      // diagnosticar sin acceso a los logs del Worker.
      return json({ error: `No se pudo mandar el código por WhatsApp: ${err.message}` }, 502);
    }

    return json({ requiere2FA: true, challenge_id: challengeId, metodo2FA: "whatsapp" });
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
