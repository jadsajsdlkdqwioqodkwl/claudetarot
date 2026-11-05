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
 * «Nadie está respondiendo» (dueño, 2026-11-04, precisado el 5/11): cada 10 min, si en los últimos N minutos (ajuste
 * `aviso_sin_respuesta_min`, 10) llegaron mensajes de clientes a la línea principal y NINGUNA persona del equipo escribió nada a
 * mano en ese lapso (en ningún chat), avisa al dueño por Telegram (solo a él). No es «hay chats sin responder» (a un «gracias»
 * de un cliente antiguo nadie tiene por qué contestar): es «el equipo está ausente». Sin falsos positivos: si no escribió
 * ningún cliente, no avisa; de 00:00 a 07:00 (Lima) no avisa. Como mucho dos por hora (ajuste `aviso_sin_respuesta_cada_min`,
 * 30). Le llega al dueño (TELEGRAM_CHAT_ID) y a las personas del ajuste `aviso_sin_respuesta_agentes` (ids de agents con
 * Telegram vinculado; por defecto Jennifer, id 4). `aviso_sin_respuesta` en 0 lo apaga.
 */
export async function avisarSinRespuesta(env) {
  const db = env.CRM_DB;
  if (!db || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { enviados: 0 };
  if ((await obtenerAjuste(db, "aviso_sin_respuesta").catch(() => null)) === "0") return { enviados: 0, omitido: "apagado" };
  const horaLima = (new Date(Date.now() - 5 * 3600 * 1000)).getUTCHours();
  if (horaLima < 7) return { enviados: 0, omitido: "madrugada" };
  const min = Math.max(3, Number(await obtenerAjuste(db, "aviso_sin_respuesta_min").catch(() => null)) || 10);
  const ultimo = Number(await obtenerAjuste(db, "aviso_sin_respuesta_at").catch(() => null)) || 0;
  const cadaMin = Math.max(10, Number(await obtenerAjuste(db, "aviso_sin_respuesta_cada_min").catch(() => null)) || 30);
  if (Date.now() - ultimo < cadaMin * 60 * 1000) return { enviados: 0, omitido: "reciente" };
  // ¿Escribió algún cliente en esos minutos? Si no, no hay nada que responder y no se avisa.
  const clientes = await db.prepare(
    `SELECT COUNT(DISTINCT m.conversation_id) AS n FROM messages m JOIN conversations conv ON conv.id = m.conversation_id
     WHERE m.direction = 'in' AND m.created_at >= datetime('now', ?) AND COALESCE(conv.linea_id, 0) = 0 AND COALESCE(conv.blocked, 0) = 0`
  ).bind(`-${min} minutes`).first();
  if (!clientes?.n) return { enviados: 0, omitido: "sin clientes escribiendo" };
  // ¿Alguien del equipo escribió a mano (en cualquier chat) en esos minutos? Entonces están presentes.
  const humano = await db.prepare(
    `SELECT 1 FROM messages m JOIN conversations conv ON conv.id = m.conversation_id
     WHERE m.direction = 'out' AND m.created_at >= datetime('now', ?) AND COALESCE(conv.linea_id, 0) = 0
       AND m.sent_by IS NOT NULL AND m.sent_by NOT LIKE '%utom%' AND m.sent_by NOT LIKE 'Plan %' AND m.sent_by NOT LIKE 'Seguimiento%'
       AND m.sent_by NOT LIKE 'Envío masivo%' AND m.sent_by NOT LIKE 'Toque%' AND m.sent_by NOT LIKE 'asesor%' AND m.sent_by NOT LIKE 'Sugerencia%' LIMIT 1`
  ).bind(`-${min} minutes`).first();
  if (humano) return { enviados: 0, omitido: "alguien responde" };
  // A quién: el dueño y las personas del ajuste (por defecto Jennifer, id 4), si tienen Telegram vinculado.
  const idsAgentes = String((await obtenerAjuste(db, "aviso_sin_respuesta_agentes").catch(() => null)) ?? "4").split(",").map((x) => Number(x.trim())).filter(Boolean);
  const chats = new Set([String(env.TELEGRAM_CHAT_ID)]);
  if (idsAgentes.length) {
    const { results } = await db.prepare(`SELECT telegram_chat_id FROM agents WHERE active = 1 AND telegram_chat_id IS NOT NULL AND id IN (${idsAgentes.map(() => "?").join(",")})`).bind(...idsAgentes).all().catch(() => ({ results: [] }));
    for (const a of results || []) chats.add(String(a.telegram_chat_id));
  }
  let enviados = 0;
  for (const chatId of chats) {
    try {
      await llamarTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Nadie del equipo ha escrito en los últimos ${min} min y ${clientes.n} cliente${clientes.n === 1 ? "" : "s"} escribi${clientes.n === 1 ? "ó" : "eron"} en ese lapso.`,
        reply_markup: { inline_keyboard: [[{ text: "Abrir el CRM", url: `${SITIO}/crm/` }]] }
      });
      enviados++;
    } catch (err) { console.error("Aviso sin respuesta:", err.message); }
  }
  await guardarAjuste(db, "aviso_sin_respuesta_at", String(Date.now()));
  return { enviados, clientes: clientes.n };
}
