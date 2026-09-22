-- Sexta vuelta: respuestas rápidas con varias fotos, caché de nombres de
-- producto del catálogo (para no mostrar el SKU crudo), y ajustes generales
-- del CRM (hoy solo la respuesta rápida de bienvenida para anuncios).

CREATE TABLE IF NOT EXISTS quick_reply_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quick_reply_id INTEGER NOT NULL REFERENCES quick_replies(id),
  media_key TEXT NOT NULL,
  media_mime TEXT,
  media_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qrm_quick_reply ON quick_reply_media(quick_reply_id);

-- Migra la foto/video único que ya tenían las respuestas rápidas existentes.
INSERT INTO quick_reply_media (quick_reply_id, media_key, media_mime, media_type, sort_order)
  SELECT id, media_key, media_mime, media_type, 0 FROM quick_replies WHERE media_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_products (
  retailer_id TEXT PRIMARY KEY,
  catalog_id TEXT,
  name TEXT,
  image_url TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
