/**
 * Consultas compartidas contra D1 (binding `CRM_DB`). Todo lo que toca más de
 * un endpoint vive aquí para no repetir el SQL.
 */

import { contieneCodigo } from "./ventas.js";
import { limpiarBotones } from "./whatsapp.js";

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
  let insertado;
  try {
    insertado = await db
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
  } catch (e) {
    // Race condition: dos webhooks paralelos para el mismo número nuevo — el segundo
    // ve UNIQUE constraint en wa_id. Reobtenemos el que ya quedó insertado.
    if (/unique|constraint/i.test(e.message)) {
      const existente2 = await db.prepare("SELECT * FROM contacts WHERE wa_id = ?").bind(waId).first();
      if (existente2) return { ...existente2, _isNew: false };
    }
    throw e;
  }
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
  const { meta: msgMeta } = await db
    .prepare(
      `INSERT OR IGNORE INTO messages (conversation_id, wa_message_id, direction, type, body, file_name, media_id, media_mime, status, reply_to_message_id, view_once)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?, 'received', ?, ?)`
    )
    .bind(conversationId, waMessageId || null, type, body || null, fileName || null, mediaId || null, mediaMime || null, replyToMessageId || null, viewOnce ? 1 : 0)
    .run();

  // Si no insertó (duplicate wa_message_id por reintento de Meta), no actualizamos contadores.
  if (!msgMeta?.changes) return;

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

export async function registrarMensajeSaliente(db, conversationId, { waMessageId, type, body, mediaKey, mediaId, mediaMime, sentBy, replyToMessageId, fileName }, { subirEnBandeja = true } = {}) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, media_key, media_id, media_mime, status, sent_by, reply_to_message_id, file_name)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?, 'sent', ?, ?, ?)`
    )
    .bind(conversationId, waMessageId || null, type, body || null, mediaKey || null, mediaId || null, mediaMime || null, sentBy || null, replyToMessageId || null, fileName || null)
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
 * seguimientos no-batch y no-mandar_siempre del chat, el cobro (recojo Shalom/Olva) incluido:
 * el código de retiro solo se le da cuando ya pagó el saldo (dueño, 2026-10-31). */
async function terminarCobroSiLlevaCodigo(db, conversationId, texto) {
  const c = await db
    .prepare("SELECT c.shalom_code FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?")
    .bind(conversationId)
    .first();
  if (!contieneCodigo(texto, c?.shalom_code)) return;
  await db
    .prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND mandar_siempre = 0 AND batch_id IS NULL")
    .bind(conversationId)
    .run();
  await db
    .prepare("UPDATE conversations SET meta_tags = trim(replace(' ' || COALESCE(meta_tags, '') || ' ', ' shalom_codigo_pendiente ', ' ')) WHERE id = ?")
    .bind(conversationId)
    .run();
  await agregarEtiquetaMeta(db, conversationId, "saldo_pagado");
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

/**
 * Lo que se cancela cuando el CLIENTE escribe (webhook). Desde el 2026-11-04 (dueño) las cadenas de seguimiento
 * (plan con nombre, pasos de una rápida, secuencia de leads, carrito) SIGUEN aunque el cliente o la vendedora hablen:
 * solo las corta el botón «Detener seguimiento» del chat o de la lista (cancelarSeguimientosDeLead). Lo que sí se
 * cancela al responder: las sugerencias del asesor («Sugerencia del asesor …», que ya quedaron desactualizadas), lo
 * programado a mano por una persona (recordatorios) y las plantillas que esperaban aprobación. Los marcados
 * «mandar siempre» nunca; el recojo en Shalom ya aprobado tampoco (si responde se vuelve a contar: rearmarPlanShalom).
 */
export async function cancelarSeguimientosPendientes(db, conversationId) {
  await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'cancelado'
       WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND mandar_siempre = 0
         AND NOT (status = 'pendiente' AND created_by LIKE 'Plan con plantilla · Recojo en%')
         AND NOT (status = 'pendiente' AND (created_by = ? OR created_by LIKE ? OR created_by LIKE ? OR created_by LIKE ? OR created_by LIKE '%carrito%'))`
    )
    .bind(conversationId, ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`, `${PREFIJO_SEGUIMIENTO_RAPIDA}%`, `${PREFIJO_PLAN}%`)
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
 * Tope de insistencia: con este número de seguimientos automáticos ya enviados sin que el cliente
 * responda, el cron no manda más texto libre. Es una red de seguridad, no el ritmo: el ritmo lo
 * pone la cadena (plan universal o pasos de la rápida: 2 textos el primer día y plantillas los días
 * siguientes, hasta el rescate del día 6). Estuvo en 2 y cortaba el segundo paso cuando la
 * secuencia de anuncio ya había mandado uno (dueño, 2026-11-01).
 */
export const MAX_AUTOMATICOS_SIN_RESPUESTA = 6;

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
export const PREFIJO_PLAN_PLANTILLA = "Plan con plantilla";
export const HORAS_SEGUIMIENTO_RAPIDA = 20;

/** Hasta cuántos pasos lleva una cadena (plan con nombre o pasos de una rápida). Un plan diario de 7 días lleva 8 o 9 (dueño, 2026-11-03). */
export const MAX_PASOS_SEGUIMIENTO = 10;
/** created_by de los pasos que programa un plan con nombre: «Plan de seguimiento · <nombre>». */
export const PREFIJO_PLAN = "Plan de seguimiento";
export const origenPlan = (nombre) => `${PREFIJO_PLAN} · ${nombre}`;
/** Día del chat a partir del cual una plantilla ya no entra en los 7 días gratis del anuncio (se paga). */
export const DIA_PAGADO = 7;
/** Mínimo de horas entre un seguimiento y el siguiente (dueño, 2026-11-04); el ajuste `seguimiento_espacio_min_h` lo cambia. */
export const ESPACIO_MINIMO_H = 5;
const LIMA_MS = 5 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;

/** El mínimo entre seguimientos, en ms, según el ajuste (vacío = 5 h; 0 lo apaga). */
export async function espacioMinimoMs(db) {
  const v = await obtenerAjuste(db, "seguimiento_espacio_min_h").catch(() => null);
  const h = v === null || v === "" ? ESPACIO_MINIMO_H : Number(v);
  return (Number.isFinite(h) && h >= 0 && h <= 48 ? h : ESPACIO_MINIMO_H) * 3600 * 1000;
}
/** Medianoche de Lima (en ms UTC) del día en que cae `ms`. */
export const medianocheLima = (ms) => Math.floor((ms - LIMA_MS) / DIA_MS) * DIA_MS + LIMA_MS;

/**
 * Un paso de seguimiento validado; misma forma para los pasos de una respuesta rápida y para el plan
 * universal (ajuste `seguimiento_universal`): { horas, body?, botones?, media_*?, plantilla?, desde?, activo? }.
 * Una plantilla con `desde: "inicio"` cuenta sus días desde el primer mensaje del cliente (día N del
 * chat), no desde el paso anterior: así "día 3" es día 3 aunque la cadena se reactive el día 2.
 */
export function normalizarPasosSeguimiento(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((p) => {
      const horas = Number(p?.horas);
      const plantilla = /^[a-z0-9_]{1,100}$/.test(String(p?.plantilla || "")) ? String(p.plantilla) : null;
      const paso = {
        horas: horas >= 0.25 && horas <= (plantilla ? 1440 : 168) ? Math.round(horas * 4) / 4 : HORAS_SEGUIMIENTO_RAPIDA,
        body: plantilla ? null : String(p?.body || "").trim().slice(0, 4096) || null
      };
      // «Día N a las HH:MM» (hora de Lima), contado desde el primer mensaje del cliente: día 0 es ese día.
      // Es lo que pide el dueño para los planes de 7 días («todos los días a horas distintas»).
      const dia = Number(p?.dia);
      const hora = String(p?.hora || "").match(/^(\d{1,2}):(\d{2})$/);
      if (Number.isInteger(dia) && dia >= 0 && dia <= 30 && hora && +hora[1] <= 23 && +hora[2] <= 59) {
        paso.dia = dia;
        paso.hora = `${String(+hora[1]).padStart(2, "0")}:${hora[2]}`;
        delete paso.horas;
      }
      if (p?.activo === false) paso.activo = false;
      if (plantilla) {
        paso.plantilla = plantilla;
        if (p?.desde === "inicio") paso.desde = "inicio";
      } else if (limpiarBotones(p?.botones).length && paso.body) paso.botones = limpiarBotones(p.botones);
      if (!plantilla && p?.media_key) Object.assign(paso, {
        media_key: String(p.media_key).slice(0, 200),
        media_type: ["image", "video", "document", "audio", "sticker"].includes(p.media_type) ? p.media_type : "document",
        media_mime: p.media_mime ? String(p.media_mime).slice(0, 100) : null
      });
      return paso;
    })
    .filter((p) => p.body || p.media_key || p.plantilla)
    .slice(0, MAX_PASOS_SEGUIMIENTO);
}

/** El plan universal de seguimiento: el plan 1 de `planes_seguimiento` y, si aún no existe, el ajuste `seguimiento_universal` (respaldo). Con los pasos apagados incluidos. */
export async function pasosUniversales(db) {
  const plan = await leerPlan(db, 1).catch(() => null);
  if (plan?.pasos.length) return plan.pasos;
  try { return normalizarPasosSeguimiento(JSON.parse((await obtenerAjuste(db, "seguimiento_universal")) || "[]")); } catch { return []; }
}

/** Un plan de seguimiento con nombre, con sus pasos (A) y su versión B ya normalizados; null si no existe. */
export async function leerPlan(db, planId) {
  const r = await db.prepare("SELECT * FROM planes_seguimiento WHERE id = ?").bind(Number(planId) || 0).first();
  if (!r) return null;
  const parse = (t) => { try { return normalizarPasosSeguimiento(JSON.parse(t || "[]")); } catch { return []; } };
  const versionB = r.version_b ? parse(r.version_b) : null;
  return { id: r.id, nombre: r.nombre, segmento: r.segmento || "general", activo: r.activo !== 0, pasos: parse(r.pasos),
    version_b: versionB && versionB.length ? versionB : null, reparto_b: Math.min(1, Math.max(0, Number(r.reparto_b) || 0)),
    created_at: r.created_at, updated_at: r.updated_at };
}

/** Brazo fijo de un chat en un plan (hash del id: el mismo chat siempre cae del mismo lado). */
export function brazoPorHash(conversationId, planId, repartoB) {
  let h = (Number(conversationId) * 2654435761 + Number(planId) * 97) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return (h % 1000) / 1000 < repartoB ? "B" : "A";
}

/**
 * Los pasos activos que le tocan a un chat en un plan: { id, nombre, segmento, brazo, pasos } o null.
 * Con versión B y reparto > 0, el brazo se sortea una vez por chat (plan_asignaciones) y queda fijo.
 */
export async function pasosDePlan(db, planId, conversationId = null) {
  const plan = await leerPlan(db, planId);
  if (!plan) return null;
  let brazo = "A";
  if (plan.version_b && plan.reparto_b > 0 && conversationId) {
    const a = await db.prepare("SELECT brazo FROM plan_asignaciones WHERE plan_id = ? AND conversation_id = ?").bind(plan.id, conversationId).first();
    brazo = a?.brazo === "B" || a?.brazo === "A" ? a.brazo : brazoPorHash(conversationId, plan.id, plan.reparto_b);
    if (!a) await db.prepare("INSERT OR IGNORE INTO plan_asignaciones (plan_id, conversation_id, brazo) VALUES (?, ?, ?)").bind(plan.id, conversationId, brazo).run();
  }
  const pasos = (brazo === "B" ? plan.version_b : plan.pasos).filter((p) => p.activo !== false);
  return { id: plan.id, nombre: plan.nombre, segmento: plan.segmento, brazo, pasos };
}

/**
 * Los pasos activos del seguimiento de una respuesta rápida: { titulo, universal, plan, pasos } (null si ya
 * no existe). Con `followup_plan_id` son los de ese plan con nombre (brazo A o B para este chat); con
 * `followup_universal` (lo viejo), los del plan 1 «Universal».
 */
export async function pasosDeSeguimientoRapida(db, quickReplyId, conversationId = null) {
  let q = null;
  for (const cols of ["title, followup_body, followup_hours, followup_pasos, followup_universal, followup_plan_id", "title, followup_body, followup_hours, followup_pasos, followup_universal"]) {
    try { q = await db.prepare(`SELECT ${cols} FROM quick_replies WHERE id = ?`).bind(quickReplyId).first(); break; } catch { /* sin la migración 0073 */ }
  }
  if (!q) return null;
  let pasos = pasosGuardados(q);
  let universal = false;
  let plan = null;
  const planId = Number(q.followup_plan_id) || (q.followup_universal ? 1 : 0);
  if (planId) {
    const p = await pasosDePlan(db, planId, conversationId).catch(() => null);
    if (p?.pasos.length) { pasos = p.pasos; plan = { id: p.id, nombre: p.nombre, brazo: p.brazo, segmento: p.segmento }; universal = true; }
    else if (q.followup_universal && !q.followup_plan_id) {
      const u = await pasosUniversales(db);
      if (u.length) { pasos = u; universal = true; }
    }
  }
  return { titulo: q.title, universal, plan, pasos: pasos.filter((p) => p.activo !== false) }; // los pasos apagados no se programan
}

/** Cambios de una persona para este chat ([{ horas, body, activo }] por posición) sobre los pasos activos. */
export function aplicarEdicionesDePasos(pasos, editados) {
  if (!Array.isArray(editados)) return pasos;
  return pasos.map((p, i) => {
    const e = editados[i];
    if (!e) return p;
    if (e.activo === false) return null;
    const horas = Number(e.horas);
    return {
      ...p,
      // Un paso «día N a las HH:MM» no cambia de hora desde el chat (solo se puede apagar o editar el texto).
      ...(horas > 0 && horas <= (p.plantilla ? 1440 : 168) && !(Number.isInteger(p.dia) && p.hora) ? { horas } : {}),
      ...(!p.plantilla && typeof e.body === "string" && (e.body.trim() || p.media_key) ? { body: e.body.trim().slice(0, 4096) } : {})
    };
  }).filter(Boolean);
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
  const q = await pasosDeSeguimientoRapida(db, quickReplyId, conversationId);
  if (!q) return "Esa respuesta rápida ya no existe.";
  const pasos = aplicarEdicionesDePasos(q.pasos, editados);
  if (!pasos.length) return "Esa respuesta rápida no tiene seguimiento (o sus pasos están apagados).";
  // Con un plan con nombre, el origen lleva el nombre del plan (así la barra del chat y las métricas saben cuál fue).
  const origen = q.plan ? origenPlan(q.plan.nombre) : `${PREFIJO_SEGUIMIENTO_RAPIDA} · ${q.titulo}`;
  return programarPasosEnChat(db, conversationId, pasos, origen, q.plan ? { plan_id: q.plan.id, brazo: q.plan.brazo } : {});
}

/** Programa un plan con nombre en un chat (bienvenida de anuncios, «Reactivar» de la barra). Devuelve null o el motivo. */
export async function programarPlanEnChat(db, conversationId, planId, editados = null) {
  const p = await pasosDePlan(db, planId, conversationId);
  if (!p) return "Ese plan ya no existe.";
  const pasos = aplicarEdicionesDePasos(p.pasos, editados);
  if (!pasos.length) return "Ese plan no tiene pasos prendidos.";
  return programarPasosEnChat(db, conversationId, pasos, origenPlan(p.nombre), { plan_id: p.id, brazo: p.brazo });
}

/**
 * Cuándo saldría cada paso (ms UTC) para un chat que empezó en `inicioMs` y cuyo último mensaje del cliente fue `ultimoMs`,
 * programando ahora. { cuando, salta, motivo, pagado, espaciado, dia } por paso: lo que usa programarPasosEnChat y la vista
 * previa del plan. Reglas que se aplican solas (dueño, 2026-11-04):
 * · entre un seguimiento y el siguiente hay como mínimo `espacioMs` (5 h): un paso que caería antes se corre; cuenta también el
 *   último seguimiento automático que YA salió en el chat (`ultimoEnvioMs`), para que al reactivar no salga uno al toque;
 * · nada sale pasados los 7 días (en horas: 168 h) desde el primer mensaje del cliente, que es lo que Meta deja gratis;
 * · `desdePaso`: los primeros N pasos ya se mandaron en este chat (la cadena se reanuda desde el que sigue, no desde cero).
 */
export function calendarioDePasos(pasos, { inicioMs, ultimoMs, ahoraMs = Date.now(), espacioMs = ESPACIO_MINIMO_H * 3600 * 1000, ultimoEnvioMs = null, desdePaso = 0, sinTope7d = false }) {
  const tope = ultimoMs + 23 * 3600 * 1000;
  // `sinTope7d`: campaña a chats antiguos (fuera de la semana gratis a propósito, pedido del dueño): no se aplica el tope.
  const tope7d = sinTope7d ? Infinity : inicioMs + DIA_PAGADO * DIA_MS;
  const base = medianocheLima(inicioMs);
  let previo = ahoraMs;
  const piso = ultimoEnvioMs ? ultimoEnvioMs + espacioMs : 0; // antes de esto no sale el primero de la cadena
  return (pasos || []).map((p, i) => {
    const esperaMs = (Number(p.horas) || HORAS_SEGUIMIENTO_RAPIDA) * 3600 * 1000;
    let cuando;
    if (Number.isInteger(p.dia) && p.hora) {
      const [hh, mm] = p.hora.split(":").map(Number);
      cuando = base + p.dia * DIA_MS + (hh * 60 + mm) * 60 * 1000;
    } else cuando = p.plantilla && p.desde === "inicio" ? inicioMs + esperaMs : previo + esperaMs;
    const out = { cuando, salta: false, motivo: null, pagado: false, espaciado: false, dia: Math.floor((cuando - base) / DIA_MS) };
    if (i < desdePaso) return { ...out, salta: true, motivo: "ya se mandó en este chat" };
    if (cuando <= ahoraMs + 60 * 1000) return { ...out, salta: true, motivo: "ya pasó" }; // un «día N» que ya quedó atrás
    // Mínimo entre seguimientos: desde el anterior de la cadena o, para el primero, desde el último que ya salió.
    const minimo = previo === ahoraMs ? piso : previo + espacioMs;
    if (cuando < minimo) { cuando = out.cuando = minimo; out.espaciado = true; out.dia = Math.floor((cuando - base) / DIA_MS); }
    if (!p.plantilla && cuando > tope) {
      // Un texto que caería pasadas las 23 h del cliente se adelanta al tope si respeta el mínimo (y 2 h con el anterior); si no, se salta.
      if (tope < minimo || (previo !== ahoraMs && tope - previo < 2 * 3600 * 1000)) return { ...out, salta: true, motivo: "fuera de las 24 h del cliente" };
      cuando = out.cuando = tope;
    }
    if (cuando > tope7d) return { ...out, pagado: true, salta: true, motivo: "pasa los 7 días del chat (Meta ya cobraría)" };
    if (cuando <= ahoraMs + 60 * 1000) return { ...out, salta: true, motivo: "ya pasó" };
    previo = cuando;
    return out;
  });
}

/** Lo que ya salió de seguimientos automáticos en un chat: cuándo fue el último y hasta qué paso de `origen` se mandó. */
async function historialDeSeguimientos(db, conversationId, origen) {
  const auto = `(created_by = ? OR created_by LIKE ? OR created_by LIKE ? OR created_by LIKE ? OR created_by LIKE ?)`;
  const binds = [ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`, `${PREFIJO_SUGERENCIA}%`, `${PREFIJO_SEGUIMIENTO_RAPIDA}%`, `${PREFIJO_PLAN}%`];
  const r = await db.prepare(
    `SELECT MAX(COALESCE(sent_at, send_at)) AS ultimo,
            MAX(CASE WHEN created_by = ? THEN plan_paso END) AS paso
     FROM scheduled_messages WHERE conversation_id = ? AND status = 'enviado' AND mandar_siempre = 0 AND batch_id IS NULL AND ${auto}`
  ).bind(origen, conversationId, ...binds).first().catch(() => null);
  const aMs = (t) => (t ? new Date(String(t).replace(" ", "T").replace(/Z?$/, "Z")).getTime() : null);
  return { ultimoEnvioMs: aMs(r?.ultimo) || null, desdePaso: Number.isInteger(r?.paso) ? r.paso + 1 : 0 };
}

/**
 * Programa una cadena de pasos (texto, archivo o plantilla) en un chat. Reglas (dueño, 2026-11-01):
 * · solo el CLIENTE corta la cadena (webhook, cancelarSeguimientosPendientes); lo que nosotros
 *   escribamos o programemos no la toca;
 * · una sola cadena automática por chat: la nueva reemplaza a la que hubiera (rápida, anuncio, sugerencia);
 * · un texto nunca sale pasadas 23 h del último mensaje del cliente (WhatsApp lo rechaza): si cae
 *   después se adelanta a esa hora, siempre que queden 2 h con el paso anterior; si no, se salta.
 *   Una plantilla no tiene tope;
 * · plantilla con `desde: "inicio"`: sus días se cuentan desde que empezó el chat (día N) y, si ese
 *   momento ya pasó, se salta;
 * · a quien ya compró no se le programa.
 * Devuelve null si quedó programado, o el motivo (texto) por el que no.
 */
export async function programarPasosEnChat(db, conversationId, pasos, origen, meta = {}) {
  if (!pasos?.length) return "No hay pasos de seguimiento prendidos.";
  const conv = await db.prepare("SELECT last_inbound_at, created_at, etapa, meta_tags FROM conversations WHERE id = ?").bind(conversationId).first();
  if (!conv) return "Conversación no encontrada.";
  if (!conv.last_inbound_at) return "El cliente todavía no escribió.";
  if (conv.etapa >= 5 || /\bpurchase\b/.test(conv.meta_tags || "")) return "Ya compró: no se le manda un «si no responde».";
  const aMs = (t) => new Date(String(t).replace(" ", "T") + "Z").getTime();
  // Mínimo entre seguimientos y reanudar desde el paso que sigue (dueño, 2026-11-04): ver calendarioDePasos.
  const [espacioMs, historial] = await Promise.all([espacioMinimoMs(db), historialDeSeguimientos(db, conversationId, origen)]);
  // meta.inicioMs: «día N» contado desde esa fecha en vez del primer mensaje del cliente (campaña a chats antiguos, que
  // arranca hoy o en los próximos días); con meta.sinTope7d no se aplica el tope de 168 h del chat.
  const calendario = calendarioDePasos(pasos, { inicioMs: meta.inicioMs || aMs(conv.created_at), ultimoMs: aMs(conv.last_inbound_at), ahoraMs: Date.now(), espacioMs, sinTope7d: Boolean(meta.sinTope7d), ...historial });
  const inserts = [];
  // plan_id / plan_brazo / plan_paso (migración 0073): de qué plan, brazo y paso salió cada mensaje, para medir y para
  // reanudar desde el paso que sigue (plan_paso se guarda siempre, también para los pasos propios de una rápida).
  const planCols = meta.plan_id ? ", plan_id, plan_brazo, plan_paso" : ", plan_paso";
  const planVals = (i) => meta.plan_id ? [meta.plan_id, meta.brazo || "A", i] : [i];
  pasos.forEach((p, i) => {
    const c = calendario[i];
    if (c.salta) return;
    const cuando = c.cuando;
    if (p.plantilla) {
      inserts.push(
        db.prepare(`INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, template_name, template_language, mandar_siempre${planCols}) VALUES (?, ?, ?, ?, ?, 'es_PE', 0${planVals(i).map(() => ", ?").join("")})`)
          .bind(conversationId, `Plantilla: ${p.plantilla}`, new Date(cuando).toISOString(), origen, p.plantilla, ...planVals(i))
      );
      return;
    }
    inserts.push(
      db.prepare(`INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, media_key, media_type, media_mime, botones, mandar_siempre${planCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0${planVals(i).map(() => ", ?").join("")})`)
        .bind(conversationId, p.body || null, new Date(cuando).toISOString(), origen, p.media_key || null, p.media_key ? p.media_type || "image" : null, p.media_mime || null,
          !p.media_key && Array.isArray(p.botones) && p.botones.length ? JSON.stringify(p.botones.slice(0, 3)) : null, ...planVals(i))
    );
  });
  if (!inserts.length) {
    const motivos = [...new Set(calendario.map((c) => c.motivo).filter(Boolean))];
    if (motivos.length === 1 && motivos[0] === "ya se mandó en este chat") return "Este chat ya recibió todos los pasos de este seguimiento.";
    if (motivos.every((m) => m === "fuera de las 24 h del cliente" || m === "ya pasó")) return "Pasaron más de 23 h desde el último mensaje del cliente: WhatsApp ya no deja mandarle texto (solo una plantilla).";
    return `No queda nada por programar: ${motivos.join("; ")}.`;
  }
  await cancelarSeguimientosDeLead(db, conversationId);
  await db.batch(inserts);
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
    || o.startsWith(PREFIJO_SEGUIMIENTO_RAPIDA) || o.startsWith(PREFIJO_SUGERENCIA) || o.startsWith(PREFIJO_PLAN) || /carrito/i.test(o);
}

/**
 * Cancela los automáticos pendientes (secuencia de leads, sugerencias del asesor y el seguimiento de
 * respuesta rápida). Desde 2026-11-01 NO se llama cuando nosotros le escribimos (la cadena sale sí o
 * sí; solo el cliente la corta): se usa para reemplazar una cadena por otra (programarPasosEnChat,
 * aplicar una secuencia) y para el control «Seguimiento» del chat (apagarlo a mano).
 */
export async function cancelarSeguimientosDeLead(db, conversationId) {
  await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'cancelado'
       WHERE conversation_id = ? AND status = 'pendiente' AND mandar_siempre = 0 AND batch_id IS NULL
         AND (created_by = ? OR created_by LIKE ? OR created_by LIKE ? OR created_by LIKE ? OR created_by LIKE ?)`
    )
    .bind(conversationId, ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`, `${PREFIJO_SUGERENCIA}%`, `${PREFIJO_SEGUIMIENTO_RAPIDA}%`, `${PREFIJO_PLAN}%`)
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
  // Al marcar compra ya no se le rescata: se borra el rescate del día 7 pendiente (y el del asesor), y muere la cadena de
  // seguimiento de venta (plan con nombre, pasos de rápida, secuencia de leads, anuncio; dueño 2026-11-04). El cobro y el
  // recojo de Shalom (planes con plantilla, saldo) no son automáticos de venta: siguen.
  if (etiqueta === "purchase") {
    await db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND (template_name LIKE '%rescate_lead_%' OR created_by LIKE '%Automático (día 7)')")
      .bind(conversationId).run();
    await cancelarSeguimientosDeLead(db, conversationId);
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
