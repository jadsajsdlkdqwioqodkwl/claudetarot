/**
 * Consultas compartidas contra D1 (binding `CRM_DB`). Todo lo que toca más de
 * un endpoint vive aquí para no repetir el SQL.
 */

import { contieneCodigo } from "./ventas.js";

// created_by del recojo en Shalom (planes-plantilla.js: PREFIJO_PLAN + título del plan).
const ORIGEN_COBRO_SHALOM = "Plan con plantilla · Recojo en Shalom";

export async function obtenerOCrearContacto(db, waId, profileName, referral) {
  const existente = await db
    .prepare("SELECT * FROM contacts WHERE wa_id = ?")
    .bind(waId)
    .first();
  if (existente) {
    if (profileName && profileName !== existente.profile_name) {
      await db
        .prepare("UPDATE contacts SET profile_name = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(profileName, existente.id)
        .run();
    }
    return { ...existente, _isNew: false };
  }

  // El `referral` solo viene en el primer mensaje si el chat empezó desde un
  // anuncio "Click to WhatsApp" — así queda guardado desde el primer contacto,
  // que es el único momento en que WhatsApp lo manda.
  const insertado = await db
    .prepare(
      `INSERT INTO contacts
        (wa_id, profile_name, first_seen_at, ctwa_clid, ad_source_type, ad_source_id, ad_source_url, ad_headline, ad_body, ad_media_type)
       VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(
      waId,
      profileName || null,
      referral?.ctwa_clid || null,
      referral?.source_type || null,
      referral?.source_id || null,
      referral?.source_url || null,
      referral?.headline || null,
      referral?.body || null,
      referral?.media_type || null
    )
    .first();
  return { ...insertado, _isNew: true };
}

/** El clic del anuncio en un contacto que ya existía (llegó antes por otro número). */
export async function guardarAnuncioDelContacto(db, contacto, referral) {
  await db.prepare(
    `UPDATE contacts SET ctwa_clid = ?, ad_source_type = ?, ad_source_id = ?, ad_source_url = ?, ad_headline = ?, ad_body = ?, ad_media_type = ?
     WHERE id = ? AND ctwa_clid IS NULL`
  ).bind(referral.ctwa_clid, referral.source_type || null, referral.source_id || null, referral.source_url || null,
    referral.headline || null, referral.body || null, referral.media_type || null, contacto.id).run();
  Object.assign(contacto, { ctwa_clid: referral.ctwa_clid, ad_source_type: referral.source_type || null });
}

/**
 * Un chat por cliente y por número de WhatsApp (línea, src/lib/lineas.js):
 * si el mismo cliente le escribe a Tarot Store y al número de pruebas, son
 * dos chats aparte, cada uno sale por su número. `lineaId` null = la principal.
 */
export async function obtenerOCrearConversacion(db, contactId, lineaId = null) {
  let existente;
  try {
    existente = await db
      .prepare("SELECT * FROM conversations WHERE contact_id = ? AND COALESCE(linea_id, 0) = ? ORDER BY id ASC LIMIT 1")
      .bind(contactId, lineaId || 0)
      .first();
  } catch {
    // Sin la migración 0045 (linea_id): como antes, un chat por cliente.
    existente = await db.prepare("SELECT * FROM conversations WHERE contact_id = ?").bind(contactId).first();
    if (existente) return existente;
    return { ...(await db.prepare("INSERT INTO conversations (contact_id) VALUES (?) RETURNING *").bind(contactId).first()), _isNew: true };
  }
  if (existente) return existente;

  const nueva = await db
    .prepare("INSERT INTO conversations (contact_id, linea_id) VALUES (?, ?) RETURNING *")
    .bind(contactId, lineaId || null)
    .first();
  return { ...nueva, _isNew: true };
}

export async function registrarMensajeEntrante(db, conversationId, { waMessageId, type, body, fileName, mediaId, mediaMime, replyToMessageId, viewOnce }) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, file_name, media_id, media_mime, status, reply_to_message_id, view_once)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?, 'received', ?, ?)`
    )
    .bind(conversationId, waMessageId || null, type, body || null, fileName || null, mediaId || null, mediaMime || null, replyToMessageId || null, viewOnce ? 1 : 0)
    .run();

  await db
    .prepare(
      `UPDATE conversations
       SET unread_count = unread_count + 1,
           last_message_at = datetime('now'),
           last_inbound_at = datetime('now'),
           status = 'abierta',
           hidden = 0
       WHERE id = ?`
    )
    .bind(conversationId)
    .run();
}

export async function registrarMensajeSaliente(db, conversationId, { waMessageId, type, body, mediaKey, mediaMime, sentBy, replyToMessageId, fileName }, { subirEnBandeja = true } = {}) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, media_key, media_mime, status, sent_by, reply_to_message_id, file_name)
       VALUES (?, ?, 'out', ?, ?, ?, ?, 'sent', ?, ?, ?)`
    )
    .bind(conversationId, waMessageId || null, type, body || null, mediaKey || null, mediaMime || null, sentBy || null, replyToMessageId || null, fileName || null)
    .run();

  // Le mandamos su código de Shalom: ya no hace falta su cobro (dueño, 2026-10-23). Cuenta cualquier envío.
  if (body) await terminarCobroSiLlevaCodigo(db, conversationId, body);

  // Un seguimiento automático no sube el chat en la bandeja: sube recién
  // cuando el cliente responde (registrarMensajeEntrante). Una PLANTILLA
  // tampoco, venga de donde venga (a mano, asesor, masivo, rescate, Shalom):
  // regla del dueño (2026-10-14), solo se reflota cuando el cliente escribe.
  if (!subirEnBandeja || type === "template") return;

  await db
    // Si le respondimos (a mano, la bienvenida o un seguimiento), lo que el
    // cliente mandó antes ya no cuenta como "sin leer": el (1) vuelve a
    // aparecer recién cuando el cliente escriba de nuevo.
    .prepare(`UPDATE conversations SET last_message_at = datetime('now'), unread_count = 0 WHERE id = ?`)
    .bind(conversationId)
    .run();
}

/** Si el texto que salió lleva la clave de Shalom del cliente (su perfil), se cancelan TODOS los
 * seguimientos no-batch y no-mandar_siempre del chat: si le damos su código es porque ya pagó. */
async function terminarCobroSiLlevaCodigo(db, conversationId, texto) {
  const c = await db
    .prepare("SELECT c.shalom_code FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?")
    .bind(conversationId)
    .first();
  if (!contieneCodigo(texto, c?.shalom_code)) return;
  await db
    // Los planes de recojo (cobro Shalom/Olva) se conservan: el cliente todavía tiene que pagar el saldo.
    .prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND mandar_siempre = 0 AND batch_id IS NULL AND created_by NOT LIKE 'Plan con plantilla · Recojo%'")
    .bind(conversationId)
    .run();
}

export async function actualizarEstadoMensaje(db, waMessageId, status, errorDetail) {
  await db
    // Un "sent"/"delivered" que llega tarde no tapa el visto del cliente.
    .prepare("UPDATE messages SET status = ?, error_detail = ? WHERE wa_message_id = ? AND NOT (status = 'read' AND ? IN ('sent', 'delivered'))")
    .bind(status, errorDetail || null, waMessageId, status)
    .run();
}

/** Busca el id interno de un mensaje por su wa_message_id — para resolver a qué mensaje responde uno entrante. */
export async function idPorWaMessageId(db, waMessageId) {
  if (!waMessageId) return null;
  const fila = await db.prepare("SELECT id FROM messages WHERE wa_message_id = ?").bind(waMessageId).first();
  return fila?.id || null;
}

/** Guarda la reacción que puso el CLIENTE a uno de nuestros mensajes (o a uno suyo) — emoji null/"" la quita. */
export async function registrarReaccionCliente(db, conversationId, targetWaMessageId, emoji) {
  if (!targetWaMessageId) return;
  await db
    .prepare("UPDATE messages SET client_reaction = ? WHERE conversation_id = ? AND wa_message_id = ?")
    .bind(emoji || null, conversationId, targetWaMessageId)
    .run();
}

/** Guarda la reacción que puso EL VENDEDOR a un mensaje — emoji null/"" la quita. */
export async function guardarReaccionPropia(db, messageId, emoji) {
  await db.prepare("UPDATE messages SET agent_reaction = ? WHERE id = ?").bind(emoji || null, messageId).run();
}

/** Cancela los seguimientos programados pendientes de una conversación — se usa cuando el cliente escribe o cuando nosotros le mandamos algo a mano, para no insistir con un mensaje que ya quedó desactualizado. */
export async function cancelarSeguimientosPendientes(db, conversationId) {
  await db
    // Los marcados "mandar siempre" no se cancelan: salen aunque el cliente escriba.
    // También los planes con plantilla que esperaban aprobación: ya respondió. El recojo en Shalom ya
    // aprobado NO se cancela: si responde ("gracias") se vuelve a contar desde ahí (rearmarPlanShalom).
    .prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND mandar_siempre = 0 AND NOT (status = 'pendiente' AND created_by LIKE 'Plan con plantilla · Recojo en%')")
    .bind(conversationId)
    .run();
}

/**
 * Dos clases de seguimiento, que se distinguen por `created_by`:
 * - "Tras no respuesta" (la secuencia de leads): la que programa solo el
 *   webhook con un lead nuevo de anuncio (ORIGEN_SEGUIMIENTO_AUTO) y la
 *   misma secuencia aplicada a mano ("Seguimiento de leads · Nombre").
 *   Se cancela si el cliente escribe O si nosotros le escribimos.
 * - Manual (cualquier otro mensaje o secuencia que programa una asesora):
 *   se cancela solo si el cliente escribe — los mensajes de la propia
 *   asesora no la borran (antes sí: programar un recordatorio y seguir
 *   escribiendo lo cancelaba sin avisar).
 */
export const ORIGEN_SEGUIMIENTO_AUTO = "Seguimiento automático (anuncio)";
export const PREFIJO_SEGUIMIENTO_LEAD = "Seguimiento de leads";
export const origenSeguimientoLead = (nombre) => (nombre ? `${PREFIJO_SEGUIMIENTO_LEAD} · ${nombre}` : PREFIJO_SEGUIMIENTO_LEAD);

/**
 * Lo que se programa al aprobar una sugerencia del asesor (✨ Sugerencias).
 * Cuenta como "tras no respuesta": si una vendedora le escribe a mano al
 * cliente, lo que quedaba pendiente de la sugerencia se cancela (el chat ya
 * cambió y el texto quedó viejo; antes salía igual y el cliente recibía el
 * mensaje de la vendedora y encima el automático).
 */
export const PREFIJO_SUGERENCIA = "Sugerencia del asesor";
export const origenSugerencia = (quien) => `${PREFIJO_SUGERENCIA} · ${quien || "CRM"}`;

/**
 * Tope de insistencia (docs/negocio.md: "hasta 3–4 mensajes por cliente"):
 * con este número de seguimientos automáticos ya enviados sin que el cliente
 * responda, el cron no manda más texto libre. Bajado de 4 a 2 porque se
 * estaban mandando demasiados mensajes seguidos sin respuesta. Se suman todas las fuentes (secuencia
 * de leads, respuesta rápida, sugerencias, carrito), que antes podían apilarse.
 */
export const MAX_AUTOMATICOS_SIN_RESPUESTA = 2;

/**
 * El link de seguimiento del pedido (página /TS-…), que sale solo 23 h
 * después del último mensaje del cliente (crm-links-envio.js). Va con
 * `mandar_siempre` (no lo cancela que el cliente escriba: se corre la hora)
 * y su texto es la respuesta rápida "Link de envío", editable por el equipo;
 * `template_params` guarda { link, nombre } para rellenar {link} y {nombre}.
 */
export const ORIGEN_LINK_ENVIO = "Link de envío";

/**
 * Seguimiento de una respuesta rápida: al mandar una que tiene secuencia
 * (`followup_pasos`, hasta 4 pasos con texto y/o archivo, o el viejo
 * `followup_body`), se programa cada paso `horas` después del anterior, sin
 * pasar de 23 h desde el último mensaje del cliente. Se programa SOLO al mandar la
 * rápida (no hace falta tocar nada); lo cancela el cliente al escribir o cualquier mensaje nuestro
 * (`cancelarSeguimientosDeLead`), y entonces la burbuja ofrece «Reactivar seguimiento».
 * Reemplaza al seguimiento de respuesta rápida que ya estuviera pendiente en
 * ese chat. Se apaga para todas con el ajuste `quick_followup_auto` = "0".
 * Devuelve null si quedó programado, o el motivo (texto) por el que no.
 */
export const PREFIJO_SEGUIMIENTO_RAPIDA = "Seguimiento de respuesta rápida";
export const HORAS_SEGUIMIENTO_RAPIDA = 20;

/** Los pasos activos del seguimiento de una respuesta rápida: { titulo, pasos } (null si ya no existe). */
export async function pasosDeSeguimientoRapida(db, quickReplyId) {
  const q = await db.prepare("SELECT title, followup_body, followup_hours, followup_pasos FROM quick_replies WHERE id = ?").bind(quickReplyId).first();
  if (!q) return null;
  // La secuencia (hasta 4 pasos) o, en respuestas viejas, un solo seguimiento.
  let pasos = [];
  try { pasos = JSON.parse(q.followup_pasos || "[]") || []; } catch { pasos = []; }
  if (!pasos.length && q.followup_body) pasos = [{ horas: q.followup_hours || HORAS_SEGUIMIENTO_RAPIDA, body: q.followup_body }];
  return { titulo: q.title, pasos: pasos.filter((p) => p.activo !== false) }; // los pasos apagados no se programan
}

/** Los pasos de seguimiento tal como están guardados en la respuesta rápida (con los apagados). */
function pasosGuardados(q) {
  let pasos = [];
  try { pasos = JSON.parse(q?.followup_pasos || "[]") || []; } catch { pasos = []; }
  if (!pasos.length && q?.followup_body) pasos = [{ horas: q.followup_hours || HORAS_SEGUIMIENTO_RAPIDA, body: q.followup_body }];
  return pasos;
}

/**
 * Al guardar una respuesta rápida, sus seguimientos YA programados siguen con
 * el texto de antes (cada paso se copió a `scheduled_messages.body` al mandarla)
 * y el cron manda esa copia: salía el texto viejo aunque el equipo ya lo hubiera
 * cambiado. Esto pone el texto nuevo en los pendientes. `antes` es la fila de
 * `quick_replies` leída ANTES de guardar. Cada pendiente se reconoce por su texto
 * (el del paso viejo): lo que una persona cambió a mano para ese chat con
 * «Reactivar seguimiento» no coincide con ningún paso y se respeta. Un paso que
 * se quitó o apagó cancela su pendiente; el título nuevo se refleja en el origen.
 * Devuelve cuántos pendientes cambió.
 */
export async function sincronizarSeguimientosPendientes(db, quickReplyId, antes) {
  const ahora = await db.prepare("SELECT title, followup_body, followup_hours, followup_pasos FROM quick_replies WHERE id = ?").bind(quickReplyId).first();
  if (!ahora || !antes) return 0;
  const viejos = pasosGuardados(antes);
  const nuevos = pasosGuardados(ahora);
  const origenAntes = `${PREFIJO_SEGUIMIENTO_RAPIDA} · ${antes.title}`;
  const origenAhora = `${PREFIJO_SEGUIMIENTO_RAPIDA} · ${ahora.title}`;
  const { results: filas } = await db.prepare(
    "SELECT id, conversation_id, body, botones FROM scheduled_messages WHERE status = 'pendiente' AND template_name IS NULL AND batch_id IS NULL AND created_by = ? ORDER BY send_at, id"
  ).bind(origenAntes).all();
  const usados = new Map(); // por chat: qué pasos viejos ya tienen su pendiente
  const ops = [];
  let cambios = 0;
  for (const f of filas) {
    const ya = usados.get(f.conversation_id) || new Set();
    usados.set(f.conversation_id, ya);
    const i = viejos.findIndex((p, k) => !ya.has(k) && !p.plantilla && !p.media_key && (p.body || null) === (f.body || null));
    if (i < 0) continue; // otro texto: lo editó una persona para este chat
    ya.add(i);
    const n = nuevos[i];
    if (!n || n.activo === false) {
      ops.push(db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE id = ? AND status = 'pendiente'").bind(f.id));
      cambios++;
      continue;
    }
    if (n.plantilla || n.media_key) continue; // cambió de tipo: no se convierte sobre la marcha
    const botones = n.body && Array.isArray(n.botones) && n.botones.length ? JSON.stringify(n.botones.slice(0, 3)) : null;
    if ((n.body || null) === (f.body || null) && botones === (f.botones || null)) continue;
    ops.push(db.prepare("UPDATE scheduled_messages SET body = ?, botones = ? WHERE id = ? AND status = 'pendiente'").bind(n.body || null, botones, f.id));
    cambios++;
  }
  if (origenAntes !== origenAhora) {
    ops.push(db.prepare("UPDATE scheduled_messages SET created_by = ? WHERE status = 'pendiente' AND created_by = ?").bind(origenAhora, origenAntes));
  }
  if (ops.length) await db.batch(ops);
  return cambios;
}

/**
 * `editados` (opcional, el botón «Reactivar seguimiento» del chat): [{ horas, body, activo }] por posición
 * sobre los pasos activos; cambia la espera y el texto solo para este chat (la respuesta rápida no se toca).
 */
export async function programarSeguimientoDeRapida(db, conversationId, quickReplyId, editados = null) {
  if ((await obtenerAjuste(db, "quick_followup_auto")) === "0") return "El seguimiento de respuestas rápidas está apagado para todas (ajuste del admin).";
  const q = await pasosDeSeguimientoRapida(db, quickReplyId);
  if (!q) return "Esa respuesta rápida ya no existe.";
  let pasos = q.pasos;
  if (Array.isArray(editados)) {
    pasos = pasos.map((p, i) => {
      const e = editados[i];
      if (!e) return p;
      if (e.activo === false) return null;
      const horas = Number(e.horas);
      return {
        ...p,
        ...(horas > 0 && horas <= (p.plantilla ? 1440 : 168) ? { horas } : {}),
        ...(!p.plantilla && typeof e.body === "string" && (e.body.trim() || p.media_key) ? { body: e.body.trim().slice(0, 4096) } : {})
      };
    }).filter(Boolean);
  }
  if (!pasos.length) return "Esa respuesta rápida no tiene seguimiento (o sus pasos están apagados).";
  // Nunca pasadas las 23 h desde el último mensaje del cliente: después de
  // 24 h WhatsApp ya no acepta texto libre y el seguimiento no llegaría. Un
  // paso que caería más tarde no se programa (ni los que siguen).
  const conv = await db.prepare(
    `SELECT conv.last_inbound_at, conv.etapa,
       (SELECT COUNT(*) FROM scheduled_messages s WHERE s.conversation_id = conv.id AND s.status = 'pendiente' AND s.batch_id IS NULL
          AND COALESCE(s.created_by, '') NOT LIKE ? AND COALESCE(s.created_by, '') NOT LIKE ? AND COALESCE(s.created_by, '') NOT LIKE ?
          AND COALESCE(s.created_by, '') <> ? AND s.template_name IS NULL) AS manuales
     FROM conversations conv WHERE conv.id = ?`
  ).bind(`${PREFIJO_SEGUIMIENTO_RAPIDA}%`, `${PREFIJO_SEGUIMIENTO_LEAD}%`, `${PREFIJO_SUGERENCIA}%`, ORIGEN_SEGUIMIENTO_AUTO, conversationId).first();
  if (!conv?.last_inbound_at) return "El cliente todavía no escribió.";
  // Una sola cadena de TEXTO por chat: si una persona ya dejó un seguimiento programado
  // a mano, manda el suyo y la respuesta rápida no agrega otra cadena encima.
  // Las plantillas (rescate del día 7, planes) no cuentan: se apilan con la de texto.
  // Y a quien ya compró (etapa 5) no le sale un "si no responde".
  if (conv.etapa >= 5) return "Ya compró: no se le manda un «si no responde».";
  if (conv.manuales > 0) return "Ya hay un seguimiento programado a mano en este chat: cancélalo desde el panel derecho si quieres este.";
  const tope = new Date(conv.last_inbound_at.replace(" ", "T") + "Z").getTime() + 23 * 3600 * 1000;
  const origen = `${PREFIJO_SEGUIMIENTO_RAPIDA} · ${q.titulo}`;
  const inserts = [];
  let envio = Date.now();
  for (const [i, p] of pasos.entries()) {
    envio += (Number(p.horas) || HORAS_SEGUIMIENTO_RAPIDA) * 3600 * 1000;
    // El primero se recorta al tope (como antes); los demás, si no entran, se omiten. Una plantilla
    // (p.plantilla) no tiene tope: sale aunque la ventana ya haya cerrado.
    // Un texto que ya no entra en la ventana se salta (antes cortaba toda la secuencia con `break`
    // y tampoco salía la plantilla de los pasos siguientes, que no tiene tope).
    const cuando = i === 0 && !p.plantilla ? Math.min(envio, tope) : envio;
    if (cuando <= Date.now() + 60 * 1000) continue;
    if (!p.plantilla && cuando > tope) continue;
    envio = cuando;
    if (p.plantilla) {
      inserts.push(
        db.prepare("INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, template_name, template_language, mandar_siempre) VALUES (?, ?, ?, ?, ?, 'es_PE', ?)")
          .bind(conversationId, `Plantilla: ${p.plantilla}`, new Date(cuando).toISOString(), origen, p.plantilla, 0)
      );
      continue;
    }
    inserts.push(
      db.prepare("INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, media_key, media_type, media_mime, botones, mandar_siempre) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(conversationId, p.body || null, new Date(cuando).toISOString(), origen, p.media_key || null, p.media_key ? p.media_type || "image" : null, p.media_mime || null,
          !p.media_key && Array.isArray(p.botones) && p.botones.length ? JSON.stringify(p.botones.slice(0, 3)) : null, 0)
    );
  }
  if (!inserts.length) return "Pasaron más de 23 h desde el último mensaje del cliente: WhatsApp ya no deja mandarle el seguimiento.";
  await db.batch([
    db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status = 'pendiente' AND created_by LIKE ?")
      .bind(conversationId, `${PREFIJO_SEGUIMIENTO_RAPIDA}%`),
    ...inserts
  ]);
  return null;
}

/**
 * ¿Lo programó el sistema (no una persona a mano)? Secuencia de leads,
 * seguimiento de respuesta rápida, sugerencia del asesor, carrito o link.
 * A estos se les aplican las reglas anti-choque del cron (crm-cron.js).
 */
export function esOrigenAutomatico(createdBy) {
  const o = String(createdBy || "");
  return o === ORIGEN_SEGUIMIENTO_AUTO || o === ORIGEN_LINK_ENVIO || o.startsWith(PREFIJO_SEGUIMIENTO_LEAD)
    || o.startsWith(PREFIJO_SEGUIMIENTO_RAPIDA) || o.startsWith(PREFIJO_SUGERENCIA) || /carrito/i.test(o);
}

/**
 * Cancela los automáticos pendientes (secuencia de leads, sugerencias del
 * asesor y el seguimiento de respuesta rápida) — lo que corresponde cuando
 * nosotros le escribimos: la conversación siguió y ese texto quedó viejo.
 * (Antes el de respuesta rápida no se cancelaba y se juntaba con lo que la
 * vendedora seguía escribiendo o programando: mensajes de más.)
 */
export async function cancelarSeguimientosDeLead(db, conversationId) {
  await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'cancelado'
       WHERE conversation_id = ? AND status = 'pendiente' AND mandar_siempre = 0 AND batch_id IS NULL
         AND (created_by = ? OR created_by LIKE ? OR created_by LIKE ? OR created_by LIKE ?)`
    )
    .bind(conversationId, ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`, `${PREFIJO_SUGERENCIA}%`, `${PREFIJO_SEGUIMIENTO_RAPIDA}%`)
    .run();
}

/**
 * Programa todos los pasos de una secuencia de seguimiento en una
 * conversación: el primero se manda `delay_minutes` después de ahora, el
 * segundo `delay_minutes` después del primero, y así — se acumulan para
 * sacar el send_at real de cada uno. La usan tanto "Aplicar una secuencia"
 * a mano (un chat o varios de una) como la que se dispara sola con un lead
 * nuevo de un anuncio.
 */
/**
 * `horas` (opcional): la hora de salida de cada paso activo, en orden (las que puso el admin en el modal).
 * Sin `horas`, cada paso sale su espera después del anterior.
 */
export async function programarSecuenciaSeguimiento(db, conversationId, sequenceId, createdBy, horas = null) {
  const { results: pasos } = await db
    .prepare("SELECT * FROM followup_sequence_steps WHERE sequence_id = ? ORDER BY step_order ASC")
    .bind(sequenceId)
    .all();
  if (!pasos.length) return 0;

  const ahora = Date.now();
  let acumuladoMs = 0;
  // Un paso apagado no se programa y su espera tampoco cuenta.
  const activos = pasos.filter((p) => p.activo !== 0);
  const inserts = activos.map((p, i) => {
    acumuladoMs += p.delay_minutes * 60 * 1000;
    const sendAt = horas ? horas[i] : new Date(ahora + acumuladoMs).toISOString();
    return db.prepare(
      `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, media_key, media_type, media_mime, catalogo, catalogo_nombre, botones, mandar_siempre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(conversationId, p.body, sendAt, createdBy, p.media_key, p.media_type, p.media_mime, p.catalogo || null, p.catalogo_nombre || null, p.body && !p.media_key && !p.catalogo ? p.botones || null : null, 0);
  });
  if (!inserts.length) return 0;
  await db.batch(inserts);
  return inserts.length;
}

/**
 * El catálogo de un seguimiento, tal como llega del CRM: "*" = el catálogo
 * completo, cualquier otro valor = el retailer_id de un producto.
 */
export function leerCatalogo(payload) {
  const catalogo = payload?.catalogo ? String(payload.catalogo).slice(0, 100) : null;
  const nombre = catalogo && catalogo !== "*" && payload?.catalogo_nombre ? String(payload.catalogo_nombre).slice(0, 120) : null;
  return { catalogo, catalogoNombre: nombre };
}

export async function guardarMediaKey(db, messageId, mediaKey) {
  await db.prepare("UPDATE messages SET media_key = ? WHERE id = ?").bind(mediaKey, messageId).run();
}

/** Nombres de producto ya en caché, por retailer_id. Los que falten, `null`. */
export async function nombresDeProductos(db, retailerIds) {
  if (!retailerIds.length) return {};
  const placeholders = retailerIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT retailer_id, name, image_url FROM catalog_products WHERE retailer_id IN (${placeholders})`)
    .bind(...retailerIds)
    .all();
  const mapa = {};
  for (const r of results) mapa[r.retailer_id] = r;
  return mapa;
}

export async function guardarProductosEnCache(db, catalogId, productos) {
  for (const p of productos) {
    await db
      .prepare(
        `INSERT INTO catalog_products (retailer_id, catalog_id, name, image_url, cached_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(retailer_id) DO UPDATE SET name = excluded.name, image_url = excluded.image_url, cached_at = excluded.cached_at`
      )
      .bind(p.retailer_id, catalogId, p.name || null, p.image_url || null)
      .run();
  }
}


export async function obtenerAjuste(db, key) {
  const fila = await db.prepare("SELECT value FROM crm_settings WHERE key = ?").bind(key).first();
  return fila?.value ?? null;
}

export async function guardarAjuste(db, key, value) {
  await db
    .prepare("INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

export async function registrarPedidoCatalogo(db, conversationId, waMessageId, { catalogId, items, total, currency }) {
  await db
    .prepare(
      `INSERT INTO catalog_orders (conversation_id, wa_message_id, catalog_id, items_json, total_amount, currency)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(conversationId, waMessageId, catalogId || null, JSON.stringify(items || []), total || null, currency || null)
    .run();
}

/* ---------- Notificaciones push (Web Push) ---------- */

export async function guardarSuscripcionPush(db, agentName, subscription) {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (agent_name, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET agent_name = excluded.agent_name, p256dh = excluded.p256dh, auth = excluded.auth`
    )
    .bind(agentName || null, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth)
    .run();
}

export async function borrarSuscripcionPush(db, endpoint) {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

/** A quién avisarle de un mensaje nuevo: a todas, esté o no asignado el chat. */
export async function suscripcionesParaAvisar(db) {
  const { results } = await db.prepare("SELECT * FROM push_subscriptions").all();
  return results;
}

/** Asesoras activas con Telegram vinculado y elegido como canal ('telegram' o 'ambos'). */
export async function agentesConAvisoTelegram(db) {
  const { results } = await db
    .prepare(
      `SELECT display_name, username, notify_channel, telegram_chat_id FROM agents
       WHERE active = 1 AND telegram_chat_id IS NOT NULL AND notify_channel IN ('telegram', 'ambos')`
    )
    .all();
  return results;
}

export async function registrarEventoCapi(db, { conversationId, orderId = null, productLabel = null, valor, moneda, status, createdBy, eventName, modo = null, error = null }) {
  await db
    .prepare(
      `INSERT INTO capi_events (conversation_id, order_id, product_label, value, currency, status, created_by, event_name, mode, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(conversationId, orderId, productLabel, valor, moneda, status, createdBy, eventName, modo, error)
    .run();
}

/** Suma una etiqueta (contact / lead / purchase) al chat, sin repetirla. */
export async function agregarEtiquetaMeta(db, conversationId, etiqueta) {
  // Al marcar compra ya no se le rescata: se borra el rescate del día 7 pendiente (y el del asesor).
  if (etiqueta === "purchase") {
    await db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND (template_name LIKE '%rescate_lead_%' OR created_by LIKE '%Automático (día 7)')")
      .bind(conversationId).run();
  }
  await db
    .prepare(
      `UPDATE conversations
       SET meta_tags = trim(COALESCE(meta_tags, '') || ' ' || ?1)
       WHERE id = ?2 AND instr(' ' || COALESCE(meta_tags, '') || ' ', ' ' || ?1 || ' ') = 0`
    )
    .bind(etiqueta, conversationId)
    .run();
}
