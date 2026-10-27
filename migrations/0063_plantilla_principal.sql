-- Plantilla principal de una respuesta rápida: si la tiene, se manda esa plantilla
-- en lugar del texto body. El seguimiento sigue siendo el de la respuesta rápida.
ALTER TABLE quick_replies ADD COLUMN plantilla_principal TEXT;
