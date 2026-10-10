-- YA APLICADA en D1 el 2026-10-10. El número de URO quedó después en +51 940 028 332 (Phone number ID 1293522693852278), WABA 1608866757469431.
-- Contenido inicial de URO (producto 2, número propio). Aplicar a mano DESPUÉS
-- de 0045 y 0046, cuando el número ya esté agregado en WhatsApp Manager.
-- ANTES de correrlo reemplaza en todo el archivo:
--   PHONE_ID_URO  → Phone number ID del número de URO
--   WABA_ID_URO   → WhatsApp Business Account ID ("Grupo CONDE")
-- Reglas y lo que falta definir: docs/uro/negocio.md.

-- Línea (si el número ya escribió y se registró solo, solo se completa).
INSERT INTO lineas (nombre, phone_number_id, waba_id, pixel_id, marca)
VALUES ('URO', 'PHONE_ID_URO', 'WABA_ID_URO', '1788156381816025', 'URO')
ON CONFLICT(phone_number_id) DO UPDATE SET nombre = 'URO', waba_id = excluded.waba_id, pixel_id = excluded.pixel_id, marca = 'URO';

-- Secuencia si no responde (dentro de las 24 h: 3 h y 20 h).
INSERT INTO followup_sequences (title) VALUES ('URO · leads sin respuesta');
INSERT INTO followup_sequence_steps (sequence_id, step_order, body, delay_minutes) VALUES
  ((SELECT MAX(id) FROM followup_sequences WHERE title = 'URO · leads sin respuesta'), 1,
   'Estimada, le cuento que el envío es gratis a todo el Perú y paga recién al recibir ☺️ ¿Para qué distrito o ciudad sería su pedido?', 180),
  ((SELECT MAX(id) FROM followup_sequences WHERE title = 'URO · leads sin respuesta'), 2,
   'Muchas mujeres lo toman los 3 meses completos porque la flora se equilibra de a pocos 🌸 Si gusta le separo su tratamiento, ¿le quedó alguna duda?', 1020);

-- Producto: todo lo que llega al número de URO es URO.
INSERT INTO productos (nombre, linea_id, palabras, precio, notas, color, secuencia_id, bienvenida_auto)
VALUES ('URO', (SELECT id FROM lineas WHERE phone_number_id = 'PHONE_ID_URO'),
  'uro, probiotico, probioticos, flora intima, ph vaginal, candidiasis',
  '1 frasco S/89 · 2 frascos S/139 · 3 frascos S/179 · envío gratis · 100% contra entrega',
  'Suplemento, no medicamento: no prometer curas. Ver docs/uro/negocio.md.',
  '#d6336c', (SELECT MAX(id) FROM followup_sequences WHERE title = 'URO · leads sin respuesta'), 1);

-- Bienvenida (solo chats de URO). Agregar la foto del frasco al paso 1 desde el CRM.
INSERT INTO welcome_steps (title, body, step_order, producto_id) VALUES
  ('URO 1 · saludo',
   'Hola, bienvenida a URO 🌸 Gracias por escribirnos. URO son probióticos en cápsulas de consumo oral que ayudan a equilibrar la flora íntima y el pH desde adentro ✨',
   (SELECT COALESCE(MAX(step_order), 0) + 1 FROM welcome_steps), (SELECT MAX(id) FROM productos WHERE nombre = 'URO'));
INSERT INTO welcome_steps (title, body, step_order, producto_id) VALUES
  ('URO 2 · precios',
   'Cada frasco trae 60 cápsulas y alcanza para 1 mes 💜
1 frasco: S/89
2 frascos: S/139
3 frascos: S/179 (tratamiento recomendado de 3 meses)
Envío gratis y paga al recibir.',
   (SELECT COALESCE(MAX(step_order), 0) + 1 FROM welcome_steps), (SELECT MAX(id) FROM productos WHERE nombre = 'URO'));
INSERT INTO welcome_steps (title, body, step_order, producto_id) VALUES
  ('URO 3 · destino',
   '¿Para qué distrito o ciudad sería su pedido? Así le confirmo la entrega ☺️',
   (SELECT COALESCE(MAX(step_order), 0) + 1 FROM welcome_steps), (SELECT MAX(id) FROM productos WHERE nombre = 'URO'));

-- Respuestas rápidas (solo salen en chats de URO).
-- (Una por INSERT: D1 corta los SELECT compuestos largos.)
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Precios', 'Claro ☺️ cada frasco trae 60 cápsulas para 1 mes:
1 frasco S/89
2 frascos S/139
3 frascos S/179, que es el tratamiento recomendado
¿Cuántos frascos desea?', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Qué es', 'URO son probióticos de consumo oral, se toman como cápsulas 🌸 Ayudan a equilibrar la flora íntima y el pH desde adentro, y apoyan frente a molestias como mal olor, flujo, picazón o ardor ✨', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Por qué 3 meses', 'La flora íntima se va equilibrando de a pocos, por eso se recomienda tomarlo 3 meses seguidos 💜 Con 3 frascos sale a S/179 en vez de S/267 sueltos ☺️', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Es medicamento?', 'Es un suplemento de probióticos, no un medicamento ☺️ Si está embarazada, dando de lactar o en algún tratamiento, le recomendamos consultarlo antes con su médico.', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Pago y envío', 'El envío es gratis a todo el Perú y el pago es contra entrega, paga recién cuando lo recibe ☺️ ¿Para qué distrito o ciudad sería?', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Lima datos', 'Perfecto ☺️ Me indica su dirección o ubicación 📍 y el teléfono de quien lo va a recibir, por favor.', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Provincia datos Shalom', 'Perfecto ☺️ Para enviarlo por Shalom me indica por favor:
Nombres y apellidos
DNI
Celular
Ciudad y agencia Shalom de destino', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Pedido confirmado', 'Muchas gracias por su confianza 🌸 Su pedido quedó registrado, le avisamos cuando salga ✨', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
