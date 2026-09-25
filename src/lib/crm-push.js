/**
 * Avisa a las vendedoras cuando llega algo nuevo por WhatsApp: push del
 * navegador (ver web-push.js), Telegram, o ambos, según lo que eligió cada
 * una en el CRM (agents.notify_channel). Vive aparte del webhook para no
 * mezclar la lógica de parseo de Meta con la de avisar a las vendedoras.
 */

import { suscripcionesParaAvisar, borrarSuscripcionPush, agentesConAvisoTelegram } from "./crm-db.js";
import { mandarPush } from "./web-push.js";
import { llamarTelegram, escaparHtml } from "./telegram.js";

const RESUMENES = { image: "📷 Foto", video: "🎥 Video", sticker: "Sticker", document: "📄 Documento", audio: "🎵 Audio", call: "📞 Llamada" };

const esLaAsesora = (agente, nombre) => Boolean(nombre) && (nombre === agente.display_name || nombre === agente.username);

export async function notificarMensajeNuevo(env, conversacion, contacto, { type, body, origen = null }) {
  const db = env.CRM_DB;
  const conPush = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  const conTelegram = Boolean(env.TELEGRAM_BOT_TOKEN);
  if (!conPush && !conTelegram) return; // no configurado — silencioso, no es un error del negocio

  const [suscripciones, agentesTelegram] = await Promise.all([
    conPush ? suscripcionesParaAvisar(db) : [],
    conTelegram ? agentesConAvisoTelegram(db).catch((err) => { console.error("Telegram:", err.message); return []; }) : []
  ]);

  // Las que eligieron solo Telegram (y lo tienen vinculado) no reciben push.
  // Si no vincularon, siguen con push: elegir Telegram nunca las deja sin avisos.
  const soloTelegram = agentesTelegram.filter((a) => a.notify_channel === "telegram");
  const pushes = suscripciones.filter((s) => !soloTelegram.some((a) => esLaAsesora(a, s.agent_name)));

  const titulo = contacto.profile_name || `+${contacto.wa_id}`;
  const cuerpoCompleto = (body && String(body).trim()) || RESUMENES[type] || "Mensaje nuevo";
  const cuerpo = cuerpoCompleto.length > 120 ? cuerpoCompleto.slice(0, 120) + "…" : cuerpoCompleto;

  await Promise.all([
    avisarPorPush(env, pushes, {
      title: titulo,
      body: cuerpo,
      conversation_id: conversacion.id,
      tag: `chat-${conversacion.id}` // agrupa notificaciones del mismo chat en vez de amontonar una por mensaje
    }),
    avisarPorTelegram(env, agentesTelegram, conversacion.id, titulo, cuerpo, origen)
  ]);
}

async function avisarPorPush(env, suscripciones, datos) {
  await Promise.all(
    suscripciones.map(async (sub) => {
      try {
        await mandarPush(env, sub, datos);
      } catch (err) {
        if (err.status === 404 || err.status === 410) {
          await borrarSuscripcionPush(env.CRM_DB, sub.endpoint).catch(() => {});
        } else {
          console.error("Push:", err.message);
        }
      }
    })
  );
}

async function avisarPorTelegram(env, agentes, conversationId, titulo, cuerpo, origen) {
  if (!agentes.length) return;

  const texto = `💬 <b>${escaparHtml(titulo)}</b>\n${escaparHtml(cuerpo)}`;
  const boton = origen
    ? { reply_markup: { inline_keyboard: [[{ text: "Abrir chat", url: `${origen}/crm/?chat=${conversationId}` }]] } }
    : {};

  await Promise.all(
    agentes.map((a) =>
      llamarTelegram(env, "sendMessage", { chat_id: a.telegram_chat_id, text: texto, parse_mode: "HTML", disable_web_page_preview: true, ...boton })
        .catch((err) => console.error("Telegram:", a.username, err.message))
    )
  );
}
