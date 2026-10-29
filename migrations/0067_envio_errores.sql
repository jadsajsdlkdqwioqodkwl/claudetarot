-- Mensajes programados que el cron intentó mandar pero fallaron.
-- Aplicar a mano: wrangler d1 execute CRM --file=migrations/0067_envio_errores.sql
CREATE TABLE IF NOT EXISTS envio_errores (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_message_id INTEGER,
  conversation_id      INTEGER,
  wa_id                TEXT,
  error                TEXT NOT NULL,
  created_at           TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_envio_errores_ts ON envio_errores(created_at DESC);
