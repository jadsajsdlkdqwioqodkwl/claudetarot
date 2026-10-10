-- APLICAR A MANO en D1 (los toques ya están prendidos en wrangler.jsonc: sin esta tabla el cron solo registra el error "Toques: no such table").
-- · toques: plan de toques de los días 2/7/14/30 (src/lib/toques.js). Una
--   fila por chat y toque: enviada, control (grupo de control, no se le
--   mandó), enviando o fallida.
CREATE TABLE IF NOT EXISTS toques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  toque TEXT NOT NULL,
  estado TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conversation_id, toque)
);
CREATE INDEX IF NOT EXISTS idx_toques_fecha ON toques(created_at);
