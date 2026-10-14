-- Respuestas rápidas con catálogo: 0 = el catálogo sale ANTES del texto (como
-- hasta ahora), 1 = sale DESPUÉS del texto. Se aplica a mano.
ALTER TABLE quick_replies ADD COLUMN catalogo_despues INTEGER NOT NULL DEFAULT 0;
