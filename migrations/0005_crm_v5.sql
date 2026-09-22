-- Contactos creados a mano por un vendedor no necesitan nada nuevo en el
-- esquema (usan las mismas tablas contacts/conversations). Esta migración es
-- solo para el export de chats a Sheets: guarda hasta dónde se exportó.

CREATE TABLE IF NOT EXISTS crm_export_state (
  id INTEGER PRIMARY KEY,
  last_message_id INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO crm_export_state (id, last_message_id) VALUES (1, 0);
