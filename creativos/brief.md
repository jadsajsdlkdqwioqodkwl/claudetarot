# Brief fijo de los anuncios estáticos

Lo lee Claude antes de cada lote. Lo fijo va aquí; lo que se aprende del
feedback va en `reglas_aprendidas.md` (y manda sobre esto si choca).

## Producto (fuente: `docs/negocio.md`)
- Kit Tarot de aprendizaje **S/89**: 78 cartas Rider-Waite con el significado
  impreso en cada carta (también chakra, numerología, planeta, signo, Sí/No),
  manual ilustrado en español, tapete floral y collar amuleto de regalo.
- 2 kits S/149. Envío gratis a todo el Perú. Lima: pagas al recibir.
  Provincia: Shalom u Olva con adelanto de S/20.
- Nunca decir "original" ni "Rider-Waite de marca". No prometer descuentos que
  no estén en negocio.md.
- La venta se cierra por WhatsApp: el CTA lleva a escribir/comprar.

## Público (fuente: brief en Google Docs, ver `instrucciones.md`)
- Persona curiosa de 25 a 45+ años, 60–70 % mujeres y 30–40 % hombres, que
  no sabe nada de tarot y quiere aprender a leerse. Neutro en género.
  Filtro: el anuncio habla al **principiante** ("sin memorizar",
  "lees desde el primer día").

## Formato
- 4:5 (lo pone el script, no el prompt). Texto grande y legible en el celular;
  zona central limpia; nada importante en el 10% de los bordes.
- Sin comillas en los textos de la imagen. Colores vivos, contraste alto. Español peruano, tú.
- Titular estilo Halbert: concreto, una promesa o una curiosidad, máx. 8 palabras.
- Bastante texto sin saturar (titular, apoyo, lo que incluye, prueba, CTA).
  Cada texto va entre comillas en el prompt y se pide escribirlo
  "exactamente así". Prosa: sin "+", sin "Usa X, no Y" ni "Hoy, no mañana".
- CTA de compra creativo y distinto en cada anuncio; nunca "Pide el tuyo por
  WhatsApp" ni "Ver kit".

## Variedad por lote
El reparto vigente está en `reglas_aprendidas.md`. La imagen siempre muestra
tarot; nunca imágenes genéricas.
- Mezclar niveles de consciencia (Schwartz): inconsciente, problema, solución,
  producto, muy consciente. No repetir ángulo ni composición dentro del lote.

## Fotos de referencia
Ver `refs/refs.json` (nombre → qué muestra y para qué sirve). Cada concepto
declara `refs: [{foto, rol}]`; el rol se le dice al modelo junto a la foto.

## Lo que aprendimos de los anuncios (lo actualiza Claude Code con cada feedback)
Insights de fondo sobre el cliente y lo que vende; las reglas operativas
(formatos, fotos, errores de render) están en `reglas_aprendidas.md`.
- Lo que más funciona es mostrar el producto **en uso** y enseñar cómo se lee
  (carta con flechas, tutorial paso a paso): L001-C02 y C10, nota 5.
- El creativo es el targeting: si la imagen no muestra tarot, atrae a otro
  público (L001-C04, C07).
- La diversidad es lo que más pide el dueño: conceptos y formatos nuevos
  (memes, avatares), no variaciones de lo mismo (L001-C09, L003-C06/C07/C10).
- El anuncio debe decir de qué trata en 2 segundos: el titular que no nombra
  el kit/tarot baja la nota aunque el concepto guste (L001-C03, L002-C01, L003-C09).
- Del kit se vende el manual y las cartas con significado; el tapete y el
  collar son apoyo, nunca el héroe (L002-C06, L003-C10). El collar es una
  carta de tarot colgante, sin tarjeta de significado (L002-C07).
- Funcionan 4–5: oferta, flechas, tutorial, unboxing, pesadilla con cartas.
  Flojos (3): flat lay, humor, ficha, infografía. No gusta: UGC, ellos vs nosotros.

## Lo que dice Meta (cuenta 1230044722526886, campaña "Interacciones WSP ABO 7/16")
Resultado = conversación de WhatsApp iniciada, NO venta. Cruzar con ventas del CRM antes de decidir escalas grandes. Cada anuncio va en su propio ad set (ABO), así que se comparan limpio.
- Referencia de costo: S/0.98–1.16 por conversación en los anuncios con 7 días de data. Los 5 "gemini" (lanzados 05–06/10) van a S/2.40 promedio hoy, con 3–6 conversaciones cada uno: muestra chica, no apagar solo por hoy.
- Ganador claro: carta explicada con flechas ("Aprende a leer las cartas con el mejor mazo de Tarot", beige): S/1.09 en 7 días, 123 conversaciones, 43 % de los clics se vuelven chat. Segundo: la misma idea en "Lee la Emperatriz sin haber estudiado nada": S/1.48 hoy, el mejor de los gemini.
- El video/infografía de keywords tiene el mejor costo en 7 días (S/0.98, CTR 4.4 %).
- Tutorial de tres cartas (3.71) y oferta "Todo el tarot en una caja" (2.78) sacaron 5 del dueño pero convierten peor en Meta por ahora.
- Público (7 días, conversaciones): más barato hombres de 35 a 65+ (S/0.81–1.04) y mujeres de 35–44 (1.15); más caro mujeres 65+ (2.02). Las mujeres son 56 % del gasto. Falta cruzar con ventas por edad/sexo antes de recortar.
- Titulares de Meta: los 5 gemini usan el mismo ("INCLUYE TAROT, MANUAL, TAPETE Y AMULETO ✅", en mayúsculas y con emoji) y uno salió sin texto principal; así no se puede probar titulares. Cada anuncio debe llevar los suyos (copy-meta.md).
- Errores vistos en los anuncios corriendo: comillas « » dibujadas en la imagen (L002-C02, L003-C03), texto ilegible en la carta del tutorial y en el manual de "Todo el tarot", CTA "Pide el tuyo por WhatsApp" repetido, y "Envío gratis por promoción de lanzamiento" (promoción que no está en negocio.md).

## Bitácora de aprendizajes (lo más nuevo arriba)
Formato: AAAA-MM-DD · lote · aprendizaje (con notas o números).
- 2026-10-06 · Meta (testeo del día) · Flechas sobre la carta ganan también en costo real (S/1.09–1.48); tutorial y oferta rinden menos que su nota; muestra chica, revisar mañana. Hombres 35+ son los más baratos.
- 2026-10-06 · L003 · Unboxing, pesadilla con cartas y tutorial 4/5; flat lay 3; no UGC; "iteraciones ya no, conceptos nuevos sí"; collar no es héroe; pide avatares y memes. Nota de prensa: formato bien, titular mal.
- 2026-10-06 · L002 · Flechas sobre la carta 5 (sin comillas); oferta 4 (doble franja blanca y titular sin producto); humor, ficha e infografía 3; C04/C05 no se veían (kit_etiquetado); el collar no trae tarjeta, es una carta de tarot; mostrar manual y cartas con significado, no el tapete.
- 2026-10-06 · L001 · Ganan "producto en uso" y "enseñar a leer" (5/5); pierden imágenes genéricas sin tarot (1–2/5) y repetir la misma foto del kit (1/5).
