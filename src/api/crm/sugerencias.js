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
 * Tipo "envio" (link de seguimiento con la boleta de Shalom lista): solo lo
 * ve y lo manda el admin. Como la boleta sale días después, casi siempre la
 * ventana ya cerró: entonces "Enviar ahora" usa la plantilla utility de
 * PLANTILLA_ENVIO ({{1}} = nombre, {{2}} = link), si está configurada.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { fueraDeVentana } from "./scheduled.js";
import { mandarTexto } from "../../lib/crm-send.js";
import { enviarTemplate } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const parsear = (texto) => {
  try {
    return JSON.parse(texto || "[]");
  } catch {
    return [];
  }
};

const esAdmin = (agent) => !agent || agent.role === "admin";

async function get({ env, agent }) {
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.*, conv.assigned_agent, conv.last_inbound_at
     FROM asesor_sugerencias s LEFT JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND (? OR s.tipo != 'envio')
     ORDER BY s.tipo DESC, s.created_at DESC LIMIT 200`
  ).bind(esAdmin(agent) ? 1 : 0).all();
  return json({
    pendientes: results.length,
    sugerencias: results.map((s) => ({ ...s, destinatarios: parsear(s.destinatarios) }))
  });
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
    .bind(conversationId, texto, sendAt.toISOString(), quien)
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

  if (s.tipo !== "respuesta_rapida") {
    if (!s.conversation_id) return json({ error: "No encontré el chat de este cliente en el CRM." }, 422);
    let error = await programar(env, s.conversation_id, texto, quien, cuando);
    // Envío con la ventana cerrada: sale con la plantilla.
    if (error && s.tipo === "envio" && cuando === "ahora" && s.titulo && (await fueraDeVentana(env.CRM_DB, s.conversation_id, new Date()))) {
      error = await conPlantilla(env, s, quien);
    }
    if (error) return json({ error }, 422);
    programados.push(s.conversation_id);
  } else {
    const titulo = String(payload.titulo ?? s.titulo ?? "").trim().slice(0, 80);
    if (!titulo) return json({ error: "La respuesta rápida necesita un título." }, 400);
    await env.CRM_DB.prepare("INSERT INTO quick_replies (title, body) VALUES (?, ?)").bind(titulo, texto).run();
    const elegidos = new Set((Array.isArray(payload.destinatarios) ? payload.destinatarios : []).map(Number));
    for (const d of parsear(s.destinatarios)) {
      if (!d.conversation_id || !elegidos.has(Number(d.conversation_id))) continue;
      const error = await programar(env, d.conversation_id, texto, quien, cuando);
      if (error) saltados.push({ nombre: d.nombre || d.wa_id, motivo: error });
      else programados.push(d.conversation_id);
    }
  }

  await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ?, titulo = COALESCE(?, titulo) WHERE id = ?")
    .bind(texto, payload.titulo ? String(payload.titulo).slice(0, 80) : null, id)
    .run();
  await cerrar("aprobada");
  return json({ ok: true, enviados: cuando === "ahora" ? programados.length : 0, programados: cuando === "ahora" ? 0 : programados.length, saltados });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
