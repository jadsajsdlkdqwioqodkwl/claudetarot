-- Segundo producto en otro número (URO). Aplicar a mano, después de la 0045.
-- · lineas.pixel_id: dataset/píxel de Meta de esa línea para los eventos "manuales"
--   (sin clic de anuncio). Los de anuncio van al dataset de la WABA de la línea.
-- · conversations.ctwa_clid: el clic del anuncio de ESE chat (en otra línea el
--   contacto no lo guarda: es de Tarot Store).
-- · productos.color: color del chat en la bandeja (#rrggbb).
ALTER TABLE lineas ADD COLUMN pixel_id TEXT;
ALTER TABLE conversations ADD COLUMN ctwa_clid TEXT;
ALTER TABLE productos ADD COLUMN color TEXT;
