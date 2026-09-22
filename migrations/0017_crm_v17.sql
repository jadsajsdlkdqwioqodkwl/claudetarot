-- Para no perder de vista dos cosas que antes se caían silenciosas del
-- webhook: las fotos/videos "de una sola vista" (se marcan igual, pero antes
-- no había forma de saber que el cliente los mandó así) y las llamadas
-- (el campo "calls" del webhook se ignoraba por completo, filtrado junto a
-- cualquier campo que no fuera "messages").

ALTER TABLE messages ADD COLUMN view_once INTEGER NOT NULL DEFAULT 0;
