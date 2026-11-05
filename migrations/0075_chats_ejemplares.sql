-- Chats ejemplares (dueño, 2026-11-04): banco de conocimiento. El admin marca un chat como ejemplo («desconfiado que al
-- final compró», «pide el pedido para hoy») con un título y notas; el equipo lo ve en Herramientas y el asesor lo recibe
-- en su contexto (con el whatsapp, para leer el chat completo con reporte.py chat). Un chat solo puede ser ejemplar una vez.
CREATE TABLE IF NOT EXISTS chats_ejemplares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  notas TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
