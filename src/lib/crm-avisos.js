/**
 * El único aviso por Telegram que queda de las recomendaciones: "hay
 * recomendaciones nuevas", a todo el equipo con Telegram vinculado y al
 * dueño, con un botón a ✨ Sugerencias. Antes llegaba un mensaje por cada
 * propuesta (y el resumen y las pruebas por separado): demasiados.
 *
 * Como mucho uno cada ESPACIO_MIN minutos; el número es lo que está
 * pendiente en ese momento, así no se pierde nada si uno se salta.
 */

import { llamarTelegram } from "./telegram.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";
const ESPACIO_MIN = 60;

export async function notificarRecomendaciones(env) {
  const db = env.CRM_DB;
  if (!db || !env.TELEGRAM_BOT_TOKEN) return { enviados: 0 };
  const ultimo = await db.prepare("SELECT value FROM crm_settings WHERE key = 'aviso_recomendaciones_at'").first();
  if (ultimo?.value && Date.now() - Number(ultimo.value) < ESPACIO_MIN * 60 * 1000) return { enviados: 0, omitido: "reciente" };

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
        text: `✨ Hay ${n} recomendacion${n === 1 ? "" : "es"} lista${n === 1 ? "" : "s"} para revisar y enviar en el CRM.`,
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
