/**
 * Corre cada 5 minutos (ver wrangler.jsonc → triggers.crons) y manda los
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
import { enviarTemplate, enviarCatalogoConPortada, enviarProducto } from "./whatsapp.js";
import { registrarMensajeSaliente, MAX_AUTOMATICOS_SIN_RESPUESTA, ORIGEN_LINK_ENVIO } from "./crm-db.js";
import { ajustarAlHorario } from "./horario.js";

// Los seguimientos no suben el chat en la bandeja; sube cuando el cliente responde.
const SIN_SUBIR = { subirEnBandeja: false };

/**
 * Corre antes de mandar: todo lo pendiente que caería entre las 23:30 y las
 * 06:00 (Lima) se reprograma según horario.js (a las 06:00 si la ventana de
 * 24 h sigue abierta; si no, a las 23:29; si tampoco se puede, se cancela).
 */
export async function acomodarAlHorario(env) {
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.id, s.send_at, s.template_name, conv.last_inbound_at
     FROM scheduled_messages s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.status = 'pendiente' ORDER BY s.send_at ASC LIMIT 500`
  ).all();
  const ahora = Date.now();
  const cambios = [];
  for (const s of results) {
    const envio = new Date(s.send_at.includes("T") ? s.send_at : s.send_at.replace(" ", "T") + "Z").getTime();
    if (Number.isNaN(envio)) continue;
    const vence = s.template_name || !s.last_inbound_at
      ? null
      : new Date(s.last_inbound_at.replace(" ", "T") + "Z").getTime() + 24 * 3600 * 1000;
    const nuevo = ajustarAlHorario(Math.max(envio, ahora), vence, ahora, env.HORARIO_ENVIO);
    if (nuevo === null) {
      cambios.push(env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE id = ? AND status = 'pendiente'").bind(s.id));
    } else if (nuevo !== Math.max(envio, ahora)) {
      cambios.push(env.CRM_DB.prepare("UPDATE scheduled_messages SET send_at = ? WHERE id = ? AND status = 'pendiente'").bind(new Date(nuevo).toISOString(), s.id));
    }
  }
  if (cambios.length) await env.CRM_DB.batch(cambios);
}

/**
 * Cuántos se mandan por pasada. El plan gratis de Workers corta en 50
 * consultas a D1 y 50 llamadas externas por ejecución: cada envío gasta ~2 de
 * cada una (registrarlo y marcarlo; "escribiendo" y el envío a Meta). Con 12
 * cada 5 min salen hasta 144 por hora, que alcanza de sobra; un envío masivo
 * grande simplemente tarda más, en vez de cortarse a la mitad sin registrar.
 */
const POR_PASADA = 12;

/** Rellena {nombre} y {link} de los mensajes automáticos que los llevan (Link de envío). */
export function rellenar(texto, datos) {
  if (!texto || !datos) return texto;
  return String(texto)
    .replace(/\{link\}/gi, datos.link || "")
    .replace(/\{nombre\}/gi, datos.nombre || "estimad@");
}

export async function procesarSeguimientosVencidos(env) {
  if (!env.CRM_DB || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;
  await acomodarAlHorario(env).catch((err) => console.error("Horario de envío:", err.message));

  // Se "reservan" antes de mandar (pendiente → enviando en un solo UPDATE):
  // si dos pasadas se cruzan, ninguna manda dos veces lo mismo. Lo que quedó
  // en "enviando" por una pasada que murió a la mitad se marca fallido (no se
  // reenvía: puede que sí haya salido).
  // `sent_at` guarda cuándo se reservó (luego, cuándo salió): solo lo reservado
  // hace más de 15 min cuenta como abandonado, nunca lo que otra pasada está mandando.
  await env.CRM_DB.prepare(
    "UPDATE scheduled_messages SET status = 'fallido' WHERE status = 'enviando' AND datetime(sent_at) < datetime('now', '-15 minutes')"
  ).run();
  const { results: reservados } = await env.CRM_DB.prepare(
    `UPDATE scheduled_messages SET status = 'enviando', sent_at = datetime('now')
     WHERE id IN (SELECT id FROM scheduled_messages WHERE status = 'pendiente' AND datetime(send_at) <= datetime('now')
                  ORDER BY send_at LIMIT ?)
     RETURNING id`
  ).bind(POR_PASADA).all();
  if (!reservados.length) return;

  // El media puede venir de tres lados: subido directo al programar el
  // seguimiento (s.media_key), o de la respuesta rápida elegida — su primera
  // foto/video en quick_reply_media (multi-foto) o, si es una respuesta
  // rápida vieja de antes de esa tabla, su columna suelta qr.media_key.
  // En la misma consulta: cuántos automáticos van sin respuesta y el último
  // mensaje del cliente (para el "escribiendo…"), sin una consulta por envío.
  const marcas = reservados.map(() => "?").join(",");
  const { results: vencidos } = await env.CRM_DB.prepare(
    `SELECT s.*, conv.id AS conv_id, c.wa_id, q.body AS quick_body,
       COALESCE(s.media_key, qm.media_key, q.media_key) AS media_key_real,
       COALESCE(s.media_type, qm.media_type, q.media_type) AS media_type_real,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conv.id AND m.direction = 'out'
          AND m.sent_by = 'Seguimiento automático' AND m.created_at > COALESCE(conv.last_inbound_at, '1970-01-01')) AS automaticos_seguidos,
       (SELECT mi.wa_message_id FROM messages mi WHERE mi.conversation_id = conv.id AND mi.direction = 'in'
          AND mi.type <> 'call' AND mi.wa_message_id IS NOT NULL AND mi.created_at >= datetime('now', '-1 day')
          ORDER BY mi.id DESC LIMIT 1) AS ultimo_wa_in
     FROM scheduled_messages s
     JOIN conversations conv ON conv.id = s.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     LEFT JOIN quick_replies q ON q.id = s.quick_reply_id
     LEFT JOIN quick_reply_media qm ON qm.quick_reply_id = s.quick_reply_id AND qm.sort_order = (
       SELECT MIN(sort_order) FROM quick_reply_media WHERE quick_reply_id = s.quick_reply_id
     )
     WHERE s.id IN (${marcas}) ORDER BY s.send_at`
  ).bind(...reservados.map((r) => r.id)).all();

  const enviadosAhora = {};
  for (const s of vencidos) {
    const escribiendo = { ultimoWaId: s.ultimo_wa_in || null };
    try {
      // Tope de insistencia (MAX_AUTOMATICOS_SIN_RESPUESTA), contando también lo que sale en esta pasada.
      const seguidos = (s.automaticos_seguidos || 0) + (enviadosAhora[s.conv_id] || 0);
      if (!s.template_name && !s.mandar_siempre && seguidos >= MAX_AUTOMATICOS_SIN_RESPUESTA) {
        await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE id = ?").bind(s.id).run();
        continue;
      }
      let datos = null;
      if (s.created_by === ORIGEN_LINK_ENVIO && s.template_params && !s.template_name) {
        try { datos = JSON.parse(s.template_params); } catch { datos = null; }
      }
      const texto = rellenar(s.body || s.quick_body, datos);
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
      } else if (s.catalogo) {
        // Catálogo completo o un producto. Si además lleva foto/video, va antes.
        await pausaEnvio(env, s.conv_id, undefined, escribiendo);
        if (s.media_key_real) {
          await mandarMediaGuardada(env, s.conv_id, s.wa_id, s.media_key_real, s.media_type_real || "image", null, "Seguimiento automático", undefined, undefined, SIN_SUBIR);
        }
        let waMessageId;
        if (s.catalogo === "*") {
          // La miniatura sale del caché de productos: sin pedirle la lista a Meta.
          // Solo productos del catálogo conectado: el caché también guarda
          // filas viejas de otro catálogo, que Meta no puede usar de portada.
          const { results: portadas } = await env.CRM_DB.prepare(
            "SELECT retailer_id FROM catalog_products WHERE catalog_id = ? AND image_url IS NOT NULL ORDER BY cached_at DESC LIMIT 3"
          ).bind(env.WHATSAPP_CATALOG_ID || "").all().catch(() => ({ results: [] }));
          waMessageId = await enviarCatalogoConPortada(env, s.wa_id, texto || undefined, portadas.map((p) => p.retailer_id));
        } else {
          if (!env.WHATSAPP_CATALOG_ID) throw new Error("Falta WHATSAPP_CATALOG_ID.");
          waMessageId = await enviarProducto(env, s.wa_id, env.WHATSAPP_CATALOG_ID, s.catalogo, texto || undefined);
        }
        await registrarMensajeSaliente(env.CRM_DB, s.conv_id, {
          waMessageId,
          type: s.catalogo === "*" ? "catalog" : "product",
          body: s.catalogo === "*" ? "[Catálogo enviado]" : (s.catalogo_nombre || "Producto del catálogo"),
          sentBy: "Seguimiento automático"
        }, SIN_SUBIR);
      } else if (s.media_key_real) {
        await pausaEnvio(env, s.conv_id, undefined, escribiendo);
        await mandarMediaGuardada(env, s.conv_id, s.wa_id, s.media_key_real, s.media_type_real || "image", texto, "Seguimiento automático", undefined, undefined, SIN_SUBIR);
      } else {
        await pausaEnvio(env, s.conv_id, undefined, escribiendo);
        await mandarTexto(env, s.conv_id, s.wa_id, texto, "Seguimiento automático", undefined, SIN_SUBIR);
      }
      enviadosAhora[s.conv_id] = (enviadosAhora[s.conv_id] || 0) + 1;
      const marcar = [
        env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'enviado', sent_at = datetime('now') WHERE id = ?").bind(s.id)
      ];
      if (s.created_by === ORIGEN_LINK_ENVIO) {
        marcar.push(env.CRM_DB.prepare("UPDATE envio_links SET estado = 'enviado', actualizado_at = datetime('now') WHERE scheduled_id = ?").bind(s.id));
      }
      await env.CRM_DB.batch(marcar);
    } catch (err) {
      console.error("Seguimiento programado:", s.id, err.message);
      await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'fallido', sent_at = datetime('now') WHERE id = ?")
        .bind(s.id)
        .run();
    }
  }
}
