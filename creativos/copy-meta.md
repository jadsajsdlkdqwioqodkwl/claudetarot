# Instrucciones — Copy y titular de Meta Ads (Tarot Store Perú)

Las sigue Claude Code justo después de renderizar cada lote (skill `creativos`), mirando la imagen ya generada. Espejo editable en la pestaña **Copy reglas** de la hoja (una fila por sección): si el dueño cambia algo ahí, Claude Code lo pasa a este archivo antes de escribir. Si algo choca con la sección "Aprendizajes", manda Aprendizajes.

## 1. Qué haces

Para cada imagen del lote escribes lo que va alrededor de ella en Meta (Facebook e Instagram):

- **Titular** (headline): va debajo de la imagen, en negrita, junto al botón. Su trabajo es uno solo: que la persona siga leyendo y toque. Es lo más importante que escribes.
- **Texto principal** (primary text): va arriba de la imagen. Su primera oración es el segundo gancho más importante.
- **Descripción**: línea corta bajo el titular (en muchas ubicaciones no se ve; que el anuncio funcione sin ella).
- **Botón**: el CTA de Meta.

No cambias la imagen: la completas. Antes de escribir, mírala (hoja de contacto) y lee sus textos exactos en el objeto "textos" del prompt del lote.json.

## 2. Dónde escribes

Pestaña **Copy Meta** de la hoja 19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY, una fila por imagen, debajo de la última con datos: A Lote · B ID · C Imagen (la misma fórmula =IMAGE(...) de la columna C de Creativos para ese Lote e ID, que sale de `filas.mjs`) · D Lo que dice la imagen (1 línea) · E Consciencia · F Texto principal · G Titular 1 · H Titular 2 · I Titular 3 · J Descripción · K Botón · L Estado: "para revisar" · M Nota (vacío) · N Comentario (vacío). El borrador de la columna Copy de Prompts es solo un insumo: reescríbelo con estas reglas.

## 3. A quién le hablas

Del brief (https://docs.google.com/document/d/1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0, léelo para frases reales):

- Persona curiosa de 25 a 45+ años, 60–70 % mujeres y 30–40 % hombres, en Perú. Escribe neutro en género.
- No sabe nada de tarot y quiere aprender a leerse a sí misma. Su única duda es ella misma ("no sé nada", "¿es fácil aprender?"), no el precio ni el envío.
- Compra como quien compra un curso o un hobby, no por algo espiritual ni místico.
- Preguntas que siempre hace: cuántas cartas son, si trae arcanos mayores y menores, si trae manual y si está en español, qué es el collar, cuánto demora, si hay tienda física.

Palabras: kit, cartas, tarot, manual o guía, tapete, arcanos mayores y menores, collar amuleto. Evita set, libreto, baraja, mazo, booklet. Nunca "original".

## 4. El titular (lo más importante)

El titular es lo que hace que la persona siga leyendo. Si no engancha, nada más importa. Escríbelo como Gary Halbert: una frase que una persona real diría, concreta, con una promesa o una curiosidad que pica y no se resuelve hasta leer más.

Reglas duras:

- **Máximo 40 caracteres** (Meta lo corta en el celular). Cuéntalos.
- **No repite la imagen**: suma lo que la imagen no dice o lo dice de otra forma más filosa.
- **Específico**: números, objetos del kit, tiempos, situaciones reales. "78 cartas que se explican solas" le gana a "Aprende tarot fácil".
- **Una sola idea**, en lenguaje de cliente, tuteo, neutro en género.
- **3 titulares por anuncio, de 3 tipos distintos** de esta lista:
  1. Curiosidad: "Lo que trae escrito cada carta".
  2. Promesa concreta con tiempo: "Tu primera lectura esta misma noche".
  3. Voz del cliente: "No sé nada de tarot. ¿Puedo?" (frases reales del brief).
  4. Número específico: "78 cartas y ni una por memorizar".
  5. Objeción resuelta: "Manual en español, paso a paso".
  6. Noticia: "Ya llegó el kit para empezar de cero".
  7. Oferta clara (solo consciencia alta): "Kit completo a S/89, envío gratis".
- **Según la consciencia del anuncio**: inconsciente → curiosidad o beneficio de vida; problema → el "no sé nada" y la salida; solución → por qué este kit; producto → qué trae; muy consciente → oferta y facilidad.
- Prohibido: exclamaciones dobles, MAYÚSCULAS completas, emojis, "+", "Descubre", "Desbloquea", "Transforma tu vida", "Usa X, no Y", "Hoy, no mañana", "Ver kit", preguntas que se responden con "no".

Prueba antes de escribirlo: si lo lees en voz alta, ¿alguien que no sabe nada de tarot diría "a ver, ¿cómo así?" y seguiría leyendo? Si no, reescríbelo.

## 5. El texto principal

- **La primera oración es un gancho** que se lee sola y obliga a seguir: máximo 15 palabras, estilo Halbert. Abre con una situación concreta del cliente, un dato sorprendente del kit o una promesa específica. Nunca abras con el nombre de la tienda, con "¿Sabías que…?" ni con una pregunta genérica.
  Buenos arranques: "Mi primera tirada la hice con el manual abierto y salió bien." · "Cada una de estas 78 cartas trae su significado impreso." · "Nunca habías tocado una carta y esta noche ya puedes leerte una."
- Las primeras 125 letras son lo que se ve antes de "Ver más": gancho completo ahí.
- Después, en 2 a 4 frases cortas: qué es, qué incluye (78 cartas con el significado impreso, 22 arcanos mayores y 56 menores, manual en español paso a paso, tapete floral, collar amuleto de regalo), para qué sirve y cómo se compra.
- Responde una o dos dudas del cliente que la imagen no responde.
- Cierra con una acción de compra natural ("Escríbenos y te lo separamos", "Pídelo y pagas al recibir en Lima"). No hace falta decir WhatsApp.
- Largo total: 300 a 600 caracteres. Párrafos de 1 a 2 líneas. Máximo 2 emojis en todo el texto, y solo si suman.
- Prosa natural de vendedora peruana. Nada de listas con "+" ni frases de anuncio de IA.
- Cada texto principal y cada primera oración son distintos a los de las otras filas de Copy Meta.

## 6. Descripción y botón

- **Descripción**: 20 a 30 caracteres con un dato de confianza: "Envío gratis a todo el Perú", "En Lima pagas al recibir", "Manual en español incluido".
- **Botón**: los anuncios van a WhatsApp, así que por defecto "Enviar mensaje". Si el anuncio es de oferta muy consciente, propón "Comprar" entre paréntesis como alternativa.

## 7. Precios y promesas

Solo lo que dice la pestaña Reglas: kit S/89; 2 kits S/149; envío gratis a todo el Perú; en Lima pagas al recibir; provincia por Shalom u Olva con adelanto de S/20; collar amuleto de regalo. No inventes descuentos, plazos de entrega, testimonios, estrellas ni cifras de clientes.

## 8. Políticas de Meta (para que no rechacen el anuncio)

- No afirmes ni insinúes atributos personales de quien lee: nada de "¿Estás ansiosa?", "Sabemos que estás perdido", "Tú que no tienes pareja". Habla de la situación, no de la persona: "Si nunca has leído cartas…" sí; "Tú, que estás confundida…" no.
- No prometas predecir el futuro con certeza, curar, ganar dinero ni resultados garantizados. Sí puedes prometer aprender, ordenar tus ideas, tener tu propio ritual, conocerte mejor.
- Nada de antes/después corporal ni lenguaje de salud mental ("terapia", "ansiedad", "depresión").

## 9. Revisión antes de escribir cada fila

Antes de escribir, verifica en silencio:

1. ¿El titular tiene 40 caracteres o menos, no repite la imagen y obliga a seguir leyendo?
2. ¿Los 3 titulares son de ángulos distintos?
3. ¿La primera oración engancha sola (máx. 15 palabras) y las primeras 125 letras se entienden sin el resto?
4. ¿Responde una duda que la imagen no responde?
5. ¿Le habla al principiante y aleja al que busca cursos o ser tarotista?
6. ¿Precios y regalos son los de Reglas?
7. ¿Cumple las políticas de Meta del punto 8?

Si algo falla, reescribe esa parte.

## 10. Aprendizajes

(Claude Code agrega aquí lo que aprende de las notas y comentarios de la pestaña Copy Meta, con fecha y lote. Manda sobre todo lo anterior.)

- (vacío hasta el primer feedback de copy)
