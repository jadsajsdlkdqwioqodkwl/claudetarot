-- Tercera vuelta: cuentas por vendedor (reemplaza la contraseña única),
-- 2FA por WhatsApp, y seguimientos programados.

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  wa_id TEXT NOT NULL,           -- a dónde le llega el código de acceso (2FA)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_challenges (
  id TEXT PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE messages ADD COLUMN sent_by TEXT;

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  body TEXT,
  quick_reply_id INTEGER REFERENCES quick_replies(id),
  send_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente, enviado, cancelado, fallido
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_messages(status, send_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_conv ON scheduled_messages(conversation_id);
