-- Respuesta automática a comentarios de Facebook e Instagram (dueño, 2026-11-11). Un registro por comentario visto:
-- evita responder dos veces (Meta reintenta webhooks) y deja el historial en CRM → Herramientas → Comentarios de redes.
CREATE TABLE IF NOT EXISTS redes_comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plataforma TEXT NOT NULL,          -- facebook | instagram
  comment_id TEXT NOT NULL,
  post_id TEXT,
  autor_id TEXT,                     -- PSID / IGSID de quien comentó
  autor TEXT,                        -- nombre o @usuario
  texto TEXT,
  palabra TEXT,                      -- la palabra clave que lo activó (NULL = no aplicaba)
  respondido INTEGER NOT NULL DEFAULT 0,   -- respuesta pública al comentario
  dm_enviado INTEGER NOT NULL DEFAULT 0,   -- mensaje privado (private reply)
  imagen_enviada INTEGER NOT NULL DEFAULT 0, -- la foto del kit, cuando la persona escribe por DM después
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plataforma, comment_id)
);
CREATE INDEX IF NOT EXISTS idx_redes_comentarios_autor ON redes_comentarios (plataforma, autor_id);
