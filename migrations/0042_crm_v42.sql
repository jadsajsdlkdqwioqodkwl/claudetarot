-- Aplicada a mano vía D1 MCP el 2026-10-02.
-- · variantes.catalogo: en las pruebas de una respuesta rápida, con qué sale
--   esa versión. NULL = igual que la respuesta (sus fotos o su catálogo),
--   "-" = con sus fotos/videos, "*" = catálogo completo, o el retailer_id
--   de un producto. Así se prueba fotos contra catálogo.
-- · variantes.catalogo_nombre: el nombre del producto, para mostrarlo.
ALTER TABLE variantes ADD COLUMN catalogo TEXT;
ALTER TABLE variantes ADD COLUMN catalogo_nombre TEXT;
