/**
 * GET   /api/crm/settings — ajustes generales del CRM:
 *       - ad_welcome_quick_reply_id: respuesta rápida de bienvenida automática
 *         para contactos que vienen de un anuncio (hoy sin uso — la
 *         bienvenida real vive en /api/crm/welcome-sequence).
 *       - ad_followup_sequence_id: la "secuencia para leads" (de
 *         /api/crm/followup-sequences). Los vendedores la ven y la aplican
 *         con un botón desde el panel derecho de cada chat.
 *       - ad_followup_auto: si además se programa sola en cada contacto
 *         NUEVO que escribe por primera vez desde un anuncio "Click to
 *         WhatsApp". Sin valor guardado cuenta como encendido (así se
 *         comportaba antes de existir este ajuste).
 *       - quick_followup_auto: si las respuestas rápidas con seguimiento lo
 *         programan al mandarlas. Sin valor guardado cuenta como encendido.
 *       - sin_visto: si está encendido, nunca se marca como leído (doble check
 *         azul) lo que manda el cliente. Los vistos del cliente a nuestros
 *         mensajes se siguen viendo igual. Sin valor guardado: apagado.
 * PATCH /api/crm/settings — { ad_welcome_quick_reply_id?, ad_followup_sequence_id?: number|null, ad_followup_auto?: boolean, quick_followup_auto?: boolean, sin_visto?: boolean } → solo admin
 */

import { conAuth, conAdmin } from "../../lib/crm-auth.js";
import { obtenerAjuste, guardarAjuste } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const [adWelcomeQuickReplyId, adFollowupSequenceId, adFollowupAuto, quickFollowupAuto, sinVisto] = await Promise.all([
    obtenerAjuste(env.CRM_DB, "ad_welcome_quick_reply_id"),
    obtenerAjuste(env.CRM_DB, "ad_followup_sequence_id"),
    obtenerAjuste(env.CRM_DB, "ad_followup_auto"),
    obtenerAjuste(env.CRM_DB, "quick_followup_auto"),
    obtenerAjuste(env.CRM_DB, "sin_visto")
  ]);
  return json({
    ad_welcome_quick_reply_id: adWelcomeQuickReplyId ? Number(adWelcomeQuickReplyId) : null,
    ad_followup_sequence_id: adFollowupSequenceId ? Number(adFollowupSequenceId) : null,
    ad_followup_auto: adFollowupAuto !== "0",
    quick_followup_auto: quickFollowupAuto !== "0",
    sin_visto: sinVisto === "1"
  });
}

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  if ("ad_welcome_quick_reply_id" in payload) {
    const id = payload.ad_welcome_quick_reply_id;
    await guardarAjuste(env.CRM_DB, "ad_welcome_quick_reply_id", id ? String(Number(id)) : "");
  }
  if ("ad_followup_sequence_id" in payload) {
    const id = payload.ad_followup_sequence_id;
    await guardarAjuste(env.CRM_DB, "ad_followup_sequence_id", id ? String(Number(id)) : "");
  }
  if ("ad_followup_auto" in payload) {
    await guardarAjuste(env.CRM_DB, "ad_followup_auto", payload.ad_followup_auto ? "1" : "0");
  }
  if ("quick_followup_auto" in payload) {
    await guardarAjuste(env.CRM_DB, "quick_followup_auto", payload.quick_followup_auto ? "1" : "0");
  }
  if ("sin_visto" in payload) {
    await guardarAjuste(env.CRM_DB, "sin_visto", payload.sin_visto ? "1" : "0");
  }
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPatch = conAdmin(patch);
