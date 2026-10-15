-- Producto que una cuenta puede LEER sin escribir (además de su producto propio).
-- Veronika (solo URO) pasa a leer también los chats de Tarot. Se aplica a mano, ANTES del deploy
-- (el login ya lee agents.producto_lectura_id; si falta la columna, cae al esquema anterior):
--   wrangler d1 execute claudetarot-crm --remote --file=migrations/0058_viktoria_solo_lectura.sql
ALTER TABLE agents ADD COLUMN producto_lectura_id INTEGER;
-- Solo si es una cuenta ya limitada a un producto (nunca queda una cuenta de lectura sin límite).
UPDATE agents
SET producto_lectura_id = (SELECT id FROM productos WHERE nombre = 'Tarot' ORDER BY id DESC LIMIT 1)
WHERE username = 'veronika' AND producto_id IS NOT NULL;
