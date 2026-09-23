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

import { mandarTexto, mandarMediaGuardada, pausaEnvio } from "./crm-send.js";

export async function mandarSecuenciaBienvenida(env, conversationId, waId, sentByLabel, stepIds = null) {
  const { results: todos } = await env.CRM_DB.prepare(
    "SELECT id, step_order, body FROM welcome_steps ORDER BY step_order ASC"
  ).all();
  const pasos = stepIds ? todos.filter((p) => stepIds.includes(p.id)) : todos;

  if (!pasos.length) return 0;

  for (const paso of pasos) {
    await pausaEnvio();
    const media = await env.CRM_DB.prepare(
      "SELECT * FROM welcome_step_media WHERE welcome_step_id = ? ORDER BY sort_order ASC"
    )
      .bind(paso.id)
      .all();

    if (media.results.length) {
      // Sin `caption` en cada foto/video — si no, el texto del paso sale
      // repetido una vez por archivo. El texto se manda una sola vez,
      // aparte, después de que lleguen todos los archivos.
      await Promise.all(media.results.map((m) =>
        mandarMediaGuardada(env, conversationId, waId, m.media_key, m.media_type, undefined, sentByLabel)
      ));
      if (paso.body) {
        await mandarTexto(env, conversationId, waId, paso.body, sentByLabel);
      }
    } else if (paso.body) {
      await mandarTexto(env, conversationId, waId, paso.body, sentByLabel);
    }
  }

  return pasos.length;
}
