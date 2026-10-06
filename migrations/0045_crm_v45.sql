-- Varios productos y varios números de WhatsApp (src/lib/lineas.js, src/lib/productos.js).
-- Aplicar a mano (el deploy no aplica migraciones).
--
-- · lineas: cada número de WhatsApp Cloud API conectado al mismo webhook.
--   El número de Tarot Store sigue siendo el "principal" (WHATSAPP_PHONE_NUMBER_ID
--   de wrangler.jsonc): sus chats tienen conversations.linea_id NULL, así no
--   hay que tocar nada de lo que ya existe. Un número nuevo que mande el
--   webhook se registra solo aquí la primera vez (con el token de siempre).
--   token_var: nombre del secreto con el token de ese número si NO sirve el
--   WHATSAPP_TOKEN de siempre (otro Business Manager); vacío = el de siempre.
-- · productos: lo que se vende en una línea. El CRM reconoce el producto de
--   cada chat por el anuncio (ad id del click-to-WhatsApp), por palabras clave
--   del anuncio o del primer mensaje, o porque la línea tiene uno solo.
--   bienvenida_auto=0 apaga la bienvenida de ese producto. secuencia_id = la
--   secuencia de seguimiento de leads de ese producto (followup_sequences).
-- · producto_id en respuestas rápidas y pasos de bienvenida:
--   NULL = generales (las de Tarot Store de siempre).
CREATE TABLE IF NOT EXISTS lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  phone_number_id TEXT UNIQUE NOT NULL,
  waba_id TEXT,
  catalog_id TEXT,
  token_var TEXT,
  marca TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  linea_id INTEGER REFERENCES lineas(id),
  anuncios TEXT,
  palabras TEXT,
  precio TEXT,
  notas TEXT,
  secuencia_id INTEGER,
  bienvenida_auto INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE conversations ADD COLUMN linea_id INTEGER;
ALTER TABLE conversations ADD COLUMN producto_id INTEGER;
-- 'anuncio' | 'palabra' | 'linea' | 'manual': cómo se reconoció (una persona manda sobre lo automático).
ALTER TABLE conversations ADD COLUMN producto_origen TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_contact_linea ON conversations(contact_id, linea_id);
CREATE INDEX IF NOT EXISTS idx_conversations_producto ON conversations(producto_id);

ALTER TABLE quick_replies ADD COLUMN producto_id INTEGER;
ALTER TABLE welcome_steps ADD COLUMN producto_id INTEGER;
