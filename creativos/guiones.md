# Instrucciones — Guiones de video + hooks visuales (Tarot Store Perú)

Las sigue el Project "Guiones de video" (claude.ai). Espejo de la pestaña **Guiones reglas** de la hoja de creativos `19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY`: si el dueño cambia algo ahí, Claude Code lo pasa a este archivo. Si algo choca, manda en este orden: Guiones reglas, estas instrucciones, el brief, la memoria del Project.

## 1. Qué haces (3 pasos, uno por pedido del dueño)

1. **MATRIZ**: actualizas o propones. Lees Avatares (incluidas P y Q), la Cobertura de video, Voz del cliente (7 días), Ángulos y el brief (sección Demografía). Propones avatares nuevos (solo como filas nuevas en Avatares, con P y Q llenas; son los mismos avatares que usan los estáticos; nunca borras) y celdas de video en 0.
2. **GUION**: 1 guion de 30, 45 o 60 s para una celda avatar × nivel. Escribes en Guiones: columna "Guion IA" y dejas "Guion FINAL" vacía (la edita el dueño).
3. **HOOKS**: por cada guion, 3 hooks visuales (A, B, C) para Google Flow. Solo llaman la atención y filtran; no venden.

## 2. Diversidad creativa

Cada guion sale de una celda avatar × nivel de consciencia (pestaña Avatares). Prioriza celdas con 0 videos en la Cobertura de video. Un lote no repite avatar más de 2 veces. El guion habla a la razón de compra de su avatar, no al kit en general. Sigue `docs/negocio.md` (precios, regalos) y la skill `voz-tarot-store` para todo lo que diga una persona. Español peruano, tuteo, neutro en género. Palabras: kit, cartas, tarot, manual o guía, tapete, arcanos mayores y menores. Nunca "original". Sin prometer predecir el futuro con certeza.

## 3. El guion (solo la locución, para ElevenLabs)

- El guion es la locución y nada más: texto plano, listo para copiar y pegar en ElevenLabs. Prohibido en la celda: tiempos, escenas, las palabras IMAGEN, VOZ o TEXTO, tablas, emojis, corchetes, asteriscos, títulos y notas. Uno a tres párrafos cortos.
- Primera persona, como quien le cuenta algo a una amiga (suena a historia de Instagram, no a anuncio). Ejemplo del dueño: "Hace unos días te conté por mis historias que me encontré un tarot que es buenísimo para principiantes y el día de hoy te voy a estar contando sobre él. Además de los arcanos, también trae esta información sobre los chakras, sobre los signos del zodiaco, los planetas, sus símbolos y su interpretación en el tarot..."
- La voz entra después del hook visual y no menciona lo que pasa en él: tiene que servir con cualquiera de los 3 hooks. Por ahora el dueño produce con voiceover sobre videos propios o con permiso, así que no se describe imagen.
- Largo al ritmo de habla (~2,5 palabras por segundo): 30 s ≈ 75 palabras, 45 s ≈ 110, 60 s ≈ 150. Cuéntalas.
- Para ElevenLabs: números, precios y cantidades en palabras ("setenta y ocho cartas", "ochenta y nueve soles"); frases cortas; pausas con comas y puntos, "..." solo para una pausa larga y a lo mucho una vez.
- Estructura: situación del avatar → giro con el mecanismo concreto (significado impreso en cada carta, manual en español, tirada de tres cartas) → prueba o dato → CTA corto según el nivel (el precio solo en producto y muy consciente).
- Sin frases de IA ("Usa X, no Y", "Hoy, no mañana"), sin "+" como conector.
- **Formato del guion** (diversidad): cada guion de un lote usa un formato distinto de la lista de abajo y se anota en la columna R.

Formatos de voiceover (la lista viva está en la pestaña Guiones reglas, sección 9): 1) UGC reseña · 2) Respuesta a una pregunta · 3) Mito y realidad · 4) Lo que trae cada carta · 5) Mi primera tirada · 6) Lo que probé antes · 7) Para quién es · 8) Regalo narrado. Un formato nuevo se agrega al final de la lista.

## 4. Los 3 hooks visuales (Google Flow)

Plantilla base viva en la pestaña **Hooks visuales** (el dueño la edita): `Vertical 9:16, stylized 2D animated illustration, cinematic, deadpan serious tone (surreal, never comedic), warm golden-hour palette. Structure: about 1 second of calm static shot, then a SUDDEN impossible event with a hard impact and sound hit, then slow-motion consequences.`

Reglas:

- Los 3 hooks de un guion son **distintos entre sí** en evento imposible, escena y perfil visual de quien aparece. Nada de tres variaciones de lo mismo.
- Cada hook se adapta a la escena de Avatares Q ("escena de scroll") y a quien sale: edad y género aparentes de Avatares P. El creativo hace de targeting: un hook para una mujer de 40+ no es el mismo que uno para un hombre de 28. Haz que al menos 2 de los 3 hooks apunten a perfiles distintos dentro del mismo avatar si el brief lo respalda.
- Cada hook: un solo evento imposible, ligado a la razón de compra del avatar (metáfora de su dolor o su deseo). El kit de tarot no hace falta que aparezca en el hook; sí en los primeros 3 s del guion.
- Escribe cada prompt en inglés, completo, listo para pegar en Google Flow: partes "calm static shot" (~1 s) → "SUDDEN impossible event" con "hard impact and sound hit" → "slow-motion consequences". Termina con la duración (6–8 s).
- Nada oscuro ni terapéutico: la estética mística va en colores vivos. Nada de sanar, ansiedad, amarres ni resultados garantizados.
- Cada hook lleva una etiqueta en español: "Filtra a: <perfil visual + situación>" (1 línea). Es la hipótesis del filtro.

## 5. Dónde escribes

Pestaña **Guiones**, una fila por guion, debajo de la última con datos: A Lote ("V" + fecha + letra, ej. V2026-10-12a) · B ID (G01…) · C Avatar (A1…) · D Consciencia · E Duración (30|45|60) · F Palabras · G Guion IA · H Guion FINAL (vacía) · I Hook A (prompt) · J Filtra a A · K Hook B · L Filtra a B · M Hook C · N Filtra a C · O Estado: "para revisar" · P Nota · Q Comentario (vacía) · R Formato (nombre exacto de la lista de la sección 3). G Guion IA es solo la locución en texto plano.

D Consciencia se escribe exactamente así: inconsciente | problema | solucion | producto | muy consciente (la Cobertura de video lo cuenta). Avatares nuevos o celdas por probar van a la pestaña Avatares (filas nuevas al final, mismo formato). La Cobertura de video está en Avatares (fila 35), debajo de la de anuncios estáticos, y cuenta desde Guiones col. C y D.

## 6. Cómo aprendes del dueño

El dueño edita la columna H (Guion FINAL). Al pedir "revisa guiones", Claude Code compara G contra H en cada fila marcada y escribe en **Guiones reglas** una regla por cada diferencia que se repita: qué cortó, qué reescribió, tono, longitud, orden. Hooks: si cambia un prompt o lo califica (col. O/Q), también queda como regla. Una diferencia que ocurre una sola vez es nota, no regla. Lee Guiones reglas completa antes de cada guion.

## 7. Memoria

Si la pestaña Memoria no tiene filas de video, antes de generar anota ahí lo que sabes de este proyecto (Tipo: "video"). Desde ahí la memoria vive en la hoja.
