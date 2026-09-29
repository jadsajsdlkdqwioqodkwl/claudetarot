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

import { mandarTexto, mandarMediaGuardada, pausaEnvio, esperar } from "./crm-send.js";
import { versionesEnPrueba, sortear, registrarUso } from "./crm-variantes.js";

/**
 * `pruebas`: solo la bienvenida real (la del webhook). Si un paso tiene
 * versiones en prueba (tabla `variantes`), sale una de ellas según el reparto
 * de crm-variantes.js y queda anotado cuál salió. Las pruebas del sandbox y
 * los reenvíos a mano mandan siempre el texto original y no cuentan.
 */
export async function mandarSecuenciaBienvenida(env, conversationId, waId, sentByLabel, stepIds = null, { pruebas = false } = {}) {
  const { results: todos } = await env.CRM_DB.prepare(
    "SELECT id, step_order, body FROM welcome_steps ORDER BY step_order ASC"
  ).all();
  const pasos = stepIds ? todos.filter((p) => stepIds.includes(p.id)) : todos;

  if (!pasos.length) return 0;

  let enPrueba = {};
  if (pruebas) {
    enPrueba = await versionesEnPrueba(env.CRM_DB, "bienvenida", pasos.map((p) => p.id)).catch((err) => {
      console.error("Versiones de bienvenida:", err.message);
      return {};
    });
  }

  // La automática arranca apenas llega el mensaje del cliente: un segundo
  // antes de marcarlo leído / "escribiendo…", que pegado a su mensaje
  // WhatsApp no llegaba a mostrarlo.
  await esperar(1000);

  // Cada texto con su propio "escribiendo…" (2 s); las fotos/videos de un
  // paso van todas juntas, con 2 s de espacio antes y sin "escribiendo".
  for (const paso of pasos) {
    const media = await env.CRM_DB.prepare(
      "SELECT * FROM welcome_step_media WHERE welcome_step_id = ? ORDER BY sort_order ASC"
    )
      .bind(paso.id)
      .all();

    if (media.results.length) {
      // Sin `caption` en cada foto/video — si no, el texto del paso sale
      // repetido una vez por archivo. El texto se manda una sola vez,
      // aparte, después de que lleguen todos los archivos.
      await pausaEnvio(env, conversationId, undefined, { escribiendo: false });
      await Promise.all(media.results.map((m) =>
        mandarMediaGuardada(env, conversationId, waId, m.media_key, m.media_type, undefined, sentByLabel)
      ));
    }
    if (paso.body) {
      const versiones = enPrueba[paso.id];
      const elegida = versiones ? versiones[sortear(versiones.map((v) => v.peso))] : null;
      await pausaEnvio(env, conversationId);
      await mandarTexto(env, conversationId, waId, elegida?.texto || paso.body, sentByLabel);
      if (pruebas) {
        await registrarUso(env.CRM_DB, { tipo: "bienvenida", refId: paso.id, varianteId: elegida?.id || 0, conversationId, etapaAntes: 1, agente: sentByLabel });
      }
    }
  }

  return pasos.length;
}
