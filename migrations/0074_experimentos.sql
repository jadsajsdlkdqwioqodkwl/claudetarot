-- Testers y experimentos de flujo (dueño, 2026-11-03): la prueba «Yape en 2 tiempos» y las que vengan.
-- Un tester es una vendedora marcada (agents.tester = 1), no un rol: sus permisos no cambian. Un experimento compara
-- dos flujos de respuestas rápidas (brazo A = control, brazo B = nuevo) en los chats de un segmento que atienden las
-- testers; cada chat cae en un brazo fijo (hash) y queda guardado.
-- Se aplica a mano: wrangler d1 execute claudetarot-crm --remote --file=migrations/0074_experimentos.sql
ALTER TABLE agents ADD COLUMN tester INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS experimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pausado',
  segmento TEXT NOT NULL DEFAULT 'provincia',
  solo_testers INTEGER NOT NULL DEFAULT 1,
  reparto REAL NOT NULL DEFAULT 0.5,
  brazo_a TEXT NOT NULL DEFAULT '[]',
  brazo_b TEXT NOT NULL DEFAULT '[]',
  etiqueta_a TEXT NOT NULL DEFAULT 'control',
  etiqueta_b TEXT NOT NULL DEFAULT 'nuevo',
  minimo_chats INTEGER NOT NULL DEFAULT 150,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cerrado_at TEXT
);
CREATE TABLE IF NOT EXISTS experimento_chats (
  experimento_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  brazo TEXT NOT NULL,
  agente TEXT,
  manual INTEGER NOT NULL DEFAULT 0,
  asignado_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (experimento_id, conversation_id)
);
