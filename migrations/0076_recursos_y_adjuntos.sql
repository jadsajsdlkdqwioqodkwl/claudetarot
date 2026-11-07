-- Dueño, 2026-11-07.
-- 1) Lo que el asesor recomienda ADJUNTAR (fotos, PDF, link del banco de recursos) va aparte del texto, como nota para
--    la vendedora: nunca más «¿le mando fotos?» dentro del mensaje. JSON: ["Fotos de envíos de hoy", "recurso#3"].
-- 2) Plantilla que el asesor sugiere para chats con la ventana de 24 h cerrada; al mandarla la recomendación queda
--    «esperando respuesta» (plantilla_enviada_at) y vuelve a subir con su texto cuando el cliente contesta.
ALTER TABLE asesor_sugerencias ADD COLUMN adjuntar TEXT;
ALTER TABLE asesor_sugerencias ADD COLUMN plantilla TEXT;
ALTER TABLE asesor_sugerencias ADD COLUMN plantilla_enviada_at TEXT;

-- 3) Banco de recursos (pestaña «Recursos» del CRM): fotos, PDF, videos, links y textos que el equipo descarga o
--    manda al chat, y que el asesor conoce por su título para recomendarlos.
CREATE TABLE IF NOT EXISTS recursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,              -- foto | video | pdf | link | texto
  titulo TEXT NOT NULL,
  descripcion TEXT,                -- para qué sirve / cuándo usarlo (lo lee el asesor)
  categoria TEXT,
  media_key TEXT,                  -- archivo en R2 (foto, video, pdf)
  media_mime TEXT,
  url TEXT,                        -- link
  texto TEXT,                      -- texto listo para copiar
  orden INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
