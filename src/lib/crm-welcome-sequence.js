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

import { mandarTexto, mandarMediaGuardada, pausaEnvio, esperar, prepararMedias, PAUSA_BIENVENIDA_MS } from "./crm-send.js";
import { versionesEnPrueba, elegirVersion, registrarUso } from "./crm-variantes.js";

/**
 * La bienvenida de cada producto (welcome_steps.producto_id, 0045): un chat
 * con producto recibe la suya; si ese producto no tiene pasos propios, la
 * general solo en la línea principal (la general es la de Tarot Store). Un
 * chat sin producto, la general (producto_id NULL).
 */
async function pasosDelChat(env, conversationId, todos) {
  const conv = await env.CRM_DB.prepare("SELECT producto_id, linea_id FROM conversations WHERE id = ?")
    .bind(conversationId).first().catch(() => null);
  const generales = todos.filter((p) => !p.producto_id);
  if (!conv?.producto_id) return conv?.linea_id ? [] : generales;
  const propios = todos.filter((p) => p.producto_id === conv.producto_id);
  return propios.length ? propios : conv.linea_id ? [] : generales;
}

/**
 * `pruebas`: solo la bienvenida real (la del webhook). Si un paso tiene
 * versiones en prueba (tabla `variantes`), sale una de ellas según el reparto
 * de crm-variantes.js y queda anotado cuál salió. Las pruebas del sandbox y
 * los reenvíos a mano mandan siempre el texto original y no cuentan.
 */
export async function mandarSecuenciaBienvenida(env, conversationId, waId, sentByLabel, stepIds = null, { pruebas = false, ultimoWaId } = {}) {
  // Con el id del mensaje del cliente a mano, el "escribiendo…" no gasta una consulta por paso.
  // Rapidito (decisión del dueño): "escribiendo…" de 1 s por texto, sin espacio entre mensajes.
  const escribiendo = ultimoWaId ? { ultimoWaId, rapido: true } : { rapido: true };
  const { results: todos } = await env.CRM_DB.prepare(
    "SELECT * FROM welcome_steps ORDER BY step_order ASC"
  ).all();
  const pasos = stepIds ? todos.filter((p) => stepIds.includes(p.id)) : await pasosDelChat(env, conversationId, todos);

  if (!pasos.length) return 0;

  // Las versiones se leen siempre: la ⭐ predeterminada sale también en el
  // sandbox y en los reenvíos a mano (ahí sin sorteo y sin contar para la prueba).
  const enPrueba = await versionesEnPrueba(env.CRM_DB, "bienvenida", pasos.map((p) => p.id)).catch((err) => {
    console.error("Versiones de bienvenida:", err.message);
    return {};
  });
  const elegir = (vs) => (pruebas ? elegirVersion(vs) : vs.find((v) => v.predeterminada) || null);

  // Todas las fotos/videos de la secuencia, en una sola consulta.
  const marcas = pasos.map(() => "?").join(",");
  const { results: todasMedias } = await env.CRM_DB.prepare(
    `SELECT * FROM welcome_step_media WHERE welcome_step_id IN (${marcas}) ORDER BY sort_order ASC, id ASC`
  ).bind(...pasos.map((p) => p.id)).all();
  const mediasDe = (id) => todasMedias.filter((m) => m.welcome_step_id === id);

  // La automática arranca apenas llega el mensaje del cliente: medio segundo
  // antes de marcarlo leído / "escribiendo…", que pegado a su mensaje
  // WhatsApp no llegaba a mostrarlo. Mientras, se dejan listas en WhatsApp
  // (en paralelo, o ya guardadas de antes) todas las fotos/videos: después
  // salen seguidas, sin esperar a subirlas una por una.
  const unicaMedia = Object.values(enPrueba).flat().filter((v) => v.unico && v.media_key).map((v) => v.media_key);
  await Promise.all([esperar(500), prepararMedias(env, [...todasMedias.map((m) => m.media_key), ...unicaMedia])]);

  // Versión "en un solo mensaje": si salió sorteada una versión `unico` del
  // primer paso, reemplaza TODA la secuencia (su foto/video, si tiene, y su
  // texto) y los demás pasos no se mandan.
  const primero = pasos[0];
  const vPrimero = enPrueba[primero.id];
  const elegidaPrimero = vPrimero ? elegir(vPrimero) : null;
  if (elegidaPrimero?.unico) {
    if (elegidaPrimero.media_key) {
      await mandarMediaGuardada(env, conversationId, waId, elegidaPrimero.media_key, elegidaPrimero.media_type || "image", undefined, sentByLabel);
    }
    await pausaEnvio(env, conversationId, PAUSA_BIENVENIDA_MS, escribiendo);
    await mandarTexto(env, conversationId, waId, elegidaPrimero.texto, sentByLabel);
    if (pruebas) await registrarUso(env.CRM_DB, { tipo: "bienvenida", refId: primero.id, varianteId: elegidaPrimero.id, conversationId, etapaAntes: 1, agente: sentByLabel });
    return 1;
  }

  // Fotos y videos al toque, en el orden elegido; cada texto con su propio
  // "escribiendo…" (1 s). Por defecto primero las fotos y después el
  // texto del paso; con `texto_primero`, al revés.
  for (const paso of pasos) {
    // Sin `caption` en cada foto/video — si no, el texto del paso sale
    // repetido una vez por archivo. El texto se manda una sola vez, aparte.
    const mandarFotos = async () => {
      for (const m of mediasDe(paso.id)) {
        await mandarMediaGuardada(env, conversationId, waId, m.media_key, m.media_type, undefined, sentByLabel);
      }
    };
    if (!paso.texto_primero) await mandarFotos();
    if (paso.body) {
      // El primer paso ya se sorteó arriba; los demás, aquí. Las versiones
      // "únicas" solo valen como primer paso: en otro paso no se eligen.
      const versiones = enPrueba[paso.id]?.filter((v) => !v.unico);
      const elegida = paso.id === primero.id ? elegidaPrimero : versiones?.length ? elegir(versiones) : null;
      await pausaEnvio(env, conversationId, PAUSA_BIENVENIDA_MS, escribiendo);
      await mandarTexto(env, conversationId, waId, elegida?.texto || paso.body, sentByLabel);
      if (pruebas) {
        await registrarUso(env.CRM_DB, { tipo: "bienvenida", refId: paso.id, varianteId: elegida?.id || 0, conversationId, etapaAntes: 1, agente: sentByLabel });
      }
    }
    if (paso.texto_primero) await mandarFotos();
  }

  return pasos.length;
}
