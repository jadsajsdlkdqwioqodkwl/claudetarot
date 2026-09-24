/**
 * Corre cada minuto (ver wrangler.jsonc → triggers.crons) y manda los
 * seguimientos programados que ya vencieron. Si el envío falla (número
 * bloqueado, ventana de 24h cerrada, etc.) queda marcado `fallido` en vez de
 * reintentarse solo — evita un bucle de reintentos contra un número inválido.
 *
 * Este cron nunca manda plantilla salvo que `s.template_name` venga seteado
 * (solo lo pone bulk-send) — un seguimiento sin eso es texto libre y por
 * eso falla en silencio fuera de ventana en vez de cobrar. Ver
 * docs/whatsapp-ventanas-y-costos.md para cuándo cobra cada tipo.
 */

import { mandarTexto, mandarMediaGuardada, pausaEnvio } from "./crm-send.js";
import { enviarTemplate } from "./whatsapp.js";
import { registrarMensajeSaliente } from "./crm-db.js";

export async function procesarSeguimientosVencidos(env) {
  if (!env.CRM_DB || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;

  // El media puede venir de tres lados: subido directo al programar el
  // seguimiento (s.media_key), o de la respuesta rápida elegida — su primera
  // foto/video en quick_reply_media (multi-foto) o, si es una respuesta
  // rápida vieja de antes de esa tabla, su columna suelta qr.media_key.
  const { results: vencidos } = await env.CRM_DB.prepare(
    `SELECT s.*, conv.id AS conv_id, c.wa_id, q.body AS quick_body,
       COALESCE(s.media_key, qm.media_key, q.media_key) AS media_key_real,
       COALESCE(s.media_type, qm.media_type, q.media_type) AS media_type_real
     FROM scheduled_messages s
     JOIN conversations conv ON conv.id = s.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     LEFT JOIN quick_replies q ON q.id = s.quick_reply_id
     LEFT JOIN quick_reply_media qm ON qm.quick_reply_id = s.quick_reply_id AND qm.sort_order = (
       SELECT MIN(sort_order) FROM quick_reply_media WHERE quick_reply_id = s.quick_reply_id
     )
     WHERE s.status = 'pendiente' AND datetime(s.send_at) <= datetime('now')
     LIMIT 50`
  ).all();

  for (const s of vencidos) {
    try {
      if (s.template_name) {
        // Plantilla: para escribirle a alguien fuera de la ventana de 24h
        // (típico de un envío masivo a contactos viejos que no escribieron).
        const parametros = s.template_params ? JSON.parse(s.template_params) : [];
        const waMessageId = await enviarTemplate(env, s.wa_id, s.template_name, s.template_language || "es", parametros);
        await registrarMensajeSaliente(env.CRM_DB, s.conv_id, {
          waMessageId,
          type: "template",
          body: `Plantilla: ${s.template_name}`,
          sentBy: s.created_by || "Envío masivo"
        });
      } else if (s.media_key_real) {
        await pausaEnvio(env, s.conv_id);
        await mandarMediaGuardada(env, s.conv_id, s.wa_id, s.media_key_real, s.media_type_real || "image", s.body || s.quick_body, "Seguimiento automático");
      } else {
        await pausaEnvio(env, s.conv_id);
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
