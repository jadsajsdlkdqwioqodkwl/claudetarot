/**
 * Consultas compartidas contra D1 (binding `CRM_DB`). Todo lo que toca más de
 * un endpoint vive aquí para no repetir el SQL.
 */

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

export async function obtenerOCrearConversacion(db, contactId) {
  const existente = await db
    .prepare("SELECT * FROM conversations WHERE contact_id = ?")
    .bind(contactId)
    .first();
  if (existente) return existente;

  return db
    .prepare("INSERT INTO conversations (contact_id) VALUES (?) RETURNING *")
    .bind(contactId)
    .first();
}

export async function registrarMensajeEntrante(db, conversationId, { waMessageId, type, body, mediaId, mediaMime, replyToMessageId, viewOnce }) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, media_id, media_mime, status, reply_to_message_id, view_once)
       VALUES (?, ?, 'in', ?, ?, ?, ?, 'received', ?, ?)`
    )
    .bind(conversationId, waMessageId || null, type, body || null, mediaId || null, mediaMime || null, replyToMessageId || null, viewOnce ? 1 : 0)
    .run();

  await db
    .prepare(
      `UPDATE conversations
       SET unread_count = unread_count + 1,
           last_message_at = datetime('now'),
           last_inbound_at = datetime('now'),
           status = 'abierta'
       WHERE id = ?`
    )
    .bind(conversationId)
    .run();
}

export async function registrarMensajeSaliente(db, conversationId, { waMessageId, type, body, mediaKey, mediaMime, sentBy, replyToMessageId, fileName }) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, media_key, media_mime, status, sent_by, reply_to_message_id, file_name)
       VALUES (?, ?, 'out', ?, ?, ?, ?, 'sent', ?, ?, ?)`
    )
    .bind(conversationId, waMessageId || null, type, body || null, mediaKey || null, mediaMime || null, sentBy || null, replyToMessageId || null, fileName || null)
    .run();

  await db
    // Si le respondimos (a mano, la bienvenida o un seguimiento), lo que el
    // cliente mandó antes ya no cuenta como "sin leer": el (1) vuelve a
    // aparecer recién cuando el cliente escriba de nuevo.
    .prepare(`UPDATE conversations SET last_message_at = datetime('now'), unread_count = 0 WHERE id = ?`)
    .bind(conversationId)
    .run();
}

export async function actualizarEstadoMensaje(db, waMessageId, status, errorDetail) {
  await db
    .prepare("UPDATE messages SET status = ?, error_detail = ? WHERE wa_message_id = ?")
    .bind(status, errorDetail || null, waMessageId)
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
    .prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status = 'pendiente'")
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

/** Cancela solo los "tras no respuesta" (secuencia de leads) pendientes — lo que corresponde cuando nosotros le escribimos. */
export async function cancelarSeguimientosDeLead(db, conversationId) {
  await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'cancelado'
       WHERE conversation_id = ? AND status = 'pendiente' AND (created_by = ? OR created_by LIKE ?)`
    )
    .bind(conversationId, ORIGEN_SEGUIMIENTO_AUTO, `${PREFIJO_SEGUIMIENTO_LEAD}%`)
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
export async function programarSecuenciaSeguimiento(db, conversationId, sequenceId, createdBy) {
  const { results: pasos } = await db
    .prepare("SELECT * FROM followup_sequence_steps WHERE sequence_id = ? ORDER BY step_order ASC")
    .bind(sequenceId)
    .all();
  if (!pasos.length) return 0;

  const ahora = Date.now();
  let acumuladoMs = 0;
  const inserts = pasos.map((p) => {
    acumuladoMs += p.delay_minutes * 60 * 1000;
    const sendAt = new Date(ahora + acumuladoMs).toISOString();
    return db.prepare(
      `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, media_key, media_type, media_mime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(conversationId, p.body, sendAt, createdBy, p.media_key, p.media_type, p.media_mime);
  });
  await db.batch(inserts);
  return pasos.length;
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

/**
 * A quién avisarle de un mensaje nuevo: si el chat ya tiene asesora
 * asignada, solo a su dispositivo (no le suena a todo el equipo un chat que
 * ya es de alguien); si está libre, a todas — cualquiera lo puede atender.
 */
export async function suscripcionesParaAvisar(db, assignedAgent) {
  if (!assignedAgent) {
    const { results } = await db.prepare("SELECT * FROM push_subscriptions").all();
    return results;
  }
  const { results } = await db.prepare("SELECT * FROM push_subscriptions WHERE agent_name = ?").bind(assignedAgent).all();
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
