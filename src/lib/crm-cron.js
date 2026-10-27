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

import { mandarTexto, mandarMediaGuardada, pausaEnvio, mandarConEscribiendo, mandarAlToque } from "./crm-send.js";
import { textoPorDefectoSql } from "./crm-variantes.js";
import { encadenarRescate, RESCATE_CATALOGO } from "./planes-plantilla.js";
import { enviarTemplate, enviarCatalogoConPortada, enviarProducto } from "./whatsapp.js";
import { obtenerAjuste, registrarMensajeSaliente, MAX_AUTOMATICOS_SIN_RESPUESTA, ORIGEN_LINK_ENVIO, esOrigenAutomatico } from "./crm-db.js";
import { ajustarAlHorario } from "./horario.js";
import { envDeConversacion } from "./lineas.js";
import { plantillaAprobada, primerNombre } from "./plantillas.js";
import { textoParaChat, parametrosDePlantilla } from "./plantillas-propuestas.js";

// Los seguimientos no suben el chat en la bandeja; sube cuando el cliente responde.
const SIN_SUBIR = { subirEnBandeja: false };

/**
 * Corre antes de mandar: todo lo pendiente que caería entre las 23:30 y las
 * 06:00 (Lima) se reprograma según horario.js (a las 06:00 si la ventana de
 * 24 h sigue abierta; si no, a las 23:29; si tampoco se puede, se cancela).
 */
export async function acomodarAlHorario(env) {
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.id, s.send_at, s.template_name, s.created_by, conv.last_inbound_at, conv.created_at AS conv_creado
     FROM scheduled_messages s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.status = 'pendiente' ORDER BY s.send_at ASC LIMIT 500`
  ).all();
  const ahora = Date.now();
  const cambios = [];
  for (const s of results) {
    const envio = new Date(s.send_at.includes("T") ? s.send_at : s.send_at.replace(" ", "T") + "Z").getTime();
    if (Number.isNaN(envio)) continue;
    // El rescate del día 7 (gratis solo dentro de los 7 días del anuncio): si cae de madrugada se adelanta
    // a las 23:29, nunca se corre a las 06:00 si eso lo saca de la ventana; si no hay hora de día, sale de madrugada.
    const dia7 = s.template_name && s.created_by?.endsWith("Automático (día 7)");
    const vence = dia7
      ? new Date(s.conv_creado.replace(" ", "T") + "Z").getTime() + 7 * 24 * 3600 * 1000 - MARGEN_DIA7_MS
      : s.template_name || !s.last_inbound_at
      ? null
      : new Date(s.last_inbound_at.replace(" ", "T") + "Z").getTime() + 24 * 3600 * 1000;
    const nuevo = ajustarAlHorario(Math.max(envio, ahora), vence, ahora, env.HORARIO_ENVIO);
    if (nuevo === null) {
      if (dia7) continue;
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

/**
 * El rescate del día 7 NUNCA debe salir pasados los 7 días del click del anuncio (regla del dueño). Como salen
 * 12 por pasada, una ola (p. ej. 76 juntos a las 06:00) tarda ~35 min: al acomodar el horario se deja este
 * margen antes del vencimiento, y si aun así llega tarde se cancela en vez de mandarlo fuera de los 7 días.
 */
const MARGEN_DIA7_MS = 45 * 60 * 1000;

/** Rellena {nombre}, {link} y {yape} de los mensajes automáticos. */
export function rellenar(texto, datos) {
  if (!texto) return texto;
  let s = String(texto).replace(/\{yape\}/gi, datos?.yape || "");
  if (!datos) return s;
  return s
    .replace(/\{link\}/gi, datos.link || "")
    .replace(/\{nombre\}/gi, datos.nombre || "estimad@");
}

export async function procesarSeguimientosVencidos(env) {
  if (!env.CRM_DB || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;
  await acomodarAlHorario(env).catch((err) => console.error("Horario de envío:", err.message));

  // Killswitch (api/crm/pausa.js): con la pausa puesta nada programado sale; lo que venza se cancela, no se acumula.
  if ((await obtenerAjuste(env.CRM_DB, "pausa_total").catch(() => null)) === "1") {
    await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE status IN ('pendiente', 'por_aprobar') AND datetime(send_at) <= datetime('now')").run();
    return;
  }

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
    `SELECT s.*, conv.id AS conv_id, c.wa_id, COALESCE(c.name, c.profile_name) AS contact_nombre, ${textoPorDefectoSql("rapida")} AS quick_body,
       q.botones AS quick_botones,
       COALESCE(s.media_key, qm.media_key, q.media_key) AS media_key_real,
       COALESCE(s.media_type, qm.media_type, q.media_type) AS media_type_real,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conv.id AND m.direction = 'out'
          AND m.sent_by = 'Seguimiento automático' AND m.created_at > COALESCE(conv.last_inbound_at, '1970-01-01')) AS automaticos_seguidos,
       (SELECT mi.wa_message_id FROM messages mi WHERE mi.conversation_id = conv.id AND mi.direction = 'in'
          AND mi.type <> 'call' AND mi.wa_message_id IS NOT NULL AND mi.created_at >= datetime('now', '-1 day')
          ORDER BY mi.id DESC LIMIT 1) AS ultimo_wa_in,
       conv.created_at AS conv_creado, conv.etapa AS etapa, conv.pausa_auto AS pausa_auto, conv.meta_tags AS meta_tags,
       (SELECT MAX(mo.created_at) FROM messages mo WHERE mo.conversation_id = conv.id AND mo.direction = 'out') AS ultimo_out_at,
       EXISTS (SELECT 1 FROM messages md WHERE md.conversation_id = conv.id AND md.direction = 'out'
          AND md.body = COALESCE(s.body, ${textoPorDefectoSql("rapida")}) AND md.created_at >= datetime('now', '-2 days')) AS ya_enviado
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
  const cancelar = (id) => env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE id = ?").bind(id).run();
  for (const s of vencidos) {
    const escribiendo = { ultimoWaId: s.ultimo_wa_in || null };
    try {
      // Rescate del día 7 (rescate-lead.js): si compró mientras esperaba, ya no sale.
      if (s.created_by?.endsWith("Automático (día 7)") && (s.etapa >= 5 || /\bpurchase\b/.test(s.meta_tags || ""))) { await cancelar(s.id); continue; }
      // Pasaron los 7 días del click del anuncio: ya no sale (nunca fuera de la ventana).
      if (s.created_by?.endsWith("Automático (día 7)") && s.conv_creado && Date.now() > new Date(s.conv_creado.replace(" ", "T") + "Z").getTime() + 7 * 24 * 3600 * 1000) { await cancelar(s.id); continue; }
      // Killswitch de este chat: lo automático y las plantillas que venzan se cancelan (lo que programó una persona a mano sale).
      if (s.pausa_auto && (s.template_name || esOrigenAutomatico(s.created_by))) { await cancelar(s.id); continue; }
      // Reglas anti-choque para lo que programó el sistema (no una persona):
      if (!s.batch_id && !s.mandar_siempre && !s.template_name && esOrigenAutomatico(s.created_by)) {
        // · el link de seguimiento ya no sale solo (se manda a mano);
        // · a quien ya compró no le sale un "si no responde";
        // · el mismo texto ya le llegó en los últimos 2 días: no se repite;
        // · uno por chat por pasada.
        if (s.created_by === ORIGEN_LINK_ENVIO || s.etapa >= 5 || s.ya_enviado || enviadosAhora[s.conv_id]) {
          await cancelar(s.id);
          continue;
        }
        // · si alguien le escribió hace menos de 30 min, espera 30 min más
        //   (se ve la conversación viva: no se le cruza un automático).
        const ultimoOut = s.ultimo_out_at ? new Date(s.ultimo_out_at.replace(" ", "T") + "Z").getTime() : 0;
        if (ultimoOut && Date.now() - ultimoOut < 30 * 60 * 1000) {
          await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'pendiente', sent_at = NULL, send_at = ? WHERE id = ?")
            .bind(new Date(ultimoOut + 30 * 60 * 1000).toISOString(), s.id).run();
          continue;
        }
      }
      // Tope de insistencia (MAX_AUTOMATICOS_SIN_RESPUESTA), contando también lo que sale en esta pasada.
      const seguidos = (s.automaticos_seguidos || 0) + (enviadosAhora[s.conv_id] || 0);
      if (!s.template_name && !s.mandar_siempre && seguidos >= MAX_AUTOMATICOS_SIN_RESPUESTA) {
        await cancelar(s.id);
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
        const envChat = await envDeConversacion(env, s.conv_id);
        // Rescate con catálogo sin aprobar en Meta (en revisión o rechazada): sale el de siempre, no espera.
        if (s.template_name === RESCATE_CATALOGO.tarot.nombre && !(await plantillaAprobada(envChat, s.template_name).catch(() => null))) {
          s.template_name = RESCATE_CATALOGO.tarot.respaldo;
          s.template_params = null;
          await env.CRM_DB.prepare("UPDATE scheduled_messages SET template_name = ?, body = ?, template_params = NULL WHERE id = ?").bind(s.template_name, `Plantilla: ${s.template_name}`, s.id).run();
        }
        // Los seguimientos de plantilla guardan solo el nombre: las variables se arman al mandar.
        const parametros = s.template_params ? JSON.parse(s.template_params) : await parametrosDePlantilla(envChat, s.template_name, s.contact_nombre).catch(() => []);
        // Solo sale si Meta ya la aprobó en la cuenta de ese número: si el admin todavía no la mandó
        // a revisión (o Meta no responde), espera 30 min y reintenta, hasta 3 días.
        const aprobada = await plantillaAprobada(envChat, s.template_name).catch(() => null);
        if (!aprobada) {
          if (Date.now() - new Date(s.send_at).getTime() > 3 * 24 * 3600 * 1000) throw new Error(`La plantilla ${s.template_name} no está aprobada en Meta.`);
          await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'pendiente', sent_at = NULL, send_at = ? WHERE id = ?")
            .bind(new Date(Date.now() + 30 * 60 * 1000).toISOString(), s.id).run();
          continue;
        }
        // Tantas variables como pide el texto aprobado en Meta: si la plantilla se editó (p. ej. el
        // rescate_lead_1 sin nombre ni producto), las guardadas al programarla sobran o faltan y Meta
        // rechaza el envío. Las que faltan se completan con el nombre y el producto por defecto.
        if (Number.isInteger(aprobada.variables) && parametros.length !== aprobada.variables) {
          const porDefecto = [primerNombre(s.contact_nombre), "el kit de tarot"];
          parametros.splice(aprobada.variables);
          while (parametros.length < aprobada.variables) parametros.push(porDefecto[parametros.length] || "");
        }
        await pausaEnvio(env, s.conv_id, undefined, escribiendo);
        const botonesParams = [];
        if (aprobada.conCopyCode) {
          const yapeNum = await obtenerAjuste(env.CRM_DB, "yape_numero").catch(() => null);
          if (yapeNum) botonesParams.push({ type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: String(yapeNum).slice(0, 20) }] });
        }
        const waMessageId = await mandarConEscribiendo(env, s.conv_id, (e) => enviarTemplate(e, s.wa_id, s.template_name, aprobada.idioma || s.template_language || "es", parametros, botonesParams.length ? botonesParams : undefined));
        await registrarMensajeSaliente(env.CRM_DB, s.conv_id, {
          waMessageId,
          type: "template",
          body: await textoParaChat(envChat, s.template_name, parametros),
          sentBy: s.created_by || "Envío masivo"
        });
      } else if (s.catalogo) {
        // Catálogo completo o un producto. Si además lleva foto/video, va antes.
        // Foto/video y catálogo: al toque, sin "escribiendo…".
        if (s.media_key_real) {
          await mandarMediaGuardada(env, s.conv_id, s.wa_id, s.media_key_real, s.media_type_real || "image", null, "Seguimiento automático", undefined, undefined, SIN_SUBIR);
        }
        let waMessageId;
        // El catálogo es el de la línea del chat (el de URO no es el de Tarot Store).
        const catalogoId = (await envDeConversacion(env, s.conv_id)).WHATSAPP_CATALOG_ID;
        if (s.catalogo === "*") {
          // La miniatura sale del caché de productos: sin pedirle la lista a Meta.
          // Solo productos del catálogo conectado: el caché también guarda
          // filas viejas de otro catálogo, que Meta no puede usar de portada.
          const { results: portadas } = await env.CRM_DB.prepare(
            "SELECT retailer_id FROM catalog_products WHERE catalog_id = ? AND image_url IS NOT NULL ORDER BY cached_at DESC LIMIT 3"
          ).bind(catalogoId || "").all().catch(() => ({ results: [] }));
          waMessageId = await mandarAlToque(env, s.conv_id, (e) => enviarCatalogoConPortada(e, s.wa_id, texto || undefined, portadas.map((p) => p.retailer_id)));
        } else {
          if (!catalogoId) throw new Error("Falta el catálogo de esta línea.");
          waMessageId = await mandarAlToque(env, s.conv_id, (e) => enviarProducto(e, s.wa_id, e.WHATSAPP_CATALOG_ID, s.catalogo, texto || undefined));
        }
        await registrarMensajeSaliente(env.CRM_DB, s.conv_id, {
          waMessageId,
          type: s.catalogo === "*" ? "catalog" : "product",
          body: s.catalogo === "*" ? "[Catálogo enviado]" : (s.catalogo_nombre || "Producto del catálogo"),
          sentBy: "Seguimiento automático"
        }, SIN_SUBIR);
      } else if (s.media_key_real) {
        await mandarMediaGuardada(env, s.conv_id, s.wa_id, s.media_key_real, s.media_type_real || "image", texto, "Seguimiento automático", undefined, undefined, SIN_SUBIR);
      } else {
        await pausaEnvio(env, s.conv_id, undefined, escribiendo);
        await mandarTexto(env, s.conv_id, s.wa_id, texto, "Seguimiento automático", undefined, SIN_SUBIR, (() => { try { return JSON.parse(s.botones || s.quick_botones || "[]"); } catch { return []; } })());
      }
      enviadosAhora[s.conv_id] = (enviadosAhora[s.conv_id] || 0) + 1;
      const marcar = [
        env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'enviado', sent_at = datetime('now') WHERE id = ?").bind(s.id)
      ];
      if (s.created_by === ORIGEN_LINK_ENVIO) {
        marcar.push(env.CRM_DB.prepare("UPDATE envio_links SET estado = 'enviado', actualizado_at = datetime('now') WHERE scheduled_id = ?").bind(s.id));
      }
      await env.CRM_DB.batch(marcar);
      // Terminó la cadena de 24 h sin respuesta: el rescate con plantilla queda por aprobar.
      if (!s.template_name) await encadenarRescate(env, s.conv_id, s.created_by, s.etapa).catch((err) => console.error("Encadenar rescate:", err.message));
    } catch (err) {
      console.error("Seguimiento programado:", s.id, err.message);
      await env.CRM_DB.prepare("UPDATE scheduled_messages SET status = 'fallido', sent_at = datetime('now') WHERE id = ?")
        .bind(s.id)
        .run()
        .catch(() => {});
    }
  }
}
