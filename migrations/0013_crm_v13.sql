-- CAPI ya no depende de que exista un pedido de catálogo (order_id era
-- obligatorio antes) — la mayoría de ventas se cierran por chat, no por el
-- checkout nativo de WhatsApp, así que hacía falta una vía sin catálogo.
-- order_id queda como referencia opcional, solo quedó registrado para
-- cuando sí venga de un pedido real.

CREATE TABLE IF NOT EXISTS capi_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  order_id INTEGER REFERENCES catalog_orders(id),
  product_label TEXT,
  value REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PEN',
  status TEXT NOT NULL DEFAULT 'enviado',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_capi_events_conv ON capi_events(conversation_id);
