-- Viktoria (cuenta que ya existe): solo lectura, limitada al producto Tarot.
-- Se aplica a mano (no la aplica el deploy), DESPUES de desplegar el Worker con el rol "lectura":
--   wrangler d1 execute claudetarot-crm --remote --file=migrations/0058_viktoria_solo_lectura.sql
-- Si no existe el producto Tarot, no cambia nada (nunca queda una cuenta de lectura sin límite).
UPDATE agents
SET role = 'lectura',
    producto_id = (SELECT id FROM productos WHERE nombre = 'Tarot' ORDER BY id DESC LIMIT 1)
WHERE (lower(username) = 'viktoria' OR lower(display_name) = 'viktoria')
  AND EXISTS (SELECT 1 FROM productos WHERE nombre = 'Tarot');
