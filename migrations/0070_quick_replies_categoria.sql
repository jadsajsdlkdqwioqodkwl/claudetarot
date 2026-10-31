-- Categoría de la respuesta rápida: 'ventas', 'atencion' o NULL (general).
-- Permite filtrar el panel por tipo de uso.
ALTER TABLE quick_replies ADD COLUMN categoria TEXT;
