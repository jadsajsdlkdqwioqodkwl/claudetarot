-- Propuestas del asesor (la Routine de Claude) que esperan a una persona:
-- un seguimiento para un chat, o una respuesta rápida nueva con la lista de
-- chats a los que propone mandarla. Nada sale al cliente hasta que alguien
-- la aprueba en el CRM (✨ Sugerencias); al aprobar se vuelve un seguimiento
-- programado normal (scheduled_messages) y/o una respuesta rápida.
CREATE TABLE IF NOT EXISTS asesor_sugerencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                 -- 'seguimiento' | 'respuesta_rapida'
  conversation_id INTEGER REFERENCES conversations(id),
  wa_id TEXT,
  nombre TEXT,
  titulo TEXT,                        -- solo respuesta_rapida
  texto TEXT NOT NULL,
  motivo TEXT,
  destinatarios TEXT,                 -- respuesta_rapida: JSON [{conversation_id, wa_id, nombre}]
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | descartada
  origen TEXT,                        -- qué corrida la propuso (ej. "asesor 16:30", "director CRO")
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto_por TEXT,
  resuelto_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sugerencias_estado ON asesor_sugerencias(estado, created_at);
CREATE INDEX IF NOT EXISTS idx_sugerencias_conv ON asesor_sugerencias(conversation_id, estado);
