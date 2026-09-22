/** POST /api/crm/reset-password — { reset_id, code, new_password } → cambia la contraseña sin sesión activa. */

import { hashPassword } from "../../lib/password.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const MAX_INTENTOS = 5;

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const resetId = String(payload?.reset_id || "");
  const code = String(payload?.code || "").trim();
  const nueva = String(payload?.new_password || "");
  if (!resetId || !code) return json({ error: "Falta el código." }, 400);
  if (nueva.length < 8) return json({ error: "La contraseña nueva necesita al menos 8 caracteres." }, 422);

  const reset = await env.CRM_DB.prepare("SELECT * FROM password_resets WHERE id = ?").bind(resetId).first();
  if (!reset || reset.used || reset.attempts >= MAX_INTENTOS || new Date(reset.expires_at) < new Date()) {
    return json({ error: "El código venció o se agotaron los intentos. Pide uno nuevo." }, 401);
  }

  if (reset.code !== code) {
    await env.CRM_DB.prepare("UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?").bind(resetId).run();
    return json({ error: "Código incorrecto." }, 401);
  }

  await env.CRM_DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(resetId).run();

  const passwordHash = await hashPassword(nueva);
  await env.CRM_DB.prepare("UPDATE agents SET password_hash = ? WHERE id = ?").bind(passwordHash, reset.agent_id).run();

  return json({ ok: true });
}
