-- Guarda el motivo real que Meta devuelve cuando un mensaje saliente falla
-- (ej. "sticker demasiado pesado"), para poder mostrárselo a la vendedora en
-- vez de solo el ícono rojo genérico de "no se pudo enviar".

ALTER TABLE messages ADD COLUMN error_detail TEXT;
