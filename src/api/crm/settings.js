/**
 * GET   /api/crm/settings — ajustes generales del CRM (hoy: la respuesta
 *       rápida de bienvenida automática para contactos que vienen de un anuncio)
 * PATCH /api/crm/settings — { ad_welcome_quick_reply_id: number|null } → solo admin
 */

import { conAuth, conAdmin } from "../../lib/crm-auth.js";
import { obtenerAjuste, guardarAjuste } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const adWelcomeQuickReplyId = await obtenerAjuste(env.CRM_DB, "ad_welcome_quick_reply_id");
  return json({ ad_welcome_quick_reply_id: adWelcomeQuickReplyId ? Number(adWelcomeQuickReplyId) : null });
}

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const id = payload?.ad_welcome_quick_reply_id;
  await guardarAjuste(env.CRM_DB, "ad_welcome_quick_reply_id", id ? String(Number(id)) : "");
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPatch = conAdmin(patch);
