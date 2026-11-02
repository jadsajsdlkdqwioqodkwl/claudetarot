-- Mensajes que el webhook recibió pero no pudo guardar en el CRM
-- (race condition en INSERT, error de BD, referral malformado, etc.).
-- Aplicar a mano en D1 (wrangler d1 execute CRM --file=migrations/0066_webhook_errores.sql).
CREATE TABLE IF NOT EXISTS webhook_errores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id        TEXT,
  wa_message_id TEXT,
  error        TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_errores_ts ON webhook_errores(created_at DESC);
