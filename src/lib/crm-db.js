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

export async function registrarMensajeEntrante(db, conversationId, { waMessageId, type, body, mediaId, mediaMime }) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, media_id, media_mime, status)
       VALUES (?, ?, 'in', ?, ?, ?, ?, 'received')`
    )
    .bind(conversationId, waMessageId || null, type, body || null, mediaId || null, mediaMime || null)
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

export async function registrarMensajeSaliente(db, conversationId, { waMessageId, type, body, mediaKey, mediaMime, sentBy }) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, media_key, media_mime, status, sent_by)
       VALUES (?, ?, 'out', ?, ?, ?, ?, 'sent', ?)`
    )
    .bind(conversationId, waMessageId || null, type, body || null, mediaKey || null, mediaMime || null, sentBy || null)
    .run();

  await db
    .prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`)
    .bind(conversationId)
    .run();
}

export async function actualizarEstadoMensaje(db, waMessageId, status) {
  await db
    .prepare("UPDATE messages SET status = ? WHERE wa_message_id = ?")
    .bind(status, waMessageId)
    .run();
}

/** Cancela los seguimientos programados pendientes de una conversación — se usa cuando el cliente escribe o cuando nosotros le mandamos algo a mano, para no insistir con un mensaje que ya quedó desactualizado. */
export async function cancelarSeguimientosPendientes(db, conversationId) {
  await db
    .prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status = 'pendiente'")
    .bind(conversationId)
    .run();
}

export async function marcarSeguimiento(db, conversationId, followUp) {
  await db
    .prepare("UPDATE conversations SET follow_up = ? WHERE id = ?")
    .bind(followUp ? 1 : 0, conversationId)
    .run();
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
