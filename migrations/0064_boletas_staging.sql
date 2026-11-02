-- Staging de boletas que el dueño manda al número empresa desde WhatsApp.
-- El Worker guarda el media_id de WhatsApp; la Routine descarga y analiza.
CREATE TABLE IF NOT EXISTS boletas_staging (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_message_id    TEXT UNIQUE,
  media_id         TEXT NOT NULL,           -- ID de media de WhatsApp (persistente)
  media_mime       TEXT DEFAULT 'image/jpeg',
  lote_id          TEXT,                    -- timestamp del "ENVIAR" que activó el lote
  status           TEXT NOT NULL DEFAULT 'pendiente',
  -- pendiente  : llegó, aún no se mandó ENVIAR
  -- listo      : ENVIAR recibido, pendiente de análisis de la Routine
  -- en_proceso : Routine trabajando en esta foto
  -- enviado    : boleta llegó al cliente
  -- error      : no se pudo procesar (ver campo error)
  conversation_id  INTEGER,                 -- NULL hasta que la Routine haga match
  courier          TEXT,                    -- shalom | olva
  nombre_boleta    TEXT,                    -- nombre leído de la imagen
  dni_boleta       TEXT,                    -- DNI leído de la imagen
  orden            INTEGER DEFAULT 1,       -- 1=boleta principal, 2=foto del paquete
  error            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_boletas_staging_status ON boletas_staging(status);
CREATE INDEX IF NOT EXISTS idx_boletas_staging_lote ON boletas_staging(lote_id);
