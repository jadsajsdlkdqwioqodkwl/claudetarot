-- Aplicada a mano vía D1 MCP el 2026-09-29.
-- Orden de las versiones en prueba de una respuesta rápida, elegido por el
-- admin sin cerrar la prueba: JSON con los ids de `variantes` (0 = la
-- original), p. ej. "[12,0,15]". La primera es la predeterminada: es la que
-- se pone al tocar el mensaje (en vez del sorteo) y los botones 1·2·3·4
-- siguen este orden. NULL = sin orden fijo, el CRM sortea como siempre.
-- Se limpia al cerrar la prueba.
ALTER TABLE quick_replies ADD COLUMN orden_versiones TEXT;
