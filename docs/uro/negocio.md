# URO — cómo se vende (para vendedoras y para el asesor)

Producto 2 del CRM, en su propio número de WhatsApp (línea "URO"). Las reglas
de Tarot Store (`docs/negocio.md`) NO aplican aquí. Los textos para clientes
siguen la forma de escribir de `voz-tarot-store` (de usted, corto, una
pregunta por mensaje), con el contenido de este archivo.

## Producto y precios (landing de URO)
- URO: probióticos de consumo oral, frasco de 60 cápsulas = 1 mes.
- 1 frasco S/89 · 2 frascos S/139 · 3 frascos S/179 (tratamiento
  recomendado: 3 meses).
- Envío gratis. Pago 100% contra entrega.

## Lo que se puede decir (y lo que no)
Es un **suplemento**, no un medicamento. Meta y WhatsApp revisan más los
productos de salud y DIGESA no permite prometer curas:
- SÍ: "ayuda a equilibrar la flora íntima y el pH", "apoya frente a mal olor,
  flujo, picazón o ardor", "complementa su cuidado si tiene molestias
  recurrentes", "sensación de frescura".
- NO: "elimina la candidiasis", "cura infecciones", "desde la raíz",
  "reemplaza al médico", antes/después, testimonios con diagnósticos.
- Embarazo, lactancia, tratamiento médico o síntomas fuertes (fiebre, dolor,
  sangrado): "le recomendamos consultarlo con su médico antes de tomarlo".
- Es un tema íntimo: nada de preguntar detalles de sus síntomas en el chat
  más allá de lo que ella cuente. No reenviar ni comentar sus chats.

## Pendiente de definir por el dueño (antes de abrir anuncios)
1. Provincia: ¿contra entrega en agencia Shalom o adelanto como Tarot?
2. Lima: horario de entrega y si el motorizado llama antes.
3. Cómo se toma (cuántas cápsulas al día) y si va indicado en el frasco.
4. ¿Empaque discreto (sin marca visible)? Muy valorado en este producto.
5. ¿Registro sanitario DIGESA? Si hay número, sirve para quien desconfía.
6. Herramienta de cierre permitida (descuento, regalo) y a quién.
7. Nombre de la asesora que firma la bienvenida (los de la competencia usan
   "Te saluda X, tu asesora en bienestar").

## Contenido cargado en el CRM (migrations/0047_uro_contenido.sql)
- Bienvenida (3 pasos, solo a chats nuevos de anuncio en el número URO).
- 8 respuestas rápidas "URO · …" (solo salen en chats de URO).
- Secuencia "URO · leads sin respuesta" (2 pasos, dentro de las 24 h).
Todo se edita desde el CRM; las fotos del producto se agregan ahí mismo
(Bienvenida → editar paso → archivo).
