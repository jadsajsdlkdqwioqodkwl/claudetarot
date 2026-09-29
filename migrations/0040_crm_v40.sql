-- Aplicada a mano vía D1 MCP el 2026-09-29.
-- · wa_media_cache: el media id de WhatsApp de cada archivo de R2 ya subido
--   (vale ~30 días en Meta; se reusa 25). Así las fotos de la bienvenida y
--   de las respuestas rápidas no se vuelven a subir en cada envío: salen al
--   toque. Ver subidaDe() en src/lib/crm-send.js.
-- · welcome_steps.texto_primero: 1 = en ese paso el texto va antes que sus
--   fotos/videos (por defecto, primero las fotos).
CREATE TABLE IF NOT EXISTS wa_media_cache (
  media_key TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  mime TEXT,
  file_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE welcome_steps ADD COLUMN texto_primero INTEGER NOT NULL DEFAULT 0;
