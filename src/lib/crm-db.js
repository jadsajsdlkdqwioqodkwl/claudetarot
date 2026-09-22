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
    return existente;
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
  return insertado;
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

export async function marcarSeguimiento(db, conversationId, followUp) {
  await db
    .prepare("UPDATE conversations SET follow_up = ? WHERE id = ?")
    .bind(followUp ? 1 : 0, conversationId)
    .run();
}

export async function guardarMediaKey(db, messageId, mediaKey) {
  await db.prepare("UPDATE messages SET media_key = ? WHERE id = ?").bind(mediaKey, messageId).run();
}
