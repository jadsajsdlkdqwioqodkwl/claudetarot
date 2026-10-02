-- Aplicada vía D1 MCP el 2026-10-02.
-- · pedidos_web: cada formulario de la página (/api/order), terminara o no en
--   venta. De aquí sale la sección "🌐 Pedidos de la web" del reporte diario
--   (GET /api/asesor/pedidos-web).
-- · plantilla_estado: el WhatsApp automático de "recibimos su pedido"
--   (PLANTILLA_PEDIDO_WEB) que sale a los 3 min si el cliente no escribió
--   antes: pendiente → enviada | omitida (ya escribió) | fallida.
CREATE TABLE IF NOT EXISTS pedidos_web (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  fila INTEGER,
  nombre TEXT,
  wa_id TEXT NOT NULL,
  envio TEXT,
  destino TEXT,
  etiqueta TEXT,
  bump TEXT,
  total REAL,
  plantilla_estado TEXT NOT NULL DEFAULT 'pendiente',
  plantilla_at TEXT,
  plantilla_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_pedidos_web_fecha ON pedidos_web(created_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_web_fila ON pedidos_web(fila);
CREATE INDEX IF NOT EXISTS idx_pedidos_web_plantilla ON pedidos_web(plantilla_estado, created_at);
