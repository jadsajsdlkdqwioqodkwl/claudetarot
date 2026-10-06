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

## Público
- Mujeres 18–40 en Perú que quieren aprender tarot y no saben por dónde
  empezar. Filtro: el anuncio habla al **principiante** ("sin memorizar",
  "lees desde el primer día").

## Formato
- 4:5 (lo pone el script, no el prompt). Texto grande y legible en el celular;
  zona central limpia; nada importante en el 10% de los bordes.
- Colores vivos, contraste alto. Español peruano, tú.
- Titular estilo Halbert: concreto, una promesa o una curiosidad, máx. 8 palabras.
- Máximo 3 bloques de texto por imagen (titular, apoyo, CTA). Cada texto va
  entre comillas en el prompt y se pide escribirlo "exactamente así".
- CTA de compra: "Pídelo por WhatsApp", "Pide el tuyo", "Paga al recibir"…

## Variedad por lote (ajustable con el feedback)
- 40% producto protagonista (`kit_completo`, "reproduce el producto exacto").
- 30% producto secundario (enseñando el uso: `carta_explicada`,
  `mano_carta_y_guia`, `seis_cartas`; o producto pequeño en una esquina).
- 30% sin producto (`refs` vacío): escena, problema, estilo prensa, nota, meme.
- Mezclar niveles de consciencia (Schwartz): inconsciente, problema, solución,
  producto, muy consciente. No repetir ángulo ni composición dentro del lote.

## Fotos de referencia
Ver `refs/refs.json` (nombre → qué muestra y para qué sirve). Cada concepto
declara `refs: [{foto, rol}]`; el rol se le dice al modelo junto a la foto.
