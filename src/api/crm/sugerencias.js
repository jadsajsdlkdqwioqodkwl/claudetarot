/**
 * ✨ Sugerencias del asesor: lo que la Routine de Claude propone y una
 * persona aprueba. Nada sale al cliente sin pasar por aquí.
 *
 * GET  /api/crm/sugerencias — las pendientes (y cuántas hay).
 * POST /api/crm/sugerencias
 *   { id, accion: "descartar" }
 *   { id, accion: "aprobar", modo?: "ahora" | "programar", send_at?, texto?, titulo?, destinatarios?: [conversation_id] }
 *     · modo "ahora" → sale en este momento por WhatsApp.
 *     · modo "programar" → queda en scheduled_messages para `send_at` (o
 *       dentro de 1 minuto si no viene); sale por el cron de siempre y se
 *       cancela solo si el cliente escribe antes.
 *     · respuesta_rapida → se crea la respuesta rápida y, a cada destinatario
 *       elegido, se le manda o programa ese texto.
 *   Los chats con la ventana de 24 h cerrada no se programan: vuelven en
 *   `saltados` con el motivo, para que la vendedora use una plantilla.
 *
 * Tipo "variante" (solo admin): otra versión del texto de una respuesta
 * rápida o de un paso de la bienvenida. Aprobarla la mete en la prueba
 * (tabla `variantes`); no manda nada a nadie.
 *
 * Tipo "saldo" (quien maneja Shalom): el asesor vio la captura del pago del
 * saldo; aprobarla deja el saldo en 0 en la hoja (la página muestra la clave).
 *
 * Tipo "prueba_lista" (solo admin, la crea el cron): una prueba de mensajes
 * ya tiene ganadora (`titulo` = id de la versión, 0 = la original).
 * Aprobarla deja esa versión como el texto de siempre; descartarla sigue
 * probando.
 *
 * Tipo "envio" (link de seguimiento con la boleta de Shalom lista): solo lo
 * ve y lo manda el admin. Como la boleta sale días después, casi siempre la
 * ventana ya cerró: entonces "Enviar ahora" usa la plantilla utility de
 * PLANTILLA_ENVIO ({{1}} = nombre, {{2}} = link), si está configurada.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { fueraDeVentana } from "./scheduled.js";
import { mandarTexto } from "../../lib/crm-send.js";
import { enviarTemplate } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente, origenSugerencia } from "../../lib/crm-db.js";
import { normalizarPasos } from "../asesor.js";
import { cerrarPrueba } from "../../lib/crm-variantes.js";
import { manejaShalom } from "../../lib/ventas.js";
import { saldoPagado } from "./shalom.js";
import { destinosDeChats, textoSirvePara } from "../../lib/crm-destino.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const parsear = (texto) => {
  try {
    return JSON.parse(texto || "[]") || [];
  } catch {
    return [];
  }
};

const esAdmin = (agent) => !agent || agent.role === "admin";

async function get({ request, env, agent }) {
  // ?chat=<conversation_id>: los últimos mensajes de ese chat, para editar la
  // sugerencia viendo la conversación. No lo marca como leído.
  const chat = Number(new URL(request.url).searchParams.get("chat"));
  if (chat) {
    const { results: mensajes } = await env.CRM_DB.prepare(
      `SELECT id, direction, type, body, file_name, sent_by, created_at, (media_key IS NOT NULL OR media_id IS NOT NULL) AS tiene_media FROM messages
       WHERE conversation_id = ? ORDER BY id DESC LIMIT 20`
    ).bind(chat).all();
    return json({ mensajes: mensajes.reverse() });
  }
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.*, conv.assigned_agent, conv.last_inbound_at
     FROM asesor_sugerencias s LEFT JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND s.tipo != 'envio' AND (s.tipo NOT IN ('variante', 'prueba_lista') OR ?1 = 1)
       AND (s.tipo != 'saldo' OR ?2 = 1)
     ORDER BY s.tipo DESC, s.created_at DESC LIMIT 200`
  ).bind(esAdmin(agent) ? 1 : 0, manejaShalom(agent, env) ? 1 : 0).all();
  // Las versiones propuestas llevan el texto actual al lado, para comparar.
  for (const s of results) {
    if (s.tipo !== "variante" && s.tipo !== "prueba_lista") continue;
    const ref = await env.CRM_DB.prepare(
      s.ref_tipo === "bienvenida" ? "SELECT title, body FROM welcome_steps WHERE id = ?" : "SELECT title, body FROM quick_replies WHERE id = ?"
    ).bind(s.ref_id).first();
    s.ref_titulo = ref ? `${s.ref_tipo === "bienvenida" ? "Bienvenida · " : ""}${ref.title}` : "(ya no existe)";
    s.ref_texto = ref?.body || "";
  }
  // Para el cronómetro: cuándo escribió por última vez cada destinatario de
  // una respuesta rápida (una consulta por cada 90 chats, tope de parámetros de D1).
  const lista = results.map((s) => ({ ...s, destinatarios: parsear(s.destinatarios), pasos: parsear(s.pasos) }));
  const ids = [...new Set(lista.flatMap((s) => (Array.isArray(s.destinatarios) ? s.destinatarios : []).map((d) => Number(d.conversation_id)).filter(Boolean)))];
  const ultimo = {};
  for (let i = 0; i < ids.length && i < 450; i += 90) {
    const lote = ids.slice(i, i + 90);
    const { results: filas } = await env.CRM_DB.prepare(
      `SELECT id, last_inbound_at FROM conversations WHERE id IN (${lote.map(() => "?").join(",")})`
    ).bind(...lote).all();
    for (const f of filas) ultimo[f.id] = f.last_inbound_at;
  }
  for (const s of lista) {
    if (!Array.isArray(s.destinatarios)) continue;
    for (const d of s.destinatarios) d.last_inbound_at = ultimo[Number(d.conversation_id)] || null;
  }
  return json({ pendientes: results.length, sugerencias: lista });
}

async function programar(env, conversationId, texto, quien, cuando) {
  const sendAt = cuando instanceof Date ? cuando : new Date(Date.now() + 60 * 1000);
  const error = await fueraDeVentana(env.CRM_DB, conversationId, sendAt);
  if (error) return error;
  if (cuando === "ahora") {
    const conv = await env.CRM_DB.prepare(
      "SELECT c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
    ).bind(conversationId).first();
    if (!conv) return "No encontré el chat.";
    try {
      await mandarTexto(env, conversationId, conv.wa_id, texto, quien);
    } catch (err) {
      return `WhatsApp no lo aceptó: ${err.message}`;
    }
    return null;
  }
  await env.CRM_DB.prepare(
    "INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by) VALUES (?, ?, ?, ?)"
  )
    .bind(conversationId, texto, sendAt.toISOString(), origenSugerencia(quien))
    .run();
  return null;
}

/** Ventana cerrada: el link sale con la plantilla utility aprobada en Meta. */
async function conPlantilla(env, s, quien) {
  if (!env.PLANTILLA_ENVIO) {
    return "Pasaron más de 24 h y todavía no hay plantilla de envío aprobada (PLANTILLA_ENVIO): no se le puede escribir gratis.";
  }
  const conv = await env.CRM_DB.prepare(
    "SELECT c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
  ).bind(s.conversation_id).first();
  if (!conv) return "No encontré el chat.";
  const nombre = (s.nombre || "").split(/\s+/)[0] || "estimad@";
  try {
    const waMessageId = await enviarTemplate(env, conv.wa_id, env.PLANTILLA_ENVIO, "es", [nombre, s.titulo]);
    await registrarMensajeSaliente(env.CRM_DB, s.conversation_id, {
      waMessageId, type: "template", body: `Plantilla: ${env.PLANTILLA_ENVIO} · ${s.titulo}`, sentBy: quien
    });
    return null;
  } catch (err) {
    return `WhatsApp rechazó la plantilla: ${err.message}`;
  }
}

async function post({ request, env, agent }) {
  const payload = await request.json().catch(() => null);
  const id = Number(payload?.id);
  if (!id || !["aprobar", "descartar"].includes(payload?.accion)) return json({ error: "Solicitud inválida." }, 400);

  const s = await env.CRM_DB.prepare("SELECT * FROM asesor_sugerencias WHERE id = ?").bind(id).first();
  if (!s) return json({ error: "Esa sugerencia ya no existe." }, 404);
  if (s.tipo === "envio" && !esAdmin(agent)) return json({ error: "Solo el admin maneja los envíos." }, 403);
  if ((s.tipo === "variante" || s.tipo === "prueba_lista") && !esAdmin(agent)) return json({ error: "Solo el admin decide qué se prueba." }, 403);
  if (s.estado !== "pendiente") return json({ error: `Ya fue ${s.estado} por ${s.resuelto_por || "otra persona"}.` }, 409);

  const quien = agent?.displayName || agent?.username || "CRM";
  const cerrar = (estado) =>
    env.CRM_DB.prepare("UPDATE asesor_sugerencias SET estado = ?, resuelto_por = ?, resuelto_at = datetime('now') WHERE id = ? AND estado = 'pendiente'")
      .bind(estado, quien, id)
      .run();

  if (payload.accion === "descartar") {
    await cerrar("descartada");
    return json({ ok: true });
  }

  if (s.tipo === "saldo") {
    if (!manejaShalom(agent, env)) return json({ error: "Solo quien maneja los envíos de Shalom confirma saldos." }, 403);
    const r = await saldoPagado(env, s.titulo);
    if (!r.ok) return r;
    await cerrar("aprobada");
    return json({ ok: true, enviados: 0, programados: 0, saltados: [] });
  }

  if (s.tipo === "prueba_lista") {
    try {
      await cerrarPrueba(env.CRM_DB, s.ref_tipo, s.ref_id, Number(s.titulo) || 0, quien);
    } catch (err) {
      return json({ error: err.message }, 409);
    }
    await cerrar("aprobada");
    return json({ ok: true, enviados: 0, programados: 0, saltados: [] });
  }

  let cuando = null;
  if (payload.modo === "ahora") cuando = "ahora";
  else if (payload.send_at) {
    cuando = new Date(payload.send_at);
    if (Number.isNaN(cuando.getTime())) return json({ error: "Fecha u hora inválida." }, 400);
    if (cuando.getTime() < Date.now() - 60 * 1000) return json({ error: "Esa hora ya pasó." }, 400);
  }
  const texto = String(payload.texto ?? s.texto).trim().slice(0, 4096);
  if (!texto) return json({ error: "El mensaje quedó vacío." }, 400);
  const programados = [];
  const saltados = [];

  if (s.tipo === "variante") {
    const tabla = s.ref_tipo === "bienvenida" ? "welcome_steps" : "quick_replies";
    if (!(await env.CRM_DB.prepare(`SELECT 1 FROM ${tabla} WHERE id = ?`).bind(s.ref_id).first())) {
      return json({ error: "Ese mensaje ya no existe." }, 422);
    }
    const { n } = await env.CRM_DB.prepare("SELECT COUNT(*) AS n FROM variantes WHERE tipo = ? AND ref_id = ? AND estado = 'activa'").bind(s.ref_tipo, s.ref_id).first();
    if (n >= 3) return json({ error: "Ya hay 3 versiones en prueba de ese mensaje: cierra o quita una antes." }, 409);
    await env.CRM_DB.prepare("INSERT INTO variantes (tipo, ref_id, texto, origen, motivo) VALUES (?, ?, ?, ?, ?)")
      .bind(s.ref_tipo, s.ref_id, texto, s.origen || "asesor", s.motivo)
      .run();
    await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ? WHERE id = ?").bind(texto, id).run();
    await cerrar("aprobada");
    return json({ ok: true, enviados: 0, programados: 0, saltados });
  }

  if (s.tipo !== "respuesta_rapida") {
    if (!s.conversation_id) return json({ error: "No encontré el chat de este cliente en el CRM." }, 422);
    let error = await programar(env, s.conversation_id, texto, quien, cuando);
    // Envío con la ventana cerrada: sale con la plantilla.
    if (error && s.tipo === "envio" && cuando === "ahora" && s.titulo && (await fueraDeVentana(env.CRM_DB, s.conversation_id, new Date()))) {
      error = await conPlantilla(env, s, quien);
    }
    if (error) return json({ error }, 422);
    programados.push(s.conversation_id);
    // Secuencia: los pasos siguientes quedan programados después del
    // primero; se cancelan solos si el cliente responde.
    const pasos = parsear(payload.pasos !== undefined ? normalizarPasos(payload.pasos) : s.pasos);
    let base = cuando instanceof Date ? cuando.getTime() : Date.now() + (cuando === "ahora" ? 0 : 60 * 1000);
    for (const [i, paso] of pasos.entries()) {
      base += paso.horas * 3600 * 1000;
      const err = await programar(env, s.conversation_id, paso.texto, quien, new Date(base));
      if (err) saltados.push({ nombre: `Paso ${i + 2}`, motivo: err });
      else programados.push(s.conversation_id);
    }
    if (payload.pasos !== undefined) {
      await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET pasos = ? WHERE id = ?").bind(normalizarPasos(payload.pasos), id).run();
    }
  } else {
    const titulo = String(payload.titulo ?? s.titulo ?? "").trim().slice(0, 80);
    if (!titulo) return json({ error: "La respuesta rápida necesita un título." }, 400);
    await env.CRM_DB.prepare("INSERT INTO quick_replies (title, body) VALUES (?, ?)").bind(titulo, texto).run();
    const elegidos = new Set((Array.isArray(payload.destinatarios) ? payload.destinatarios : []).map(Number));
    // Última revisión antes de mandar: nada de adelanto de Shalom a alguien de Lima (ni al revés).
    const destinos = await destinosDeChats(env.CRM_DB, [...elegidos]);
    for (const d of parsear(s.destinatarios)) {
      if (!d.conversation_id || !elegidos.has(Number(d.conversation_id))) continue;
      if (!textoSirvePara(texto, destinos[d.conversation_id])) {
        saltados.push({ nombre: d.nombre || d.wa_id, motivo: `es de ${destinos[d.conversation_id]}; este mensaje es para el otro destino` });
        continue;
      }
      const error = await programar(env, d.conversation_id, texto, quien, cuando);
      if (error) saltados.push({ nombre: d.nombre || d.wa_id, motivo: error });
      else programados.push(d.conversation_id);
    }
  }

  await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ?, titulo = COALESCE(?, titulo) WHERE id = ?")
    .bind(texto, payload.titulo ? String(payload.titulo).slice(0, 80) : null, id)
    .run();
  await cerrar("aprobada");
  // Con "ahora" sale ya el primer mensaje (o el de cada destinatario de una
  // respuesta rápida); lo demás queda programado.
  const enviados = cuando !== "ahora" ? 0 : s.tipo === "respuesta_rapida" ? programados.length : 1;
  return json({ ok: true, enviados, programados: programados.length - enviados, saltados });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
