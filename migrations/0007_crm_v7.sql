-- Secuencia de bienvenida para anuncios: varias respuestas rápidas, en
-- orden, en vez de una sola. Reemplaza el ajuste único
-- crm_settings.ad_welcome_quick_reply_id (queda sin usar, no se borra).

CREATE TABLE IF NOT EXISTS welcome_sequence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quick_reply_id INTEGER NOT NULL REFERENCES quick_replies(id),
  step_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_welcome_sequence_order ON welcome_sequence(step_order);
