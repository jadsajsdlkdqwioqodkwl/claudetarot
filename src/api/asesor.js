/**
 * POST /api/asesor/avisos — la puerta por la que el asesor (la Routine de
 * Claude Code que lee los chats 3 veces al día) les avisa a las vendedoras.
 *
 * Existe para que la Routine no necesite el token del bot: el Worker ya lo
 * tiene, y además sabe qué vendedora atiende cada chat y si vinculó su
 * Telegram en el CRM. Cada "Manda este mensaje" le llega a la asesora
 * asignada (y a las que comparten el chat); si nadie tiene Telegram
 * vinculado, al chat del dueño (TELEGRAM_CHAT_ID).
 *
 * Autenticación: cabecera `x-asesor-clave`. El Worker solo guarda su SHA-256
 * (ASESOR_CLAVE_SHA256, en wrangler.jsonc): la clave en sí vive únicamente en
 * el prompt de la Routine. Lo peor que se puede hacer con ella es mandar
 * avisos al Telegram del propio equipo.
 *
 * Cuerpo (todo opcional):
 *   { resumen: "texto", pdf_base64: "...", pdf_nombre: "pedidos.pdf",
 *     solo_dueno: true,   // informes (CRO): van solo al dueño
 *     mensajes: [{ whatsapp, nombre, motivo, mensaje }] }
 */

import { llamarTelegram, escaparHtml } from "../lib/telegram.js";

const MAX_MENSAJES = 80;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function igualesSinFiltrar(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function autorizado(request, env) {
  const esperado = String(env.ASESOR_CLAVE_SHA256 || "").toLowerCase();
  const clave = request.headers.get("x-asesor-clave") || "";
  if (!esperado || clave.length < 24) return false;
  return igualesSinFiltrar(await sha256Hex(clave), esperado);
}

async function dentroDelLimite(env, ip) {
  if (!env.LOGIN_LIMIT || !ip) return true;
  try {
    return (await env.LOGIN_LIMIT.limit({ key: `asesor:${ip}` })).success;
  } catch {
    return true;
  }
}

const lista = (texto) => String(texto || "").split("\n").map((s) => s.trim()).filter(Boolean);

/** A quién le toca este chat: la asignada y las que lo comparten, con Telegram vinculado. */
export function destinatarios(conv, agentes, chatDueno) {
  const nombres = new Set([conv?.assigned_agent, ...lista(conv?.shared_with)].filter(Boolean));
  const chats = agentes
    .filter((a) => a.telegram_chat_id && (nombres.has(a.display_name) || nombres.has(a.username)))
    .map((a) => String(a.telegram_chat_id));
  if (!chats.length && chatDueno) chats.push(String(chatDueno));
  return [...new Set(chats)];
}

export function textoAviso(m) {
  const wa = String(m.whatsapp || "").replace(/\D/g, "");
  return (
    `✍️ <b>Manda este mensaje</b> a ${escaparHtml(m.nombre || "sin nombre")} (+${escaparHtml(wa)})\n` +
    (m.motivo ? `<i>${escaparHtml(m.motivo)}</i>\n` : "") +
    `\n<code>${escaparHtml(m.mensaje || "")}</code>\n\n<i>Toca el texto para copiarlo.</i>`
  );
}

async function mandarPdf(env, chatId, base64, nombre, resumen) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_PDF_BYTES) throw new Error("PDF demasiado grande");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (resumen) form.append("caption", String(resumen).slice(0, 1000));
  form.append("document", new Blob([bytes], { type: "application/pdf" }), nombre || "pedidos.pdf");
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimite(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizado(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.TELEGRAM_BOT_TOKEN || !env.CRM_DB) return json({ error: "Falta TELEGRAM_BOT_TOKEN o la base del CRM." }, 503);

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "JSON inválido." }, 400);
  const dueno = env.TELEGRAM_CHAT_ID;
  const origen = new URL(request.url).origin;
  const res = { enviados: 0, fallidos: [], a_dueno: 0 };

  if (payload.pdf_base64) {
    try {
      await mandarPdf(env, dueno, payload.pdf_base64, payload.pdf_nombre, payload.resumen);
      res.enviados++;
    } catch (err) {
      res.fallidos.push({ que: "pdf", error: err.message });
    }
  } else if (payload.resumen) {
    try {
      await llamarTelegram(env, "sendMessage", { chat_id: dueno, text: String(payload.resumen).slice(0, 4000), disable_web_page_preview: true });
      res.enviados++;
    } catch (err) {
      res.fallidos.push({ que: "resumen", error: err.message });
    }
  }

  const mensajes = Array.isArray(payload.mensajes) ? payload.mensajes.slice(0, MAX_MENSAJES) : [];
  if (!mensajes.length) return json(res);

  const { results: agentes } = await env.CRM_DB.prepare(
    "SELECT display_name, username, telegram_chat_id FROM agents WHERE active = 1 AND telegram_chat_id IS NOT NULL"
  ).all();

  for (const m of mensajes) {
    const wa = String(m?.whatsapp || "").replace(/\D/g, "");
    if (wa.length < 9 || !m.mensaje) {
      res.fallidos.push({ whatsapp: wa, error: "falta número o mensaje" });
      continue;
    }
    const conv = await env.CRM_DB.prepare(
      `SELECT conv.id, conv.assigned_agent, conv.shared_with FROM conversations conv
       JOIN contacts c ON c.id = conv.contact_id
       WHERE c.wa_id LIKE ? ORDER BY conv.last_message_at DESC LIMIT 1`
    )
      .bind(`%${wa.slice(-9)}`)
      .first();
    const chats = payload.solo_dueno ? [String(dueno)] : destinatarios(conv, agentes, dueno);
    const boton = conv
      ? { reply_markup: { inline_keyboard: [[{ text: "💬 Abrir chat en el CRM", url: `${origen}/crm/?chat=${conv.id}` }]] } }
      : {};
    for (const chatId of chats) {
      try {
        await llamarTelegram(env, "sendMessage", {
          chat_id: chatId, text: textoAviso(m), parse_mode: "HTML", disable_web_page_preview: true, ...boton
        });
        res.enviados++;
        if (chatId === String(dueno)) res.a_dueno++;
      } catch (err) {
        res.fallidos.push({ whatsapp: wa, error: err.message });
      }
    }
  }
  return json(res);
}
