/**
 * POST /api/asesor/avisos — la puerta por la que el asesor (la Routine de
 * Claude Code que lee los chats 3 veces al día) les avisa a las vendedoras.
 *
 * Existe para que la Routine no necesite el token del bot: el Worker ya lo
 * tiene, y además sabe qué vendedora atiende cada chat y si vinculó su
 * Telegram en el CRM. Cada "Manda este mensaje" le llega a todo el equipo
 * con Telegram vinculado y al dueño (TELEGRAM_CHAT_ID), marcando a quién le
 * toca: "Te toca a ti" para la asignada, "Copia" para las demás.
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
import { aprendizaje } from "./asesor-datos.js";

// Cada aviso va a todo el equipo: con el tope de 50 llamadas por request del
// plan gratis de Cloudflare, enviar.py los manda de a 5.
const MAX_MENSAJES = 8;
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

export async function autorizadoAsesor(request, env) {
  return autorizado(request, env);
}

export async function dentroDelLimiteAsesor(env, ip) {
  return dentroDelLimite(env, ip);
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

/**
 * A quién le llega cada aviso: a TODAS las que vincularon Telegram y al dueño
 * (copia para todo el equipo), marcando a quién le toca. Le toca a la
 * asignada y a las que comparten el chat; si nadie lo tiene asignado, a
 * cualquiera que lo tome.
 */
export function destinatarios(conv, agentes, chatDueno) {
  const nombres = new Set([conv?.assigned_agent, ...lista(conv?.shared_with)].filter(Boolean));
  const salida = new Map();
  for (const a of agentes) {
    if (!a.telegram_chat_id) continue;
    const id = String(a.telegram_chat_id);
    const leToca = nombres.has(a.display_name) || nombres.has(a.username);
    salida.set(id, { chatId: id, leToca: leToca || salida.get(id)?.leToca || false });
  }
  if (chatDueno && !salida.has(String(chatDueno))) salida.set(String(chatDueno), { chatId: String(chatDueno), leToca: false });
  return [...salida.values()];
}

export function textoAviso(m, { asignada, leToca }) {
  const wa = String(m.whatsapp || "").replace(/\D/g, "");
  const quien = leToca ? "👉 <b>Te toca a ti</b>" : asignada ? `👀 Copia · le toca a <b>${escaparHtml(asignada)}</b>` : "🙋 Sin asignar · puede tomarlo cualquiera";
  return (
    `✍️ <b>Manda este mensaje</b> a ${escaparHtml(m.nombre || "sin nombre")} (+${escaparHtml(wa)})\n` +
    `${quien}\n` +
    (m.motivo ? `<i>${escaparHtml(m.motivo)}</i>\n` : "") +
    `\n<code>${escaparHtml(m.mensaje || "")}</code>\n\n<i>Toca el texto para copiarlo y el botón para abrir el chat.</i>`
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
    const para = payload.solo_dueno ? [{ chatId: String(dueno), leToca: false }] : destinatarios(conv, agentes, dueno);
    const asignada = [conv?.assigned_agent, ...lista(conv?.shared_with)].filter(Boolean).join(", ");
    // Con el chat encontrado, el botón lo abre por id; si no, por número.
    const url = conv ? `${origen}/crm/?chat=${conv.id}` : `${origen}/crm/?wa=${wa}`;
    const boton = { reply_markup: { inline_keyboard: [[
      { text: "💬 Abrir chat", url },
      { text: "✨ Ver sugerencias", url: `${origen}/crm/?sugerencias=1` }
    ]] } };
    for (const { chatId, leToca } of para) {
      try {
        await llamarTelegram(env, "sendMessage", {
          chat_id: chatId, text: textoAviso(m, { asignada, leToca }), parse_mode: "HTML", disable_web_page_preview: true, ...boton
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

/**
 * POST /api/asesor/sugerencias — la Routine deja propuestas que esperan a una
 * persona en ✨ Sugerencias del CRM. No manda nada al cliente.
 *
 * { origen: "asesor 16:30",
 *   sugerencias: [
 *     { tipo: "seguimiento", whatsapp, nombre, motivo, texto },
 *     { tipo: "envio", whatsapp, nombre, motivo, texto, link },   // boleta lista: solo la ve el admin

 *     { tipo: "respuesta_rapida", titulo, texto, motivo,
 *       destinatarios: [{ whatsapp, nombre }] } ] }
 *
 * Un chat tiene a lo sumo un seguimiento pendiente: si ya había uno, se
 * reemplaza el texto (la propuesta más nueva sabe más del chat).
 */
async function convDe(env, wa) {
  if (wa.length < 9) return null;
  return env.CRM_DB.prepare(
    `SELECT conv.id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id
     WHERE c.wa_id LIKE ? ORDER BY conv.last_message_at DESC LIMIT 1`
  )
    .bind(`%${wa.slice(-9)}`)
    .first();
}

export async function onRequestPostSugerencias({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimite(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizado(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB) return json({ error: "Falta la base del CRM." }, 503);

  const payload = await request.json().catch(() => null);
  const lista = Array.isArray(payload?.sugerencias) ? payload.sugerencias.slice(0, 60) : [];
  const origen = String(payload?.origen || "asesor").slice(0, 60);
  const res = { creadas: 0, actualizadas: 0, sin_chat: [] };

  for (const s of lista) {
    const texto = String(s?.texto || "").trim().slice(0, 4096);
    if (!texto) continue;
    const motivo = String(s.motivo || "").slice(0, 300) || null;

    if (s.tipo === "respuesta_rapida") {
      const titulo = String(s.titulo || "").trim().slice(0, 80);
      if (!titulo) continue;
      const destinatarios = [];
      for (const d of (Array.isArray(s.destinatarios) ? s.destinatarios : []).slice(0, 50)) {
        const wa = String(d?.whatsapp || "").replace(/\D/g, "");
        const conv = await convDe(env, wa);
        if (conv) destinatarios.push({ conversation_id: conv.id, wa_id: wa, nombre: String(d.nombre || "").slice(0, 80) });
        else if (wa) res.sin_chat.push(wa);
      }
      await env.CRM_DB.prepare(
        "INSERT INTO asesor_sugerencias (tipo, titulo, texto, texto_original, motivo, destinatarios, origen) VALUES ('respuesta_rapida', ?, ?, ?, ?, ?, ?)"
      )
        .bind(titulo, texto, texto, motivo, JSON.stringify(destinatarios), origen)
        .run();
      res.creadas++;
      continue;
    }

    const tipo = s.tipo === "envio" ? "envio" : "seguimiento";
    const link = tipo === "envio" ? String(s.link || "").slice(0, 200) || null : null;
    const wa = String(s.whatsapp || "").replace(/\D/g, "");
    const conv = await convDe(env, wa);
    if (!conv) {
      res.sin_chat.push(wa);
      continue;
    }
    const previa = await env.CRM_DB.prepare(
      "SELECT id FROM asesor_sugerencias WHERE conversation_id = ? AND tipo = ? AND estado = 'pendiente'"
    )
      .bind(conv.id, tipo)
      .first();
    if (previa) {
      await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ?, texto_original = ?, motivo = ?, origen = ?, titulo = COALESCE(?, titulo), created_at = datetime('now') WHERE id = ?")
        .bind(texto, texto, motivo, origen, link, previa.id)
        .run();
      res.actualizadas++;
    } else {
      await env.CRM_DB.prepare(
        "INSERT INTO asesor_sugerencias (tipo, conversation_id, wa_id, nombre, titulo, texto, texto_original, motivo, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(tipo, conv.id, wa, String(s.nombre || "").slice(0, 80), link, texto, texto, motivo, origen)
        .run();
      res.creadas++;
    }
  }
  return json(res);
}

/**
 * GET /api/asesor/contexto — lo que la Routine necesita saber del negocio en
 * vivo: las respuestas rápidas vigentes (el texto exacto que usan las
 * vendedoras), las sugerencias que siguen pendientes (para no repetirlas) y
 * el aprendizaje: cómo le fue a lo que propuso antes y su memoria.
 */
export async function onRequestGetContexto({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimite(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizado(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB) return json({ error: "Falta la base del CRM." }, 503);
  const [rapidas, pendientes] = await Promise.all([
    env.CRM_DB.prepare("SELECT id, title, body FROM quick_replies ORDER BY id").all(),
    env.CRM_DB.prepare(
      "SELECT tipo, wa_id, nombre, titulo, substr(texto, 1, 300) AS texto, origen, created_at FROM asesor_sugerencias WHERE estado = 'pendiente' ORDER BY created_at DESC LIMIT 100"
    ).all()
  ]);
  return json({ respuestas_rapidas: rapidas.results, sugerencias_pendientes: pendientes.results, aprendizaje: await aprendizaje(env) });
}
