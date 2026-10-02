-- Aplicada a mano vía D1 MCP el 2026-10-02.
-- · quick_replies.catalogo: la respuesta rápida sale con el catálogo en vez
--   de sus fotos/videos. "*" = catálogo completo, o el retailer_id de un
--   producto (ej. las referencias cargadas como producto del catálogo).
--   NULL = con sus fotos/videos, como siempre.
-- · quick_replies.catalogo_nombre: el nombre del producto, para mostrarlo.
ALTER TABLE quick_replies ADD COLUMN catalogo TEXT;
ALTER TABLE quick_replies ADD COLUMN catalogo_nombre TEXT;
