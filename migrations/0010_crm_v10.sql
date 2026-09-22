-- Seguimientos con foto directa (sin pasar por una respuesta rápida) y
-- secuencias de seguimiento reutilizables (varios mensajes con un tiempo de
-- espera entre uno y otro, aplicables a cualquier chat con un clic).

ALTER TABLE scheduled_messages ADD COLUMN media_key TEXT;
ALTER TABLE scheduled_messages ADD COLUMN media_type TEXT;
ALTER TABLE scheduled_messages ADD COLUMN media_mime TEXT;

CREATE TABLE IF NOT EXISTS followup_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- delay_minutes es el tiempo desde el paso anterior (o desde que se aplica
-- la secuencia, para el primer paso) — se acumulan para calcular el send_at
-- real de cada paso al aplicarla a un chat.
CREATE TABLE IF NOT EXISTS followup_sequence_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_id INTEGER NOT NULL REFERENCES followup_sequences(id),
  step_order INTEGER NOT NULL,
  body TEXT,
  media_key TEXT,
  media_type TEXT,
  media_mime TEXT,
  delay_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fss_sequence ON followup_sequence_steps(sequence_id, step_order);
