/**
 * GET    /api/crm/push-subscribe — la clave pública VAPID, para que el
 *        navegador arme la suscripción.
 * POST   /api/crm/push-subscribe { subscription } — guarda/actualiza la
 *        suscripción de este navegador para mandarle notificaciones.
 * DELETE /api/crm/push-subscribe { endpoint } — la borra (se apagó el
 *        interruptor, o el navegador avisó que ya no es válida).
 */

import { conAuth } from "../../lib/crm-auth.js";
import { guardarSuscripcionPush, borrarSuscripcionPush } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const sub = payload?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ error: "Suscripción inválida." }, 400);

  await guardarSuscripcionPush(env.CRM_DB, agent?.displayName || agent?.username || null, sub);
  return json({ ok: true });
}

async function del({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  if (!payload?.endpoint) return json({ error: "Falta endpoint." }, 400);
  await borrarSuscripcionPush(env.CRM_DB, payload.endpoint);
  return json({ ok: true });
}

async function get({ env }) {
  if (!env.VAPID_PUBLIC_KEY) return json({ error: "Notificaciones push no configuradas." }, 503);
  return json({ key: env.VAPID_PUBLIC_KEY });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestDelete = conAuth(del);
