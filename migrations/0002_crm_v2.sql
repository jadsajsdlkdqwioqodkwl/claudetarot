-- Segunda vuelta del CRM: seguimiento con estrella, datos de anuncio (para el
-- reporte tipo CAPI), medios entrantes/salientes y respuestas rápidas.
-- Aplicada a mano vía D1 MCP el 2026-09-22.

ALTER TABLE conversations ADD COLUMN follow_up INTEGER NOT NULL DEFAULT 0;

-- Lo que manda WhatsApp en el primer mensaje cuando el chat viene de un anuncio
-- "Click to WhatsApp" (Meta/Instagram Ads). ctwa_clid es el id que después
-- permite reportarlo como conversión. Todo puede venir vacío: solo se llena
-- si el chat empezó desde un anuncio.
ALTER TABLE contacts ADD COLUMN ctwa_clid TEXT;
ALTER TABLE contacts ADD COLUMN ad_source_type TEXT;
ALTER TABLE contacts ADD COLUMN ad_source_id TEXT;
ALTER TABLE contacts ADD COLUMN ad_source_url TEXT;
ALTER TABLE contacts ADD COLUMN ad_headline TEXT;
ALTER TABLE contacts ADD COLUMN ad_body TEXT;
ALTER TABLE contacts ADD COLUMN ad_media_type TEXT;
ALTER TABLE contacts ADD COLUMN first_seen_at TEXT;

ALTER TABLE messages ADD COLUMN media_key TEXT;

CREATE TABLE IF NOT EXISTS quick_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  media_key TEXT,
  media_mime TEXT,
  media_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_follow_up ON conversations(follow_up);
