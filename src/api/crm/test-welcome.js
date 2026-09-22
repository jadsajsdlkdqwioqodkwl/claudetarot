/**
 * POST /api/crm/test-welcome — { wa_id } → manda ahora mismo la respuesta
 * rápida configurada como bienvenida de anuncios, a un número real, para
 * probar cómo se ve antes de lanzar la campaña. Solo admin.
 *
 * WhatsApp igual exige la ventana de 24h: el número tiene que haberte
 * escrito antes (mándate un mensaje de prueba a ti mismo una vez). No
 * fabrica ningún dato de anuncio, solo reusa el contenido configurado.
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { obtenerAjuste } from "../../lib/crm-db.js";
import { mandarTexto, mandarMediaGuardada } from "../../lib/crm-send.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const waId = String(payload?.wa_id || "").replace(/\D/g, "");
  if (waId.length < 10) return json({ error: "WhatsApp inválido." }, 422);

  const quickReplyId = await obtenerAjuste(env.CRM_DB, "ad_welcome_quick_reply_id");
  if (!quickReplyId) return json({ error: "Todavía no marcaste ninguna respuesta rápida como bienvenida (⚡ → estrella)." }, 400);

  const quickReply = await env.CRM_DB.prepare("SELECT * FROM quick_replies WHERE id = ?").bind(Number(quickReplyId)).first();
  if (!quickReply) return json({ error: "La respuesta rápida marcada ya no existe." }, 404);

  const contacto = await env.CRM_DB.prepare("SELECT c.id AS contact_id, conv.id AS conversation_id FROM contacts c JOIN conversations conv ON conv.contact_id = c.id WHERE c.wa_id = ?")
    .bind(waId)
    .first();
  if (!contacto) {
    return json({ error: "Ese número no tiene ninguna conversación todavía — mándate un WhatsApp de prueba a ti mismo primero, así se abre la ventana de 24h." }, 404);
  }

  const media = await env.CRM_DB.prepare("SELECT * FROM quick_reply_media WHERE quick_reply_id = ? ORDER BY sort_order ASC")
    .bind(quickReply.id)
    .all();

  try {
    if (media.results.length) {
      await Promise.all(media.results.map((m) =>
        mandarMediaGuardada(env, contacto.conversation_id, waId, m.media_key, m.media_type, quickReply.body, `Prueba de bienvenida (${agent?.displayName || agent?.username})`)
      ));
    } else if (quickReply.body) {
      await mandarTexto(env, contacto.conversation_id, waId, quickReply.body, `Prueba de bienvenida (${agent?.displayName || agent?.username})`);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: `WhatsApp rechazó el envío: ${err.message}` }, 502);
  }
}

export const onRequestPost = conAdmin(post);
