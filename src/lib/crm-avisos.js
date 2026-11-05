/**
 * El único aviso por Telegram que queda de las recomendaciones: "hay
 * recomendaciones nuevas", a todo el equipo con Telegram vinculado y al
 * dueño, con un botón a ✨ Sugerencias. Antes llegaba un mensaje por cada
 * propuesta (y el resumen y las pruebas por separado): demasiados.
 *
 * Como mucho uno cada ESPACIO_MIN minutos, y solo si hay algo pendiente.
 */

import { llamarTelegram } from "./telegram.js";
import { limpiarSugerenciasViejas } from "./crm-sugerencias.js";
import { enSilencio } from "./horario.js";
import { obtenerAjuste, guardarAjuste } from "./crm-db.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";
const ESPACIO_MIN = 60;

export async function notificarRecomendaciones(env) {
  const db = env.CRM_DB;
  if (!db || !env.TELEGRAM_BOT_TOKEN) return { enviados: 0 };
  const ultimo = await db.prepare("SELECT value FROM crm_settings WHERE key = 'aviso_recomendaciones_at'").first();
  if (ultimo?.value && Date.now() - Number(ultimo.value) < ESPACIO_MIN * 60 * 1000) return { enviados: 0, omitido: "reciente" };

  await limpiarSugerenciasViejas(db, env).catch(() => {});
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM asesor_sugerencias WHERE estado = 'pendiente' AND tipo != 'envio'").first();
  if (!n) return { enviados: 0 };

  const { results: agentes } = await db.prepare(
    "SELECT telegram_chat_id FROM agents WHERE active = 1 AND telegram_chat_id IS NOT NULL"
  ).all();
  const chats = new Set(agentes.map((a) => String(a.telegram_chat_id)));
  if (env.TELEGRAM_CHAT_ID) chats.add(String(env.TELEGRAM_CHAT_ID));

  let enviados = 0;
  for (const chatId of chats) {
    try {
      await llamarTelegram(env, "sendMessage", {
        chat_id: chatId,
        // Sin número: cada persona ve otra cantidad (las pruebas y los saldos son solo del admin / Shalom).
        text: "✨ Hay nuevas recomendaciones listas para revisar y enviar en el CRM.",
        reply_markup: { inline_keyboard: [[{ text: "✨ Ver recomendaciones", url: `${SITIO}/crm/?sugerencias=1` }]] }
      });
      enviados++;
    } catch (err) {
      console.error("Aviso de recomendaciones:", err.message);
    }
  }
  await db.prepare("INSERT INTO crm_settings (key, value) VALUES ('aviso_recomendaciones_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(String(Date.now()))
    .run();
  return { enviados };
}

/**
 * «Nadie está respondiendo» (dueño, 2026-11-04): cada 10 min, si hay chats de la línea principal cuyo último mensaje es
 * del cliente desde hace más de N minutos (ajuste `aviso_sin_respuesta_min`, 10 por defecto) y NADIE del equipo ha
 * escrito nada a mano en ese lapso, avisa al dueño por Telegram (solo a él). Como mucho uno por hora, y solo dentro del
 * horario de envío. `aviso_sin_respuesta` en 0 lo apaga.
 */
export async function avisarSinRespuesta(env) {
  const db = env.CRM_DB;
  if (!db || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { enviados: 0 };
  if ((await obtenerAjuste(db, "aviso_sin_respuesta").catch(() => null)) === "0") return { enviados: 0, omitido: "apagado" };
  if (enSilencio(Date.now(), env.HORARIO_ENVIO)) return { enviados: 0, omitido: "fuera de horario" };
  const min = Math.max(3, Number(await obtenerAjuste(db, "aviso_sin_respuesta_min").catch(() => null)) || 10);
  const ultimo = Number(await obtenerAjuste(db, "aviso_sin_respuesta_at").catch(() => null)) || 0;
  if (Date.now() - ultimo < ESPACIO_MIN * 60 * 1000) return { enviados: 0, omitido: "reciente" };
  // ¿Alguien del equipo escribió a mano en los últimos N minutos? Entonces sí están respondiendo.
  const humano = await db.prepare(
    `SELECT 1 FROM messages m JOIN conversations conv ON conv.id = m.conversation_id
     WHERE m.direction = 'out' AND m.created_at >= datetime('now', ?) AND COALESCE(conv.linea_id, 0) = 0
       AND m.sent_by IS NOT NULL AND m.sent_by NOT LIKE '%utom%' AND m.sent_by NOT LIKE 'Plan %' AND m.sent_by NOT LIKE 'Seguimiento%'
       AND m.sent_by NOT LIKE 'Envío masivo%' AND m.sent_by NOT LIKE 'Toque%' AND m.sent_by NOT LIKE 'asesor%' LIMIT 1`
  ).bind(`-${min} minutes`).first();
  if (humano) return { enviados: 0, omitido: "alguien responde" };
  const r = await db.prepare(
    `SELECT COUNT(*) AS n, MIN(conv.last_inbound_at) AS mas_antiguo FROM conversations conv
     JOIN messages lm ON lm.id = (SELECT MAX(id) FROM messages WHERE conversation_id = conv.id)
     WHERE lm.direction = 'in' AND COALESCE(conv.linea_id, 0) = 0 AND COALESCE(conv.blocked, 0) = 0 AND COALESCE(conv.hidden, 0) = 0
       AND (conv.atendido_at IS NULL OR conv.atendido_at < conv.last_inbound_at)
       AND conv.last_inbound_at < datetime('now', ?) AND conv.last_inbound_at > datetime('now', '-6 hours')`
  ).bind(`-${min} minutes`).first();
  if (!r?.n) return { enviados: 0 };
  const esperaMin = Math.round((Date.now() - new Date(String(r.mas_antiguo).replace(" ", "T") + "Z").getTime()) / 60000);
  await llamarTelegram(env, "sendMessage", {
    chat_id: String(env.TELEGRAM_CHAT_ID),
    text: `⚠️ Nadie está respondiendo chats: ${r.n} chat${r.n === 1 ? "" : "s"} con el cliente esperando más de ${min} min (el más antiguo lleva ${esperaMin} min) y ninguna vendedora escribió en ese lapso.`,
    reply_markup: { inline_keyboard: [[{ text: "Abrir el CRM", url: `${SITIO}/crm/` }]] }
  });
  await guardarAjuste(db, "aviso_sin_respuesta_at", String(Date.now()));
  return { enviados: 1, chats: r.n };
}
