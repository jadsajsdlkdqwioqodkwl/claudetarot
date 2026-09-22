-- CRM de ventas por WhatsApp: contactos, conversaciones y mensajes.
-- Aplicada a mano vía Cloudflare (D1 MCP) el 2026-09-22; este archivo es el
-- registro de lo que hay en la base, por si hay que recrearla.

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT UNIQUE NOT NULL,
  name TEXT,
  profile_name TEXT,
  stage TEXT NOT NULL DEFAULT 'nuevo',
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'abierta',
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_inbound_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  wa_message_id TEXT,
  direction TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  media_id TEXT,
  media_mime TEXT,
  status TEXT DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_wa_id ON contacts(wa_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id);
