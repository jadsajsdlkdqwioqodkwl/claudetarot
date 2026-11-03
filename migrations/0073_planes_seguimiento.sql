-- Planes de seguimiento con nombre (dueño, 2026-11-03): reemplazan al único «plan universal» del ajuste
-- seguimiento_universal. Cada plan es una lista de pasos como los de una respuesta rápida
-- ({ horas | dia + hora, body, botones, media, plantilla, desde, activo }), con segmento (general, lima,
-- provincia), una versión B opcional con su % de reparto, y lo usan las respuestas rápidas
-- (quick_replies.followup_plan_id) o la bienvenida de anuncios (ajuste plan_interesados_id).
-- Se aplica a mano: wrangler d1 execute claudetarot-crm --remote --file=migrations/0073_planes_seguimiento.sql
CREATE TABLE IF NOT EXISTS planes_seguimiento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  segmento TEXT NOT NULL DEFAULT 'general',
  pasos TEXT NOT NULL DEFAULT '[]',
  version_b TEXT,
  reparto_b REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Qué brazo (A o B) le tocó a cada chat en un plan con versión B: fijo para siempre, aunque se reactive.
CREATE TABLE IF NOT EXISTS plan_asignaciones (
  plan_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  brazo TEXT NOT NULL,
  asignado_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (plan_id, conversation_id)
);
ALTER TABLE quick_replies ADD COLUMN followup_plan_id INTEGER;
-- Cada mensaje programado por un plan sabe de qué plan, brazo y paso salió (para medir por brazo y por hora).
ALTER TABLE scheduled_messages ADD COLUMN plan_id INTEGER;
ALTER TABLE scheduled_messages ADD COLUMN plan_brazo TEXT;
ALTER TABLE scheduled_messages ADD COLUMN plan_paso INTEGER;
-- El plan 1 «Universal» nace con los pasos del ajuste seguimiento_universal (que queda como respaldo de lectura).
INSERT INTO planes_seguimiento (id, nombre, segmento, pasos)
SELECT 1, 'Universal', 'general', COALESCE((SELECT value FROM crm_settings WHERE key = 'seguimiento_universal'), '[]')
WHERE NOT EXISTS (SELECT 1 FROM planes_seguimiento WHERE id = 1);
