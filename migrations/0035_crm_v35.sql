-- Link de seguimiento automático (src/lib/crm-links-envio.js): un registro
-- por venta de la pestaña Ventas, para no programar nunca dos veces el mismo
-- link. `scheduled_id` es el mensaje programado (scheduled_messages); su
-- estado real (pendiente / enviado / cancelado / fallido) se lee de ahí.
--   programado   se programó para 23 h después del último mensaje del cliente
--   enviado      salió (lo marca el cron al mandarlo)
--   sin_ventana  cuando se registró la venta ya no quedaba ventana de 24 h:
--                hay que mandarlo a mano o con plantilla (Links de Shalom)
CREATE TABLE IF NOT EXISTS envio_links (
  codigo TEXT PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id),
  scheduled_id INTEGER,
  estado TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_envio_links_sched ON envio_links(scheduled_id);
