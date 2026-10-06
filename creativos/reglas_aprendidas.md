# Reglas aprendidas del feedback

Claude Code reescribe este archivo después de cada lote calificado (destila,
no acumula) y lo copia a la pestaña **Reglas**. Manda sobre `instrucciones.md`
y `brief.md` si chocan. Cada regla dice de qué lote salió.
Feedback acumulado: L001 (10 filas), L002 (10), L003 (10).

## Haz más de esto (lo que sacó 4–5)
- Carta explicada con flechas que muestran qué trae cada carta (L001-C02, 5; L002-C02, 5 "perfecto").
- Tutorial paso a paso con la carta en la mano y pasos numerados (L001-C10, 5; L003-C04, 4).
- Oferta clara con el kit en una escena colorida (L001-C01, 5; L002-C01, 4), cambiando el CTA.
- Unboxing: lo que encuentras al abrir la caja (L003-C01, 4).
- Pesadilla "tienes las cartas y no sabes qué hacer", con cartas reales a la vista (L003-C03, 4).
- Mostrar más de lo que viene en el kit: el manual y las cartas con sus significados, no solo el tapete (L002-C06).
- Formato retro/pixel: gustó el estilo (L001-C08); repetir con otra imagen y sin errores de recorte.
- Formato nota de prensa: "interesante formato" (L003-C09), pero con mejor titular.
- Más diversidad real de conceptos y formatos: memes, avatares/personajes ilustrados (L003-C10).
- CTA de compra creativo y distinto en cada anuncio (L001-C02, C10).

## Evita (no vende)
- "Pide el tuyo por WhatsApp" y CTAs flojos o repetidos (L001-C01, C03; L002-C01).
- Imágenes que no muestran tarot: cabezas con preguntas, focos, sofás, personas sin cartas (L001-C03, C04, C07). El creativo es el targeting.
- Titular que no dice de qué trata el producto (L001-C03, L002-C01, L003-C09): en 2 segundos se entiende que es un kit de tarot.
- Doble franja de texto blanco: no da ganas de leerlo (L002-C01). Una sola zona de texto, con contraste.
- Formato "nosotros vs. ellos" / comparación lado a lado (L001-C06).
- UGC (L003-C05).
- Collar amuleto como protagonista (L003-C10). Y no decir que trae "tarjeta de significado": el collar es una carta de tarot colgante (L002-C07).
- Iteraciones: "iteraciones ya no, conceptos nuevos sí" (L003-C06, C07; L001-C09). Antes de proponer, comparar contra Ángulos (formato, ángulo, foto, titular) y no repetir.
- Repetir textos de apoyo entre anuncios (L001-C05).
- Paletas apagadas o verdes oscuros (L001-C05).
- Comillas dentro de los textos de la imagen (L002-C02, C03): no las quiere.
- Resaltar el tapete floral: el protagonismo va al manual y a las cartas con significado (L002-C06).

## Errores de render (salió mal dibujado)
- Anuncios que "no se ven" (L002-C04, C05): la foto kit_etiquetado se pega mal. No usarla (también L003-C08).
- Manual superpuesto o desvanecido al pegar la foto completa del kit (L001-C05, C06): integrar las piezas en la escena, con la misma luz, y pedir "sin piezas transparentes, desvanecidas ni superpuestas".
- Fondo mal recortado alrededor del producto (L001-C08): pedir "sin bordes recortados ni halos".
- No poner comillas « » ni tipográficas dentro de los textos del JSON: Gemini las dibuja (L002, L003).
- Objetos o textos duplicados (dos manuales, dos cajas, el mismo texto dos veces) y piezas "pegadas" como collage (L002-C04, L003-C08). Desde 2026-10-06 cada prompt lleva al final las REGLAS_RENDER de `scripts/creativos/render.mjs`: escena única, piezas sólidas con sombra, sin recortes ni halos, cada objeto y texto una sola vez.

## Reparto de variedad vigente
40 % producto protagonista (cada foto máx. 2 por lote, kit_completo máx. 1) · 40 % producto en uso (manos, tirada, carta explicada, manual abierto) · 20 % escena de tarot sin el kit (pero con cartas). Ningún formato repetido dentro del lote. Al menos 3 de 10 en formatos que nunca se han probado (meme, avatar/personaje ilustrado, etc.), y ninguno que repita un formato de Ángulos con nota 3 o menos sin una variación clara.

## Ganadores (nota 5)
- L001-C02 "Lee la Emperatriz sin haber estudiado nada" (características con flechas).
- L001-C10 "Tu primera tirada de tres cartas, paso a paso" (tutorial).
- L001-C01 "Todo el tarot que necesitas, en una caja" (oferta; cambiar CTA).
- L002-C02 "Chakra, planeta, signo y respuesta: todo en una sola carta" (flechas, sin comillas).
