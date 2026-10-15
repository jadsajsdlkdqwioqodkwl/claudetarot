# URO — lista de llamadas para la asesora comercial

Hoja de Google: **«URO - Lista de llamadas (asesora comercial)»**
`1CujjC-Mt_OpEpuJ3S4n_DbKQnR3T_TEa4C9awBkIAjk` (Drive del dueño). No mover, no renombrar, no recrear:
la Routine la escribe por su ID.

Para quién es: una asesora que **llama por teléfono** a clientes de URO que escribieron por WhatsApp
(número +51 940 028 332, línea id 1) y no compraron. Por cada uno ve el resumen del chat, un mini speech
de venta para la llamada y su teléfono, y marca el check cuando ya lo llamó.

## Pestañas y columnas (no reordenar; las nuevas van al final)

**Llamadas**: A Llamado (casilla; la marca la asesora, la fila se pinta de verde) · B Teléfono (`51 999 999 999`, texto) ·
C Nombre · D Interés (Alto / Medio / Bajo / Ya compró) · E Última actividad del cliente (hora de Lima) ·
F Resumen de la conversación · G Speech para la llamada · H Ojo antes de llamar · I Notas de la asesora (libre, suya).
Tiene filtro; la Routine NUNCA escribe en A ni en I.

**Estado** (memoria de la Routine): A WhatsApp · B último mensaje leído (id) · C qué se hizo («En la lista» o
«Descartado: motivo»). Es lo que permite leer SOLO lo nuevo cada hora.

## Cómo corre (cada hora, con el plan, sin API de IA)

Routine «URO — lista de llamadas» (ver `docs/routines.md`). `scripts/uro/llamadas.py preparar` baja los
chats de URO (`/api/asesor/chats?linea=1`, 14 días), descarta los que solo mandaron el saludo del anuncio,
los números internos (`INTERNOS` en el script) y los que no tienen mensajes nuevos desde la última vez
(Estado). Si no queda nada imprime `SIN_NOVEDAD` y la Routine termina sin leer más. Tope 20 chats por corrida
(los demás salen en la hora siguiente, lo más reciente primero). **Nada llama a la API de Claude**: lo escribe la
sesión de la Routine con los créditos del plan (`npm run check` falla si el repo trae una llamada a esa API).

## Reglas para escribir cada fila

- Entra a la lista quien **escribió algo más que el saludo** del anuncio (respondió o mostró un mínimo de interés:
  pidió precio, dio ciudad, tocó LIMA/PROVINCIA, preguntó algo). NO entra (queda en Estado como «Descartado: …»):
  solo sticker, «gracias», pidió que no lo escriban, buscaba otro producto, ya compró en otro lado, es prueba del equipo.
- **Interés**: Alto = dio ciudad/distrito, preguntó algo concreto (originalidad, uso, 3 frascos) o recibió datos
  de pago; Medio = pidió precio o tocó un botón; Bajo = dijo que volvería más adelante. «Ya compró»: el chat
  tiene la etiqueta de compra (se avisa en `ya_compraron`; la Routine solo cambia D y H de esa fila).
- **Resumen** (F): 2–4 frases, lo que pasó de verdad: qué pidió, qué le respondieron y quién (nombre de la
  vendedora), en qué quedó, si solo recibió mensajes automáticos (entonces «nadie le respondió»).
- **Speech** (G): lo que la asesora dice por teléfono, de usted, corto, ~90 palabras, empieza saludando y
  recordando por qué la llama, 3 datos del producto, el dato de envío/pago que corresponde (Lima / provincia) y
  cierra con UNA pregunta que avance (cuántos frascos, ciudad, distrito, qué dudas le quedan). Adaptado a lo que ella
  preguntó (originalidad, uso, precio, farmacia…). Ver «Datos» abajo.
- **Ojo** (H): lo que la asesora debe saber antes de marcar: su freno probable (desconfianza, precio, tiempo,
  falta de información), qué falta (dirección, ciudad), ofertas ya mandadas, y qué NO afirmar.
- Se nombra a la clienta solo si el nombre es real; si es emoji o apodo, «(sin nombre, emoji)» y el speech
  no usa nombre.
- Tema íntimo (`docs/uro/negocio.md`): no pedir detalles de síntomas; embarazo, lactancia, tratamiento médico o
  síntomas fuertes → «le recomendamos consultarlo con su médico»; nunca «cura», «elimina candidiasis» ni «desde la raíz».
  OJO: el texto largo de bienvenida que usa el equipo trae frases así («Combate la Candida Albicans», «Elimina mal
  olor…»); NO se copian al speech.

## Datos del producto para el speech (de `docs/uro/negocio.md` y de lo que ya dicen las vendedoras en los chats)

- Probióticos de consumo oral en cápsulas, 2 al día; frasco de 60 cápsulas = 1 mes. Suplemento, no medicamento.
- Ayuda a equilibrar la flora íntima y el pH desde adentro; apoya frente a mal olor, flujo, picazón o ardor.
- 1 frasco S/89 · 2 frascos S/139 · 3 frascos S/179 (tratamiento recomendado, 3 meses). Envío gratis.
- Lima: entrega al día siguiente entre 12 p. m. y 5 p. m., el motorizado llama antes, paga al recibir (Yape, efectivo o
  tarjeta); necesita distrito/dirección y teléfono de quien recibe.
- Provincia: Shalom u Olva (Shalom 2–3 días, Olva 1–3 días), pago contra entrega con adelanto de S/20 por Yape.
- Original: envase y cajita traen códigos; las vendedoras mandan videos.
- Pendiente del dueño (no inventar; ponerlo en «Ojo»): si se vende en farmacias, DIGESA, si sigue vigente el precio S/80
  que mandan los mensajes automáticos, cómo se toma exactamente.
- Si el dueño cambia precios o condiciones, `docs/uro/negocio.md` manda; actualice aquí esta lista.

## Prompt de la Routine

Está completo en `docs/routines.md` → «URO — lista de llamadas».
