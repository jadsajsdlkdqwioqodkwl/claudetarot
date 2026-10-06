# Reglas aprendidas del feedback

Claude Code reescribe este archivo después de cada lote calificado (destila,
no acumula) y lo copia a la pestaña **Reglas**. Manda sobre `instrucciones.md`
y `brief.md` si chocan. Cada regla dice de qué lote salió.

## Haz más de esto
- Carta explicada con flechas que muestran qué trae cada carta (L001-C02, 5).
- Tutorial paso a paso con la carta en la mano y pasos numerados (L001-C10, 5): "a esto me refiero con diversidad creativa".
- Oferta clara con el kit integrado en una escena colorida y titular "todo en una caja" (L001-C01, 5), cambiando el CTA.
- CTA de compra creativo y distinto en cada anuncio (L001-C02, C10).
- Formato retro/pixel: gustó el estilo (L001-C08), repetir con otra imagen y sin errores de recorte.

## Evita
- "Pide el tuyo por WhatsApp" y CTAs flojos o repetidos (L001-C01, C03).
- Imágenes que no muestran tarot: cabezas con preguntas, focos, sofás, personas sin cartas (L001-C03, C04, C07). El creativo es el targeting.
- El formato "nosotros vs. ellos" / comparación lado a lado (L001-C06).
- Repetir la misma foto del kit en varios anuncios: kit_completo salió en 6 de 10 y el dueño lo vio como "otra iteración" (L001-C05, C08, C09).
- Repetir textos de apoyo entre anuncios (L001-C05).
- Paletas apagadas o verdes oscuros (L001-C05).

## Errores de render
- Manual superpuesto o desvanecido al pegar la foto completa del kit (L001-C05, C06): integrar las piezas en la escena, con la misma luz, y pedir "sin piezas transparentes, desvanecidas ni superpuestas".
- Fondo mal recortado alrededor del producto (L001-C08): pedir "sin bordes recortados ni halos".
- No usar la foto kit_etiquetado: Gemini la pega con sus etiquetas y flechas, desvanecida o tapando el texto (L002-C04, C05, L003-C08).
- No poner comillas « » ni tipográficas dentro de los textos del JSON: Gemini las dibuja (casi todo L002 y L003).

## Reparto de variedad vigente
40 % producto protagonista (cada foto máx. 2 por lote, kit_completo máx. 1) · 40 % producto en uso (manos, tirada, carta explicada, manual abierto) · 20 % escena de tarot sin el kit (pero con cartas). Ningún formato repetido dentro del lote.

## Ganadores (nota 5)
- L001-C02 "Lee la Emperatriz sin haber estudiado nada" (características con flechas).
- L001-C10 "Tu primera tirada de tres cartas, paso a paso" (tutorial).
- L001-C01 "Todo el tarot que necesitas, en una caja" (oferta; cambiar CTA).
