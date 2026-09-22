-- Biblioteca de stickers: se suben una vez (webp, ya subido a R2 vía
-- /api/crm/upload-media) y quedan disponibles para mandar con un clic desde
-- cualquier chat, en vez de tener que adjuntar el archivo cada vez.

CREATE TABLE IF NOT EXISTS stickers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_key TEXT NOT NULL,
  media_mime TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
