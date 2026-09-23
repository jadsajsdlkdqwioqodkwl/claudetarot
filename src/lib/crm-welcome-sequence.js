/**
 * Manda la secuencia de bienvenida completa (`welcome_sequence`) a una
 * conversación, un paso detrás del otro, en orden — las fotos de un mismo
 * paso van en paralelo, pero un paso espera a que termine el anterior para
 * que lleguen en el orden que armó el admin.
 *
 * Siempre texto libre, nunca plantilla. Cuando la dispara
 * `mandarBienvenidaSiAplica` (contacto nuevo con ctwa_clid), responder acá
 * dentro del primer minuto es justo lo que abre el free entry point de 72h
 * de Meta — ver docs/whatsapp-ventanas-y-costos.md.
 */

import { mandarTexto, mandarMediaGuardada } from "./crm-send.js";

export async function mandarSecuenciaBienvenida(env, conversationId, waId, sentByLabel) {
  const { results: pasos } = await env.CRM_DB.prepare(
    "SELECT id, step_order, body FROM welcome_steps ORDER BY step_order ASC"
  ).all();

  if (!pasos.length) return 0;

  for (const paso of pasos) {
    const media = await env.CRM_DB.prepare(
      "SELECT * FROM welcome_step_media WHERE welcome_step_id = ? ORDER BY sort_order ASC"
    )
      .bind(paso.id)
      .all();

    if (media.results.length) {
      await Promise.all(media.results.map((m) =>
        mandarMediaGuardada(env, conversationId, waId, m.media_key, m.media_type, paso.body, sentByLabel)
      ));
    } else if (paso.body) {
      await mandarTexto(env, conversationId, waId, paso.body, sentByLabel);
    }
  }

  return pasos.length;
}
