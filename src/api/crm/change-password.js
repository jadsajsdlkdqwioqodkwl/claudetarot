/**
 * POST /api/crm/change-password — { current_password, new_password }
 * Cualquier vendedora cambia su propia contraseña (no hace falta ser admin
 * para esto — admin solo hace falta para resetear la de otra persona).
 * No disponible en el modo de contraseña única (no hay una "cuenta propia").
 */

import { conAuth, crearCookieSesion } from "../../lib/crm-auth.js";
import { verificarPassword, hashPassword } from "../../lib/password.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ request, env, agent }) {
  if (!agent?.agentId) {
    return json({ error: "No disponible en el modo de contraseña única — solo aplica a cuentas de vendedor." }, 400);
  }

  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const actual = String(payload?.current_password || "");
  const nueva = String(payload?.new_password || "");
  if (nueva.length < 8) return json({ error: "La contraseña nueva necesita al menos 8 caracteres." }, 422);

  const cuenta = await env.CRM_DB.prepare("SELECT * FROM agents WHERE id = ?").bind(agent.agentId).first();
  if (!cuenta || !(await verificarPassword(actual, cuenta.password_hash))) {
    return json({ error: "La contraseña actual no es correcta." }, 401);
  }

  const passwordHash = await hashPassword(nueva);
  await env.CRM_DB.prepare("UPDATE agents SET password_hash = ? WHERE id = ?").bind(passwordHash, agent.agentId).run();

  // La contraseña nueva invalida todas las sesiones abiertas (ver crm-auth.js);
  // este dispositivo recibe una cookie nueva para no tener que volver a entrar.
  const cookie = await crearCookieSesion(env, { ...cuenta, password_hash: passwordHash });
  const respuesta = json({ ok: true });
  respuesta.headers.append("Set-Cookie", cookie);
  return respuesta;
}

export const onRequestPost = conAuth(post);
