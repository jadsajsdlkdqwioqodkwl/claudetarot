-- Seguridad: roles (admin/vendedor) y límite de intentos del código de
-- acceso. Catálogo: guarda los pedidos que llegan armados desde WhatsApp.

ALTER TABLE agents ADD COLUMN role TEXT NOT NULL DEFAULT 'vendedor';
ALTER TABLE login_challenges ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS catalog_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  wa_message_id TEXT,
  catalog_id TEXT,
  items_json TEXT NOT NULL, -- [{retailer_id, name?, quantity, price, currency}]
  total_amount REAL,
  currency TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_orders_conv ON catalog_orders(conversation_id);
