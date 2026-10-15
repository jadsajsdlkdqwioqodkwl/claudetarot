-- Cuenta limitada a un producto + respuestas rápidas de URO en el registro de Tarot.
-- Se aplica a mano ANTES del deploy (el login ya lee agents.producto_id):
--   wrangler d1 execute <base> --remote --file=migrations/0057_cuenta_uro_y_rapidas.sql
-- agents.producto_id: si tiene valor, la cuenta solo ve y toca chats de ese producto
-- (src/lib/crm-auth.js, RUTAS_DE_PRODUCTO). Veronika: usuario "veronika", solo URO.
ALTER TABLE agents ADD COLUMN producto_id INTEGER;

-- Si el producto URO no existe, no inserta nada (nunca queda una cuenta sin límite).
INSERT INTO agents (username, password_hash, display_name, wa_id, role, producto_id)
SELECT 'veronika', '100000.44d4ea70b5fb5db0017b3c0ad59d2e39.c53d1dd80883b1aeeb4bc32fce77fbd1f0ecf9abd8b26e55a7291a24ea56980e', 'Veronika', '9350700774', 'vendedor', id
FROM productos WHERE nombre = 'URO' ORDER BY id DESC LIMIT 1;

-- Las 6 de la carga inicial (0047) que sonaban a bot, con la voz de las de Tarot.
-- (id + título: si alguien ya las cambió o borró, no se pisa nada.)
UPDATE quick_replies SET body = 'Hola estimad@ 🩷🤗 URO son probióticos en cápsulas de consumo oral, ayudan a equilibrar la flora íntima y el pH desde adentro ✨ Apoyan frente a molestias como mal olor, flujo, picazón o ardor 🌸 Solo son 2 cápsulas al día y cada frasco trae 60 para 1 mes 🙌 ¿Para dónde lo desea? 📍'
  WHERE id = 48 AND title = 'URO · Qué es';
UPDATE quick_replies SET body = 'Estimad@, la flora íntima se va equilibrando de a pocos 🌸 por eso el tratamiento recomendado es de 3 meses seguidos ✨ Con 3 frascos sale a S/179 en vez de S/267 sueltos, con envío gratis y pago contraentrega 🩷🤗 ¿Le separamos el suyo? 📍'
  WHERE id = 49 AND title = 'URO · Por qué 3 meses';
UPDATE quick_replies SET body = 'Claro estimad@ 🩷🤗 el envío es gratis a Lima y provincia. En Lima paga contraentrega (Yape, efectivo o tarjeta) y para provincia solo un adelanto de S/20 y el resto cuando llegue a su agencia ✨ ¿Para dónde lo desea? 📍'
  WHERE id = 51 AND title = 'URO · Pago y envío';
UPDATE quick_replies SET body = 'Perfecto estimad@ 🩷🤗 me indica por favor su ubicación 📍 y el teléfono de quien lo va a recibir para dejar su envío agendado ✨'
  WHERE id = 52 AND title = 'URO · Lima datos';
UPDATE quick_replies SET body = 'Perfecto estimad@ 🩷🤗 para enviarlo por Shalom nos indica por favor sus datos:
Nombres y apellidos
DNI
Celular
Ciudad y agencia Shalom de destino ✨'
  WHERE id = 53 AND title = 'URO · Provincia datos Shalom';
UPDATE quick_replies SET body = 'Muchas gracias estimad@ por la confianza ✨ Su pedido quedó registrado, le avisamos apenas salga su envío 🩷🤗'
  WHERE id = 54 AND title = 'URO · Pedido confirmado';

-- Las de Tarot que URO no tenía (#96, #100, #101, #102, #103), adaptadas. No se copiaron:
-- Material, ¿Es un curso? y ¿Es original? (no aplican a un suplemento; faltan datos del
-- dueño: ingredientes, registro DIGESA) ni Adelanto se descuenta (URO ya tiene #93).
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · Para qué sirve - cómo se toma', 'Hola bella 🩷🤗 URO son probióticos en cápsulas de consumo oral que ayudan a equilibrar la flora íntima y el pH desde adentro. Solo se toman 2 cápsulas al día ✨ Cada frasco trae 60 cápsulas para 1 mes y el tratamiento recomendado es de 3 meses 🌸 Si está embarazada, dando de lactar o en algún tratamiento, le recomendamos consultarlo antes con su médico. ¿Para dónde lo desea? 📍', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · SEPARAR SEPARADO LIMA', 'Claro bell@ 🩷🤗 solo recordarle que la promoción de URO está solo por esta semana con envío gratis y precio de S/89 el frasco.

Si desea separarlo se lo podemos dejar agendado, solo sería mediante un adelanto mínimo de S/10 soles 🙌✨', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · SEPARAR 2 SEPARADO', 'Aquí le envío algunas referencias (fotos de envíos) el yape sería a 927633099 a nombre de Moisés O.

Nos envía la captura para dejar su URO agendado 🩷🤗✨', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · SE PUEDE A X HORA?', 'Nuestro rango de entregas es de 12pm a 5pm estimada, pero de igual forma se tratará de realizar la entrega segun lo indicado. En caso no se llegue a concretar la entrega puede reagendar sin ningún problema 🩷🤗✨', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
INSERT INTO quick_replies (title, body, producto_id, sort_order) VALUES
('URO · pedido web', 'Buen día estimada X le saluda X de URO, le brindaré la información sobre la entrega de su pedido para Lima 🩷🤗✨', (SELECT MAX(id) FROM productos WHERE nombre = 'URO'), (SELECT COALESCE(MAX(sort_order), 0) FROM quick_replies) + 1);
