/**
 * Corre cada minuto (ver wrangler.jsonc → triggers.crons) y manda los
 * seguimientos programados que ya vencieron. Si el envío falla (número
 * bloqueado, ventana de 24h cerrada, etc.) queda marcado `fallido` en vez de
 * reintentarse solo — evita un bucle de reintentos contra un número inválido.
 */

import { mandarTexto, mandarMediaGuardada } from "./crm-send.js";

export async function procesarSeguimientosVencidos(env) {
  if (!env.CRM_DB || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;

  const { results: vencidos } = await env.CRM_DB.prepare(
    `SELECT s.*, conv.id AS conv_id, c.wa_id, q.body AS quick_body, q.media_key, q.media_type
     FROM scheduled_messages s
     JOIN conversations conv ON conv.id = s.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     LEFT JOIN quick_replies q ON q.id = s.quick_reply_id
     WHERE s.status = 'pendiente' AND s.send_at <= datetime('now')
     LIMIT 50`
  ).all();

  for (const s of vencidos) {
    try {
      if (s.media_key) {
        await mandarMediaGuardada(env, s.conv_id, s.wa_id, s.media_key, s.media_type || "image", s.body || s.quick_body, "Seguimiento automático");
      } else {
        await mandarTexto(env, s.conv_id, s.wa_id, s.body || s.quick_body, "Seguimiento automático");
      }
      await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'enviado', sent_at = datetime('now') WHERE id = ?")
        .bind(s.id)
        .run();
    } catch (err) {
      console.error("Seguimiento programado:", s.id, err.message);
      await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'fallido', sent_at = datetime('now') WHERE id = ?")
        .bind(s.id)
        .run();
    }
  }
}
