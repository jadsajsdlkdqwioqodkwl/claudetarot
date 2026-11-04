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
 *       - escribiendo_vivo: «escribiendo…» en vivo mientras la vendedora teclea
 *         (POST /api/crm/escribiendo). Sin valor guardado: encendido.
 *       - yape_numero: número que reemplaza {yape} en respuestas rápidas al enviarse.
 *       - seguimiento_universal: el plan universal de seguimiento (pasos como los de una respuesta
 *         rápida). Las rápidas con `followup_universal` lo usan en vez de sus pasos propios.
 * PATCH /api/crm/settings — { ad_welcome_quick_reply_id?, ad_followup_sequence_id?: number|null, ad_followup_auto?: boolean, quick_followup_auto?: boolean, sin_visto?: boolean, escribiendo_vivo?: boolean, yape_numero?: string, seguimiento_universal?: pasos[], aplicar_universal_a_rapidas?: boolean } → solo admin
 */

import { conAuth, conAdmin } from "../../lib/crm-auth.js";
import { obtenerAjuste, guardarAjuste, pasosUniversales, normalizarPasosSeguimiento } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function get({ env }) {
  const [adWelcomeQuickReplyId, adFollowupSequenceId, adFollowupAuto, quickFollowupAuto, sinVisto, escribiendoVivo, yapeNumero] = await Promise.all([
    obtenerAjuste(env.CRM_DB, "ad_welcome_quick_reply_id"),
    obtenerAjuste(env.CRM_DB, "ad_followup_sequence_id"),
    obtenerAjuste(env.CRM_DB, "ad_followup_auto"),
    obtenerAjuste(env.CRM_DB, "quick_followup_auto"),
    obtenerAjuste(env.CRM_DB, "sin_visto"),
    obtenerAjuste(env.CRM_DB, "escribiendo_vivo"),
    obtenerAjuste(env.CRM_DB, "yape_numero")
  ]);
  // El plan universal de seguimiento y cuántas respuestas rápidas lo usan / tienen seguimiento propio.
  // OJO: el orden de esta lista es el de las promesas de abajo (el 3/11 estaba cruzado y el GET fallaba: el selector de
  // planes del editor de rápidas se quedaba solo con «Universal»).
  const [seguimientoUniversal, planes, planInteresados, rapidas] = await Promise.all([
    pasosUniversales(env.CRM_DB),
    env.CRM_DB.prepare("SELECT id, nombre, segmento, activo, pasos, (SELECT json_group_array(title) FROM quick_replies q WHERE q.followup_plan_id = p.id OR (p.id = 1 AND q.followup_universal = 1 AND q.followup_plan_id IS NULL)) AS rapidas FROM planes_seguimiento p ORDER BY activo DESC, id").all()
      .then((r) => (r.results || []).map((p) => { let pasos = [], rapidas = []; try { pasos = normalizarPasosSeguimiento(JSON.parse(p.pasos || "[]")); } catch { pasos = []; } try { rapidas = JSON.parse(p.rapidas || "[]"); } catch { rapidas = []; } return { id: p.id, nombre: p.nombre, segmento: p.segmento, activo: p.activo !== 0, pasos, rapidas, interesados: false }; })).catch(() => []),
    obtenerAjuste(env.CRM_DB, "plan_interesados_id"),
    env.CRM_DB.prepare(
      "SELECT SUM(followup_universal = 1) AS universal, SUM(followup_universal = 0 AND (followup_pasos IS NOT NULL OR NULLIF(TRIM(COALESCE(followup_body, '')), '') IS NOT NULL)) AS propio FROM quick_replies"
    ).first().catch(() => ({ universal: 0, propio: 0 }))
  ]);
  return json({
    ad_welcome_quick_reply_id: adWelcomeQuickReplyId ? Number(adWelcomeQuickReplyId) : null,
    ad_followup_sequence_id: adFollowupSequenceId ? Number(adFollowupSequenceId) : null,
    ad_followup_auto: adFollowupAuto !== "0",
    quick_followup_auto: quickFollowupAuto !== "0",
    sin_visto: sinVisto === "1",
    escribiendo_vivo: escribiendoVivo !== "0",
    yape_numero: yapeNumero || "",
    seguimiento_universal: seguimientoUniversal,
    // Planes con nombre (migración 0073) para el selector del editor de rápidas, y el plan que programa la bienvenida.
    planes: planes.map((p) => ({ ...p, interesados: p.id === (Number(planInteresados) || 0) })),
    plan_interesados_id: Number(planInteresados) || null,
    rapidas_con_universal: Number(rapidas?.universal) || 0,
    rapidas_con_propio: Number(rapidas?.propio) || 0
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
  if ("escribiendo_vivo" in payload) {
    await guardarAjuste(env.CRM_DB, "escribiendo_vivo", payload.escribiendo_vivo ? "1" : "0");
  }
  if ("yape_numero" in payload) {
    await guardarAjuste(env.CRM_DB, "yape_numero", String(payload.yape_numero || "").trim().slice(0, 20));
  }
  // Plan universal de seguimiento: los mismos pasos que una respuesta rápida ({ horas, body, botones,
  // plantilla, desde, activo }), guardados una sola vez para todas las rápidas que lo usan.
  if ("seguimiento_universal" in payload) {
    const pasos = JSON.stringify(normalizarPasosSeguimiento(payload.seguimiento_universal));
    await guardarAjuste(env.CRM_DB, "seguimiento_universal", pasos);
    // Y el plan 1 «Universal» (planes_seguimiento), que es lo que de verdad se programa desde la migración 0073.
    await env.CRM_DB.prepare("UPDATE planes_seguimiento SET pasos = ?, updated_at = datetime('now') WHERE id = 1").bind(pasos).run().catch(() => {});
  }
  // Plan con nombre que programa la bienvenida de anuncios en vez de la secuencia de interesados vieja (null = la vieja).
  if ("plan_interesados_id" in payload) {
    await guardarAjuste(env.CRM_DB, "plan_interesados_id", payload.plan_interesados_id ? String(Number(payload.plan_interesados_id)) : "");
  }
  // true: todas las rápidas que tienen seguimiento pasan a usar el plan universal; false: vuelven a sus pasos propios.
  if ("aplicar_universal_a_rapidas" in payload) {
    await (payload.aplicar_universal_a_rapidas
      ? env.CRM_DB.prepare("UPDATE quick_replies SET followup_universal = 1 WHERE followup_pasos IS NOT NULL OR NULLIF(TRIM(COALESCE(followup_body, '')), '') IS NOT NULL OR followup_universal = 1")
      : env.CRM_DB.prepare("UPDATE quick_replies SET followup_universal = 0")).run();
  }
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPatch = conAdmin(patch);
