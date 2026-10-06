/**
 * POST /api/crm/chat-estado — { conversation_id, accion }
 *   accion: "ocultar" | "mostrar"   → saca/devuelve el chat de la lista
 *           (vuelve solo cuando el cliente escribe otra vez).
 *           "bloquear" | "desbloquear" → bloquea el contacto en WhatsApp
 *           (block_users) y en el CRM: no sale en la lista, no avisa y no
 *           le corre la bienvenida ni los seguimientos.
 * Si Meta no deja bloquear (solo deja a quien escribió en las últimas 24 h),
 * queda bloqueado igual en el CRM y vuelve `aviso`.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { bloquearUsuario } from "../../lib/whatsapp.js";
import { envDeConversacion } from "../../lib/lineas.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const ACCIONES = new Set(["ocultar", "mostrar", "bloquear", "desbloquear"]);

async function post({ request, env }) {
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

  if (accion === "ocultar" || accion === "mostrar") {
    await env.CRM_DB.prepare("UPDATE conversations SET hidden = ? WHERE id = ?").bind(accion === "ocultar" ? 1 : 0, conversationId).run();
    return json({ ok: true, hidden: accion === "ocultar" ? 1 : 0 });
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
  await env.CRM_DB.prepare("UPDATE contacts SET blocked = ?, updated_at = datetime('now') WHERE id = ?").bind(bloquear ? 1 : 0, conv.contact_id).run();
  // Bloqueado: no le sale nada programado, ni los de "mandar siempre".
  if (bloquear) await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status = 'pendiente'").bind(conversationId).run();
  return json({ ok: true, blocked: bloquear ? 1 : 0, aviso });
}

export const onRequestPost = conAuth(post);
