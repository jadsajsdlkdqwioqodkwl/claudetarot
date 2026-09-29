/**
 * ✨ Sugerencias del asesor: lo que la Routine de Claude propone y una
 * persona aprueba. Nada sale al cliente sin pasar por aquí.
 *
 * GET  /api/crm/sugerencias — las pendientes (y cuántas hay).
 * POST /api/crm/sugerencias
 *   { id, accion: "descartar" }
 *   { id, accion: "aprobar", texto?, titulo?, destinatarios?: [conversation_id] }
 *     · seguimiento → se programa en ese chat para dentro de 1 minuto (sale por
 *       el cron de siempre y se cancela solo si el cliente escribe antes).
 *     · respuesta_rapida → se crea la respuesta rápida y, a cada destinatario
 *       elegido, se le programa ese texto.
 *   Los chats con la ventana de 24 h cerrada no se programan: vuelven en
 *   `saltados` con el motivo, para que la vendedora use una plantilla.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { fueraDeVentana } from "./scheduled.js";

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

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.*, conv.assigned_agent, conv.last_inbound_at
     FROM asesor_sugerencias s LEFT JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' ORDER BY s.tipo DESC, s.created_at DESC LIMIT 200`
  ).all();
  return json({
    pendientes: results.length,
    sugerencias: results.map((s) => ({ ...s, destinatarios: parsear(s.destinatarios) }))
  });
}

async function programar(env, conversationId, texto, quien) {
  const sendAt = new Date(Date.now() + 60 * 1000);
  const error = await fueraDeVentana(env.CRM_DB, conversationId, sendAt);
  if (error) return error;
  await env.CRM_DB.prepare(
    "INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by) VALUES (?, ?, ?, ?)"
  )
    .bind(conversationId, texto, sendAt.toISOString(), quien)
    .run();
  return null;
}

async function post({ request, env, agent }) {
  const payload = await request.json().catch(() => null);
  const id = Number(payload?.id);
  if (!id || !["aprobar", "descartar"].includes(payload?.accion)) return json({ error: "Solicitud inválida." }, 400);

  const s = await env.CRM_DB.prepare("SELECT * FROM asesor_sugerencias WHERE id = ?").bind(id).first();
  if (!s) return json({ error: "Esa sugerencia ya no existe." }, 404);
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

  const texto = String(payload.texto ?? s.texto).trim().slice(0, 4096);
  if (!texto) return json({ error: "El mensaje quedó vacío." }, 400);
  const programados = [];
  const saltados = [];

  if (s.tipo === "seguimiento") {
    if (!s.conversation_id) return json({ error: "No encontré el chat de este cliente en el CRM." }, 422);
    const error = await programar(env, s.conversation_id, texto, quien);
    if (error) return json({ error }, 422);
    programados.push(s.conversation_id);
  } else {
    const titulo = String(payload.titulo ?? s.titulo ?? "").trim().slice(0, 80);
    if (!titulo) return json({ error: "La respuesta rápida necesita un título." }, 400);
    await env.CRM_DB.prepare("INSERT INTO quick_replies (title, body) VALUES (?, ?)").bind(titulo, texto).run();
    const elegidos = new Set((Array.isArray(payload.destinatarios) ? payload.destinatarios : []).map(Number));
    for (const d of parsear(s.destinatarios)) {
      if (!d.conversation_id || !elegidos.has(Number(d.conversation_id))) continue;
      const error = await programar(env, d.conversation_id, texto, quien);
      if (error) saltados.push({ nombre: d.nombre || d.wa_id, motivo: error });
      else programados.push(d.conversation_id);
    }
  }

  await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ?, titulo = COALESCE(?, titulo) WHERE id = ?")
    .bind(texto, payload.titulo ? String(payload.titulo).slice(0, 80) : null, id)
    .run();
  await cerrar("aprobada");
  return json({ ok: true, programados: programados.length, saltados });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
