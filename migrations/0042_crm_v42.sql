-- Aplicar a mano (el deploy no aplica migraciones).
-- · pedidos_web: cada formulario de la página (/api/order), terminara o no en
--   venta. De aquí sale la sección "🌐 Pedidos de la web" del reporte diario
--   (GET /api/asesor/pedidos-web).
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
  total REAL
);
CREATE INDEX IF NOT EXISTS idx_pedidos_web_fecha ON pedidos_web(created_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_web_fila ON pedidos_web(fila);
