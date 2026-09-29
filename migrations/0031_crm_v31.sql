-- Aprendizaje del asesor sin tocar docs/negocio.md:
-- · asesor_memoria: lecciones que las Routines anotan con evidencia (qué
--   funcionó, qué no, cómo escriben las vendedoras) y que leen en cada
--   corrida junto con el contexto del negocio. Se retiran, no se borran.
-- · texto_original: lo que propuso el bot, para medir cuánto lo corrigen
--   las personas antes de aprobarlo (y aprender de esas correcciones).
CREATE TABLE IF NOT EXISTS asesor_memoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tema TEXT NOT NULL,                 -- ej. "objeción precio", "estilo", "provincia"
  nota TEXT NOT NULL,                 -- la lección, con su evidencia
  fuente TEXT,                        -- quién la anotó ("director CRO 2026-09-29")
  activa INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  retirada_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_memoria_activa ON asesor_memoria(activa, created_at);

ALTER TABLE asesor_sugerencias ADD COLUMN texto_original TEXT;
