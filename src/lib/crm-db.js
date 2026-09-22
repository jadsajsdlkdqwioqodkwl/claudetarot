/**
 * Consultas compartidas contra D1 (binding `CRM_DB`). Todo lo que toca más de
 * un endpoint vive aquí para no repetir el SQL.
 */

export async function obtenerOCrearContacto(db, waId, profileName) {
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

  const insertado = await db
    .prepare("INSERT INTO contacts (wa_id, profile_name) VALUES (?, ?) RETURNING *")
    .bind(waId, profileName || null)
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

export async function registrarMensajeSaliente(db, conversationId, { waMessageId, type, body }) {
  await db
    .prepare(
      `INSERT INTO messages (conversation_id, wa_message_id, direction, type, body, status)
       VALUES (?, ?, 'out', ?, ?, 'sent')`
    )
    .bind(conversationId, waMessageId || null, type, body || null)
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
