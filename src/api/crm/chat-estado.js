/**
 * POST /api/crm/chat-estado — { conversation_id, accion }
 *   accion: "quitar_recojo" → termina el seguimiento de recojo (Shalom u Olva) cuando el cliente ya pagó o recogió.
 *           "atendido" | "no_atendido" → casilla «Atendido»: quita la etiqueta «Falta respuesta» hasta
 *           que el cliente escriba otra vez (conversations.atendido_at) y descarta su recomendación
 *           pendiente: el chat sale de la cola «Atención pendiente».
 *           "ocultar" | "mostrar"   → saca/devuelve el chat de la lista
 *           (vuelve solo cuando el cliente escribe otra vez).
 *           "pausar_auto" | "reanudar_auto" → killswitch de este chat (cancela lo programado y
 *           frena bienvenida, seguimientos y plantillas automáticas).
 *           "bloquear" | "desbloquear" → bloquea el contacto en WhatsApp
 *           (block_users) y en el CRM: no sale en la lista, no avisa y no
 *           le corre la bienvenida ni los seguimientos.
 * Si Meta no deja bloquear (solo deja a quien escribió en las últimas 24 h),
 * queda bloqueado igual en el CRM y vuelve `aviso`.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { bloquearUsuario } from "../../lib/whatsapp.js";
import { envDeConversacion } from "../../lib/lineas.js";
import { cancelarPlanRecojo } from "../../lib/planes-plantilla.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const ACCIONES = new Set(["quitar_recojo", "atendido", "no_atendido", "ocultar", "mostrar", "bloquear", "desbloquear", "pausar_auto", "reanudar_auto"]);

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const conversationId = Number(payload?.conversation_id);
  const accion = String(payload?.accion || "");
  if (!conversationId || !ACCIONES.has(accion)) return json({ error: "Falta conversation_id o la acción no vale." }, 400);

  const conv = await env.CRM_DB.prepare(
    "SELECT conv.id, conv.contact_id, c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
  ).bind(conversationId).first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  // «Ya pagó su saldo» / «Ya lo recogió»: termina el seguimiento de recojo (Shalom u Olva) de este chat.
  if (accion === "quitar_recojo") {
    return json({ ok: true, cancelados: await cancelarPlanRecojo(env.CRM_DB, conversationId) });
  }

  if (accion === "atendido" || accion === "no_atendido") {
    const marcar = accion === "atendido";
    await env.CRM_DB.prepare(`UPDATE conversations SET atendido_at = ${marcar ? "datetime('now')" : "NULL"} WHERE id = ?`).bind(conversationId).run();
    // Sale de la cola «Atención pendiente»: la recomendación pendiente de este chat también se descarta
    // (ya no reflota); un mensaje nuevo del cliente lo vuelve a poner en la cola.
    if (marcar) {
      await env.CRM_DB.prepare(
        "UPDATE asesor_sugerencias SET estado = 'descartada', resuelto_por = ?, resuelto_at = datetime('now') WHERE conversation_id = ? AND tipo = 'seguimiento' AND estado = 'pendiente'"
      ).bind(`${agent?.displayName || agent?.username || "CRM"} (atendido)`, conversationId).run();
    }
    return json({ ok: true, atendido: marcar });
  }

  if (accion === "ocultar" || accion === "mostrar") {
    await env.CRM_DB.prepare("UPDATE conversations SET hidden = ? WHERE id = ?").bind(accion === "ocultar" ? 1 : 0, conversationId).run();
    return json({ ok: true, hidden: accion === "ocultar" ? 1 : 0 });
  }

  // Killswitch de este chat: cancela todo lo programado y no le sale nada automático (ni plantillas) hasta reanudar.
  if (accion === "pausar_auto" || accion === "reanudar_auto") {
    const pausar = accion === "pausar_auto";
    await env.CRM_DB.prepare("UPDATE conversations SET pausa_auto = ? WHERE id = ?").bind(pausar ? 1 : 0, conversationId).run();
    if (pausar) await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar')").bind(conversationId).run();
    return json({ ok: true, pausa_auto: pausar ? 1 : 0 });
  }

  const bloquear = accion === "bloquear";
  let aviso = null;
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      await bloquearUsuario(await envDeConversacion(env, conversationId), conv.wa_id, bloquear);
    } catch (err) {
      aviso = bloquear
        ? `Quedó bloqueado en el CRM, pero WhatsApp no lo bloqueó: ${err.message}`
        : `Quedó desbloqueado en el CRM, pero WhatsApp respondió: ${err.message}`;
    }
  } else {
    aviso = "WhatsApp no está configurado: solo cambió en el CRM.";
  }
  // Por chat (cliente + número): bloquearlo en Tarot Store no toca su chat de URO.
  await env.CRM_DB.prepare("UPDATE conversations SET blocked = ? WHERE id = ?").bind(bloquear ? 1 : 0, conversationId).run();
  // Bloqueado: no le sale nada programado, ni los de "mandar siempre".
  if (bloquear) await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status = 'pendiente'").bind(conversationId).run();
  return json({ ok: true, blocked: bloquear ? 1 : 0, aviso });
}

export const onRequestPost = conAuth(post);
