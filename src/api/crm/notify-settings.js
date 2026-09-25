/**
 * Por dónde le llegan los avisos de mensajes nuevos a cada asesora: push del
 * navegador, Telegram o ambos. Usa el mismo bot de los avisos de pedidos
 * (TELEGRAM_BOT_TOKEN).
 *
 * GET  /api/crm/notify-settings — canal elegido y si Telegram está vinculado.
 * POST /api/crm/notify-settings
 *   { channel: "push" | "telegram" | "ambos" } — cambia el canal.
 *   { action: "link" }   — genera el código y devuelve el link t.me/<bot>?start=<código>.
 *   { action: "check" }  — busca ese /start en getUpdates y guarda el chat.
 *   { action: "test" }   — manda un mensaje de prueba al chat vinculado.
 *   { action: "unlink" } — desvincula y vuelve a push.
 *
 * Sin webhook del bot a propósito: la vinculación se confirma leyendo
 * getUpdates cuando la asesora toca "Ya lo hice", así el Worker no recibe
 * ni un request por cada cosa que alguien le escriba al bot.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { llamarTelegram } from "../../lib/telegram.js";

const CANALES = ["push", "telegram", "ambos"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function leerAgente(db, id) {
  return db.prepare("SELECT id, notify_channel, telegram_chat_id, telegram_link_code FROM agents WHERE id = ?").bind(id).first();
}

const estadoDe = (env, agente) => ({
  available: Boolean(env.TELEGRAM_BOT_TOKEN),
  channel: agente.notify_channel || "push",
  linked: Boolean(agente.telegram_chat_id)
});

async function get({ env, agent }) {
  if (!agent?.agentId) return json({ error: "Solo para cuentas de vendedor." }, 400);
  const agente = await leerAgente(env.CRM_DB, agent.agentId);
  if (!agente) return json({ error: "No encontré tu cuenta." }, 404);
  return json(estadoDe(env, agente));
}

/** Lee los /start pendientes del bot, vincula a quien corresponda y los marca como leídos. */
async function procesarStarts(env) {
  let updates;
  try {
    updates = await llamarTelegram(env, "getUpdates", { timeout: 0, allowed_updates: ["message"] });
  } catch (err) {
    if (err.status === 409) {
      throw Object.assign(new Error("El bot tiene un webhook configurado y no se puede leer el /start. Hay que quitarlo (deleteWebhook) para vincular."), { status: 409 });
    }
    throw err;
  }
  if (!updates.length) return;

  for (const u of updates) {
    const m = String(u.message?.text || "").match(/^\/start\s+([A-Za-z0-9_-]{8,64})$/);
    const chatId = u.message?.chat?.id;
    if (!m || !chatId) continue;
    const agente = await env.CRM_DB.prepare("SELECT id, notify_channel FROM agents WHERE telegram_link_code = ?").bind(m[1]).first();
    if (!agente) continue;
    // Recién vinculada, que ya le lleguen: de 'push' pasa a 'ambos'.
    const canal = agente.notify_channel === "push" ? "ambos" : agente.notify_channel;
    await env.CRM_DB.prepare("UPDATE agents SET telegram_chat_id = ?, telegram_link_code = NULL, notify_channel = ? WHERE id = ?")
      .bind(String(chatId), canal, agente.id)
      .run();
    await llamarTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: "✅ Listo, desde ahora te llegan acá los mensajes nuevos del CRM."
    }).catch(() => {});
  }

  // El offset confirma todo lo leído: Telegram deja de devolverlo.
  const ultimo = Math.max(...updates.map((u) => u.update_id));
  await llamarTelegram(env, "getUpdates", { offset: ultimo + 1, timeout: 0, limit: 1 }).catch(() => {});
}

async function post({ request, env, agent }) {
  if (!agent?.agentId) return json({ error: "Solo para cuentas de vendedor." }, 400);
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const db = env.CRM_DB;
  let agente = await leerAgente(db, agent.agentId);
  if (!agente) return json({ error: "No encontré tu cuenta." }, 404);

  if (payload.channel !== undefined) {
    if (!CANALES.includes(payload.channel)) return json({ error: "Canal inválido." }, 400);
    if (payload.channel !== "push" && !agente.telegram_chat_id) return json({ error: "Primero vincula tu Telegram." }, 400);
    await db.prepare("UPDATE agents SET notify_channel = ? WHERE id = ?").bind(payload.channel, agente.id).run();
    return json(estadoDe(env, { ...agente, notify_channel: payload.channel }));
  }

  if (!env.TELEGRAM_BOT_TOKEN) return json({ error: "El bot de Telegram no está configurado." }, 503);

  try {
    switch (payload.action) {
      case "link": {
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        const codigo = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
        await db.prepare("UPDATE agents SET telegram_link_code = ? WHERE id = ?").bind(codigo, agente.id).run();
        const bot = await llamarTelegram(env, "getMe");
        return json({ url: `https://t.me/${bot.username}?start=${codigo}` });
      }
      case "check": {
        await procesarStarts(env);
        agente = await leerAgente(db, agente.id);
        return json(estadoDe(env, agente));
      }
      case "test": {
        if (!agente.telegram_chat_id) return json({ error: "Primero vincula tu Telegram." }, 400);
        await llamarTelegram(env, "sendMessage", { chat_id: agente.telegram_chat_id, text: "🔔 Prueba del CRM: los avisos por Telegram funcionan." });
        return json({ ok: true });
      }
      case "unlink": {
        await db.prepare("UPDATE agents SET telegram_chat_id = NULL, telegram_link_code = NULL, notify_channel = 'push' WHERE id = ?").bind(agente.id).run();
        return json(estadoDe(env, { ...agente, telegram_chat_id: null, notify_channel: "push" }));
      }
      default:
        return json({ error: "Acción desconocida." }, 400);
    }
  } catch (err) {
    // 403 de Telegram en el envío = la asesora bloqueó o borró el bot.
    const mensaje = err.status === 403 ? "Telegram rechazó el envío: ¿bloqueaste el bot? Desvincula y vuelve a vincular." : err.message;
    return json({ error: mensaje }, err.status === 409 ? 409 : 502);
  }
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
