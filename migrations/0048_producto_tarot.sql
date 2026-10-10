-- Producto "Tarot" en el número principal (Tarot Store), para que el CRM lo reconozca como a URO:
-- insignia en la lista, filtro por producto y respuestas rápidas combinadas de ambos productos.
-- Las respuestas rápidas que ya existen siguen siendo "generales" (salen en todos los chats).
-- Sin secuencia propia: el seguimiento de leads sigue siendo el general (ajuste ad_followup_sequence_id).
-- Es idempotente: si ya existe, no hace nada.
INSERT INTO productos (nombre, linea_id, palabras, precio, notas, color, bienvenida_auto, activo)
SELECT 'Tarot', NULL, 'tarot, kit de tarot, cartas de tarot, rider waite, baraja', 'Kit S/89 · 2 kits S/149 · envío gratis',
       'Reglas del negocio en docs/negocio.md', '#6f42c1', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM productos WHERE nombre = 'Tarot' AND linea_id IS NULL);
