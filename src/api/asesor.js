/**
 * POST /api/asesor/avisos — la puerta por la que el asesor (la Routine de
 * Claude Code que lee los chats 3 veces al día) avisa. Hoy solo manda el
 * PDF de pedidos al dueño y UN aviso "hay recomendaciones nuevas" al equipo
 * (crm-avisos.js); las propuestas en sí quedan en ✨ Sugerencias.
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
 *   { informe: "texto" } → solo lo guarda (asesor_informes), no avisa a nadie
 *   { resumen: "texto", pdf_base64: "...", pdf_nombre: "pedidos.pdf",
 *     solo_dueno: true,   // informes (CRO): van solo al dueño
 *     mensajes: [{ whatsapp, nombre, motivo, mensaje }] }
 */

import { llamarTelegram, escaparHtml } from "../lib/telegram.js";
import { notificarRecomendaciones } from "../lib/crm-avisos.js";
import { aprendizaje } from "./asesor-datos.js";
import { versionesEnPrueba } from "../lib/crm-variantes.js";
import { frasesQueConvierten } from "../lib/crm-frases.js";
import { getValues } from "../lib/google-sheets.js";
import { hojaVentas } from "../lib/ventas-hoja.js";
import { RANGO_DATOS_VENTA, indiceVenta } from "../lib/ventas.js";
import { buscarFila } from "./asesor-ventas.js";
import { destinosDeChats, textoSirvePara } from "../lib/crm-destino.js";

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
  // El informe del director CRO ya no va por Telegram: se guarda y queda
  // como página en CRM → Reportes (y en el resumen semanal).
  if (payload.informe) {
    const texto = String(payload.informe).slice(0, 20000);
    const origenInforme = String(payload.origen || "director CRO").slice(0, 60);
    await env.CRM_DB.prepare("INSERT INTO asesor_informes (origen, texto) VALUES (?, ?)").bind(origenInforme, texto).run();
    const link = await guardarInformeComoPagina(env, origenInforme, texto).catch(() => null);
    return json({ guardado: true, link });
  }
  const dueno = env.TELEGRAM_CHAT_ID;
  const res = { enviados: 0, fallidos: [], a_dueno: 0 };

  // El PDF de pedidos sigue llegando al dueño (es para despachar).
  if (payload.pdf_base64) {
    try {
      await mandarPdf(env, dueno, payload.pdf_base64, payload.pdf_nombre, payload.resumen);
      res.enviados++;
      res.a_dueno++;
    } catch (err) {
      res.fallidos.push({ que: "pdf", error: err.message });
    }
  }
  // Lo demás (cada mensaje sugerido, los trozos del informe, los resúmenes
  // sueltos) ya no se manda uno por uno: las propuestas quedan en ✨
  // Sugerencias y sale un solo aviso "hay recomendaciones nuevas" al equipo.
  const mensajes = Array.isArray(payload.mensajes) ? payload.mensajes : [];
  if (mensajes.length || payload.nuevas_recomendaciones) {
    const r = await notificarRecomendaciones(env);
    res.enviados += r.enviados || 0;
    if (r.omitido) res.omitido = r.omitido;
  }
  return json(res);
}

/** El informe del director como página en CRM → Reportes. */
async function guardarInformeComoPagina(env, origen, texto) {
  if (!env.CRM_MEDIA) return null;
  const fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const id = `informe-cro-${fecha}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.html`;
  const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>Informe ${escaparHtml(origen)} ${fecha}</title></head>` +
    `<body style="margin:0;padding:16px;font:15px/1.55 system-ui,sans-serif;color:#1f2937;max-width:720px">` +
    `<h2 style="font-size:17px">Informe ${escaparHtml(origen)} · ${fecha}</h2>` +
    `<div style="white-space:pre-wrap">${escaparHtml(texto)}</div></body></html>`;
  await env.CRM_MEDIA.put(`reportes/${id}`, pagina, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
    customMetadata: { titulo: `Informe ${origen} ${fecha}` }
  });
  return `${new URL("https://kit-tarot-para-principiantes.tarotperu.store").origin}/r/${id}`;
}

/**
 * POST /api/asesor/sugerencias — la Routine deja propuestas que esperan a una
 * persona en ✨ Sugerencias del CRM. No manda nada al cliente.
 *
 * { origen: "asesor 16:30",
 *   sugerencias: [
 *     { tipo: "seguimiento", whatsapp, nombre, motivo, texto,
 *       pasos?: [{ horas, texto }] },   // secuencia: salen solos si no responde
 *     { tipo: "envio", whatsapp, nombre, motivo, texto, link },   // boleta lista: solo la ve el admin

 *     { tipo: "respuesta_rapida", titulo, texto, motivo,
 *       destinatarios: [{ whatsapp, nombre }] },
 *     { tipo: "variante", ref_tipo: "rapida" | "bienvenida", ref_id, texto, motivo },
 *     { tipo: "saldo", whatsapp, nombre, codigo?: "TS-…", texto, motivo } ] }
 *
 * "saldo": el cliente mandó la captura del pago del saldo (el asesor ve las
 * imágenes del chat). Una persona de Shalom la revisa y con un toque deja el
 * saldo en 0: su página de seguimiento le muestra la clave. Nada automático
 * con plata sin que alguien lo mire.
 *
 * "variante" = otra versión del texto de una respuesta rápida que ya existe
 * (o de un paso de la bienvenida) para probarla contra la actual, en vez de
 * crear una respuesta rápida nueva parecida. `motivo` es la hipótesis. Solo la
 * ve el admin; al aprobarla entra a la prueba (crm-variantes.js).
 *
 * Un chat tiene a lo sumo un seguimiento pendiente: si ya había uno, se
 * reemplaza el texto (la propuesta más nueva sabe más del chat).
 */
/** Pasos extra de una secuencia: hasta 3, cada uno 1–20 h después del anterior. JSON o null. */
export function normalizarPasos(lista) {
  if (!Array.isArray(lista)) return null;
  const pasos = lista
    .map((p) => ({
      horas: Math.min(Math.max(Number(p?.horas) || 0, 0.25), 20),
      texto: String(p?.texto ?? p?.mensaje ?? "").trim().slice(0, 4096)
    }))
    .filter((p) => p.texto)
    .slice(0, 3);
  return pasos.length ? JSON.stringify(pasos) : null;
}

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
  let filasVentas = null;

  for (const s of lista) {
    const texto = String(s?.texto || "").trim().slice(0, 4096);
    if (!texto) continue;
    const motivo = String(s.motivo || "").slice(0, 300) || null;

    if (s.tipo === "variante") {
      const refTipo = s.ref_tipo === "bienvenida" ? "bienvenida" : "rapida";
      const refId = Number(s.ref_id);
      const ref = refId && await env.CRM_DB.prepare(`SELECT id FROM ${refTipo === "rapida" ? "quick_replies" : "welcome_steps"} WHERE id = ?`).bind(refId).first();
      if (!ref) {
        res.sin_ref = (res.sin_ref || 0) + 1;
        continue;
      }
      const repetida = await env.CRM_DB.prepare(
        "SELECT 1 FROM asesor_sugerencias WHERE tipo = 'variante' AND ref_tipo = ? AND ref_id = ? AND texto = ? AND estado = 'pendiente'"
      ).bind(refTipo, refId, texto).first();
      if (repetida) continue;
      await env.CRM_DB.prepare(
        "INSERT INTO asesor_sugerencias (tipo, ref_tipo, ref_id, texto, texto_original, motivo, origen) VALUES ('variante', ?, ?, ?, ?, ?, ?)"
      ).bind(refTipo, refId, texto, texto, motivo, origen).run();
      res.creadas++;
      continue;
    }

    // El bot le pregunta al dueño algo que no está en negocio.md ("¿puedo
    // ofrecer…?"). Solo lo ve el admin; la respuesta va a la memoria.
    if (s.tipo === "pregunta") {
      const repetida = await env.CRM_DB.prepare(
        "SELECT 1 FROM asesor_sugerencias WHERE tipo = 'pregunta' AND texto = ? AND estado = 'pendiente'"
      ).bind(texto).first();
      if (repetida) continue;
      const opciones = (Array.isArray(s.opciones) ? s.opciones : []).map((o) => String(o || "").trim().slice(0, 200)).filter(Boolean).slice(0, 4);
      const wa = String(s.whatsapp || "").replace(/\D/g, "");
      const conv = wa ? await convDe(env, wa) : null;
      await env.CRM_DB.prepare(
        "INSERT INTO asesor_sugerencias (tipo, conversation_id, wa_id, nombre, texto, texto_original, motivo, idea, origen) VALUES ('pregunta', ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(conv?.id || null, wa || null, String(s.nombre || "").slice(0, 80) || null, texto, texto, motivo, JSON.stringify({ opciones }), origen).run();
      res.creadas++;
      continue;
    }

    if (s.tipo === "saldo") {
      let codigo = String(s.codigo || "").trim().toUpperCase();
      const wa = String(s.whatsapp || "").replace(/\D/g, "");
      const conv = await convDe(env, wa);
      // Si el asesor no sabe el código, se busca su venta abierta por el celular en la hoja Ventas.
      if (!/^TS-[A-Z0-9-]{3,24}$/.test(codigo) && wa.length >= 9) {
        filasVentas ||= await getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`).catch(() => []);
        const hallada = buscarFila(filasVentas, { dni: wa.slice(-9) });
        codigo = hallada ? String(hallada.valores[indiceVenta("Código")] || "").trim().toUpperCase() : "";
      }
      if (!/^TS-[A-Z0-9-]{3,24}$/.test(codigo) || !conv) {
        res.sin_chat.push(wa || codigo);
        continue;
      }
      const repetida = await env.CRM_DB.prepare(
        "SELECT 1 FROM asesor_sugerencias WHERE tipo = 'saldo' AND titulo = ? AND estado = 'pendiente'"
      ).bind(codigo).first();
      if (repetida) continue;
      await env.CRM_DB.prepare(
        "INSERT INTO asesor_sugerencias (tipo, conversation_id, wa_id, nombre, titulo, texto, texto_original, motivo, origen) VALUES ('saldo', ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(conv.id, wa, String(s.nombre || "").slice(0, 80), codigo, texto, texto, motivo, origen).run();
      res.creadas++;
      continue;
    }

    if (s.tipo === "respuesta_rapida") {
      const titulo = String(s.titulo || "").trim().slice(0, 80);
      if (!titulo) continue;
      // La misma propuesta dos veces (dos corridas seguidas) no se duplica.
      const igual = await env.CRM_DB.prepare(
        "SELECT 1 FROM asesor_sugerencias WHERE tipo = 'respuesta_rapida' AND estado = 'pendiente' AND (titulo = ? OR texto = ?)"
      ).bind(titulo, texto).first();
      if (igual) continue;
      const candidatos = [];
      for (const d of (Array.isArray(s.destinatarios) ? s.destinatarios : []).slice(0, 50)) {
        const wa = String(d?.whatsapp || "").replace(/\D/g, "");
        const conv = await convDe(env, wa);
        if (conv) candidatos.push({ conversation_id: conv.id, wa_id: wa, nombre: String(d.nombre || "").slice(0, 80) });
        else if (wa) res.sin_chat.push(wa);
      }
      // Un mensaje de provincia (adelanto, Shalom) no va a chats de Lima, ni al revés.
      const destinos = await destinosDeChats(env.CRM_DB, candidatos.map((d) => d.conversation_id));
      const destinatarios = candidatos.filter((d) => {
        const sirve = textoSirvePara(texto, destinos[d.conversation_id]);
        if (!sirve) (res.otro_destino ||= []).push(d.wa_id);
        return sirve;
      });
      await env.CRM_DB.prepare(
        "INSERT INTO asesor_sugerencias (tipo, titulo, texto, texto_original, motivo, destinatarios, origen) VALUES ('respuesta_rapida', ?, ?, ?, ?, ?, ?)"
      )
        .bind(titulo, texto, texto, motivo, JSON.stringify(destinatarios), origen)
        .run();
      res.creadas++;
      continue;
    }

    const tipo = s.tipo === "envio" ? "envio" : "seguimiento";
    const pasos = normalizarPasos(s.pasos);
    // Qué frena a este cliente y otra opción para la próxima (la vendedora decide).
    const objecion = String(s.objecion || "").trim().slice(0, 200) || null;
    const ideaTexto = String(s.idea?.texto || s.idea?.mensaje || "").trim().slice(0, 1000);
    const idea = ideaTexto ? JSON.stringify({ titulo: String(s.idea.titulo || "").trim().slice(0, 160) || null, texto: ideaTexto }) : null;
    const link = tipo === "envio" ? String(s.link || "").slice(0, 200) || null : null;
    const wa = String(s.whatsapp || "").replace(/\D/g, "");
    const conv = await convDe(env, wa);
    if (!conv) {
      res.sin_chat.push(wa);
      continue;
    }
    if (tipo === "seguimiento") {
      const destino = (await destinosDeChats(env.CRM_DB, [conv.id]))[conv.id];
      if (!textoSirvePara(texto, destino)) {
        (res.otro_destino ||= []).push(wa);
        continue;
      }
    }
    const previa = await env.CRM_DB.prepare(
      "SELECT id FROM asesor_sugerencias WHERE conversation_id = ? AND tipo = ? AND estado = 'pendiente'"
    )
      .bind(conv.id, tipo)
      .first();
    if (previa) {
      await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ?, texto_original = ?, motivo = ?, origen = ?, titulo = COALESCE(?, titulo), pasos = ?, objecion = ?, idea = ?, created_at = datetime('now') WHERE id = ?")
        .bind(texto, texto, motivo, origen, link, pasos, objecion, idea, previa.id)
        .run();
      res.actualizadas++;
    } else {
      await env.CRM_DB.prepare(
        "INSERT INTO asesor_sugerencias (tipo, conversation_id, wa_id, nombre, titulo, texto, texto_original, motivo, origen, pasos, objecion, idea) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(tipo, conv.id, wa, String(s.nombre || "").slice(0, 80), link, texto, texto, motivo, origen, pasos, objecion, idea)
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
  const [rapidas, pendientes, bienvenida, pruebas, noCierran] = await Promise.all([
    env.CRM_DB.prepare(
      `SELECT q.id, q.title, q.body, q.grupo, q.sort_order,
         (SELECT group_concat(media_type) FROM quick_reply_media m WHERE m.quick_reply_id = q.id) AS media
       FROM quick_replies q ORDER BY q.sort_order, q.id`
    ).all(),
    env.CRM_DB.prepare(
      "SELECT tipo, wa_id, nombre, titulo, substr(texto, 1, 300) AS texto, origen, created_at FROM asesor_sugerencias WHERE estado = 'pendiente' ORDER BY created_at DESC LIMIT 100"
    ).all(),
    env.CRM_DB.prepare(
      `SELECT s.id, s.title, s.body,
         (SELECT group_concat(media_type) FROM welcome_step_media m WHERE m.welcome_step_id = s.id) AS media
       FROM welcome_steps s ORDER BY s.step_order`
    ).all(),
    pruebasDeMensajes(env).catch((err) => ({ error: err.message })),
    porQueNoCierran(env).catch((err) => ({ error: err.message }))
  ]);
  return json({
    respuestas_rapidas: rapidas.results,
    bienvenida: bienvenida.results,
    pruebas: pruebas,
    sugerencias_pendientes: pendientes.results,
    no_cierran: noCierran,
    aprendizaje: await aprendizaje(env)
  });
}

/**
 * Por qué no se concretan las ventas, para que el director CRO no mande
 * seguimientos a ciegas ("separa hoy y sale mañana"):
 *   · estancados: chats a los que se les pidió el cierre (ubicación o
 *     adelanto) en los últimos 14 días y no cerraron, cuántos contestaron
 *     algo después y cuántos se quedaron callados;
 *   · objeciones: lo que el análisis por chat anotó en los perdidos/abiertos
 *     (30 días), con ejemplos del motivo;
 *   · por_objecion: cómo les fue a los seguimientos aprobados según la
 *     objeción que atacaban (¿respondió en 24 h?, ¿compró?).
 */
export async function porQueNoCierran(env) {
  const [estancados, objeciones, porObjecion, preguntas] = await Promise.all([
    env.CRM_DB.prepare(
      `SELECT COUNT(*) AS pidieron_cierre,
         SUM(EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conv.id AND m.direction = 'in' AND m.created_at > conv.etapa_at)) AS contestaron_despues,
         SUM(conv.last_inbound_at < datetime('now', '-24 hours')) AS ventana_cerrada
       FROM conversations conv
       WHERE conv.etapa = 4 AND conv.etapa_at >= datetime('now', '-14 days') AND conv.etapa_at <= datetime('now', '-6 hours')`
    ).first(),
    env.CRM_DB.prepare(
      `SELECT lower(trim(objecion)) AS objecion, COUNT(*) AS chats, SUM(resultado = 'perdido') AS perdidos,
         substr(group_concat(motivo, ' | '), 1, 400) AS ejemplos
       FROM chat_analisis
       WHERE fecha >= date('now', '-30 days') AND resultado IN ('perdido', 'abierto') AND COALESCE(trim(objecion), '') != ''
       GROUP BY 1 ORDER BY chats DESC LIMIT 12`
    ).all(),
    env.CRM_DB.prepare(
      `SELECT lower(trim(s.objecion)) AS objecion, COUNT(*) AS aprobadas,
         SUM(EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = s.conversation_id AND m.direction = 'in'
                     AND m.created_at > s.resuelto_at AND m.created_at <= datetime(s.resuelto_at, '+24 hours'))) AS respondieron,
         SUM(conv.etapa >= 5 AND conv.etapa_at > s.resuelto_at) AS compraron
       FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
       WHERE s.estado = 'aprobada' AND s.tipo = 'seguimiento' AND COALESCE(trim(s.objecion), '') != ''
         AND s.resuelto_at >= datetime('now', '-45 days')
       GROUP BY 1 ORDER BY aprobadas DESC LIMIT 12`
    ).all(),
    env.CRM_DB.prepare(
      `SELECT texto AS pregunta, respuesta, resuelto_por AS quien, resuelto_at FROM asesor_sugerencias
       WHERE tipo = 'pregunta' AND estado = 'respondida' ORDER BY resuelto_at DESC LIMIT 15`
    ).all()
  ]);
  return { estancados, objeciones: objeciones.results, por_objecion: porObjecion.results, preguntas_respondidas: preguntas.results };
}

/**
 * Cómo le va a cada mensaje: las pruebas en curso (cada versión con sus
 * números) y, para todas las respuestas rápidas y pasos de bienvenida, cuánto
 * se usaron y cuántos chats avanzaron después (45 días). Sin esto el director
 * CRO proponía textos a ciegas.
 */
export async function pruebasDeMensajes(env) {
  const [rapidas, bienvenida] = await Promise.all([
    versionesEnPrueba(env.CRM_DB, "rapida"),
    versionesEnPrueba(env.CRM_DB, "bienvenida")
  ]);
  const { results: uso } = await env.CRM_DB.prepare(
    `SELECT u.tipo, u.ref_id, COUNT(*) AS usos, SUM(u.editada) AS editadas,
       SUM(conv.etapa > u.etapa_antes AND conv.etapa_at > u.created_at) AS avanzaron,
       SUM(conv.etapa >= 5 AND u.etapa_antes < 5 AND conv.etapa_at > u.created_at) AS cerraron
     FROM variante_usos u JOIN conversations conv ON conv.id = u.conversation_id
     WHERE u.created_at >= datetime('now', '-45 days')
     GROUP BY u.tipo, u.ref_id ORDER BY usos DESC`
  ).all();
  // Cómo cambian las vendedoras los textos antes de mandarlos: lo que más
  // enseña sobre cómo escribir (y qué versión probar después).
  const { results: ediciones } = await env.CRM_DB.prepare(
    `SELECT u.tipo, u.ref_id, u.variante_id, u.agente, u.texto_enviado, u.created_at,
       (conv.etapa > u.etapa_antes AND conv.etapa_at > u.created_at) AS avanzo
     FROM variante_usos u JOIN conversations conv ON conv.id = u.conversation_id
     WHERE u.editada = 1 AND u.texto_enviado IS NOT NULL AND u.created_at >= datetime('now', '-30 days')
     ORDER BY u.created_at DESC LIMIT 40`
  ).all();
  const frases = await frasesQueConvierten(env.CRM_DB, 30).catch(() => null);
  // Dónde conviene probar una opción 2 y 3: las respuestas rápidas más usadas
  // sin prueba en curso, primero las que menos hacen avanzar el chat.
  const pct = (u) => (u.usos ? u.avanzaron / u.usos : 0);
  const candidatas = uso
    .filter((u) => u.tipo === "rapida" && u.usos >= 10 && !rapidas[u.ref_id])
    .map((u) => ({ ref_tipo: "rapida", ref_id: u.ref_id, usos: u.usos, avanza_pct: Math.round(100 * pct(u)), editadas: u.editadas || 0 }))
    .sort((a, b) => a.avanza_pct - b.avanza_pct || b.usos - a.usos)
    .slice(0, 6);
  return { en_curso: { rapida: rapidas, bienvenida }, uso_por_mensaje: uso, ediciones, frases, candidatas_a_opciones: candidatas };
}
