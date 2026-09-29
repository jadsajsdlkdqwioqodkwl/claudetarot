-- Embudo automático, pruebas de mensajes y análisis del asesor.
--
-- · conversations.etapa: la etapa más alta del embudo a la que llegó el chat
--   (1 escribió … 5 cerró), calculada sin IA en el cron */5 (crm-embudo.js).
-- · variantes: otras versiones del texto de una respuesta rápida o de un paso
--   de la bienvenida. La original es la versión 0 (no tiene fila). Las propone
--   el director CRO (✨ Sugerencias) o el admin a mano; el Worker reparte cuál
--   sale y mide cuál hace avanzar más chats. Nada cambia sin que el admin elija.
-- · variante_usos: cada vez que salió una versión, a qué chat y en qué etapa
--   estaba. De ahí salen "respondió en 24 h", "avanzó" y "cerró".
-- · chat_analisis: lo que la Routine concluye de cada chat (intención,
--   objeción, por qué se ganó o perdió, calidad de la atención).
-- · asesor_informes: el texto de cada informe del director CRO, para el
--   resumen semanal por correo (sin volver a gastar tokens).
-- · asesor_sugerencias.ref_tipo/ref_id: a qué respuesta rápida o paso de
--   bienvenida apunta una sugerencia tipo 'variante'.

ALTER TABLE conversations ADD COLUMN etapa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN etapa_at TEXT;
ALTER TABLE conversations ADD COLUMN etapa_revisada_at TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_etapa ON conversations(etapa_revisada_at);

CREATE TABLE IF NOT EXISTS variantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                  -- 'rapida' | 'bienvenida'
  ref_id INTEGER NOT NULL,             -- quick_replies.id | welcome_steps.id
  texto TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa', -- activa | ganadora | retirada | anterior
  origen TEXT,                         -- "director CRO", "admin", …
  motivo TEXT,                         -- la hipótesis
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cerrada_at TEXT,
  cerrada_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_variantes_ref ON variantes(tipo, ref_id, estado);

CREATE TABLE IF NOT EXISTS variante_usos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  variante_id INTEGER NOT NULL DEFAULT 0, -- 0 = el texto original
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  etapa_antes INTEGER NOT NULL DEFAULT 0,
  agente TEXT,
  editada INTEGER NOT NULL DEFAULT 0,    -- la vendedora cambió el texto antes de mandarlo
  a_mano INTEGER NOT NULL DEFAULT 0,     -- la vendedora eligió la versión con los botones 1·2·3 (no cuenta para el reparto)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usos_ref ON variante_usos(tipo, ref_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usos_conv ON variante_usos(conversation_id);

CREATE TABLE IF NOT EXISTS chat_analisis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  fecha TEXT NOT NULL,                 -- día de Lima que se analizó (yyyy-mm-dd)
  intencion TEXT,                      -- alta | media | baja | ninguna
  resultado TEXT,                      -- ganado | perdido | abierto
  motivo TEXT,                         -- por qué se ganó o se perdió
  objecion TEXT,                       -- la principal, si hubo
  calidad INTEGER,                     -- 1–5: qué tan bien lo atendió el equipo
  agente TEXT,
  upsell TEXT,                         -- oportunidad de venta cruzada, si hubo
  nota TEXT,                           -- coaching concreto para la vendedora
  origen TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conversation_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_analisis_fecha ON chat_analisis(fecha);

CREATE TABLE IF NOT EXISTS asesor_informes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origen TEXT,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE asesor_sugerencias ADD COLUMN ref_tipo TEXT;
ALTER TABLE asesor_sugerencias ADD COLUMN ref_id INTEGER;
