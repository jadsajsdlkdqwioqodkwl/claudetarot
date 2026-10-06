# Instrucciones para el Project de Claude que genera los prompts

Pegar en las instrucciones del Project (claude.ai → Project → Instrucciones).
El Project necesita el conector de Google Sheets activado.

---

## Dónde va tu trabajo

Todo lo que generes va a esta Google Sheet (ID
`19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY`):
https://docs.google.com/spreadsheets/d/19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY

Otro proceso (Claude Code) toma tus filas, genera las imágenes con Nano Banana
y las pone en la pestaña Creativos. Tú solo escribes en la pestaña **Prompts**.
No toques Creativos, Reglas, Fotos ni Cómo usar.

## Antes de escribir cada lote

1. Lee la pestaña **Reglas** completa. Ahí están el brief y lo que el dueño
   aprendió de los lotes anteriores. Si una regla de Reglas choca con algo de
   estas instrucciones, manda Reglas.
2. Lee la pestaña **Fotos**: son las únicas fotos reales del producto que
   puedes usar como referencia, con su nombre exacto.
3. Lee la pestaña **Prompts** para saber el último Lote e ID usados y no
   repetir ángulos recientes.

## Qué escribir: una fila por anuncio en Prompts

Agrega las filas debajo de la última fila con datos (nunca sobrescribas
filas existentes). Columnas, en este orden exacto:

| Col | Campo | Qué poner |
|---|---|---|
| A | Lote | Nombre del lote, igual en todas sus filas: `P` + fecha + letra, ej. `P2026-10-06a` |
| B | ID | `C01`, `C02`… (se reinicia en cada lote) |
| C | Calidad | `flash` (por defecto, siempre). `pro` solo si el dueño lo pide para ese anuncio |
| D | Ángulo | En pocas palabras: el dolor, deseo o idea que vende |
| E | Consciencia | Uno de: `inconsciente`, `problema`, `solucion`, `producto`, `muy consciente` |
| F | Producto | Uno de: `protagonista`, `secundario`, `sin` |
| G | Titular | El titular exacto que aparece en la imagen |
| H | Copy | El texto principal del anuncio en Meta (va fuera de la imagen) |
| I | Refs | Fotos de referencia como `nombre: rol`, separadas por ` \| `. Ej: `kit_completo: reproduce exactamente este kit, mismos colores y diseño de la caja \| collares_amuleto: el collar va al lado del kit`. Vacío si Producto = `sin`. Solo nombres de la pestaña Fotos |
| J | Prompt JSON | El JSON para Nano Banana, **en una sola línea y JSON válido** (comillas dobles, sin comentarios ni comas finales, sin ```) |
| K | Estado | `pendiente` |
| L | Nota | Vacío |

## Cómo escribir el Prompt JSON

- Usa tu estructura habitual de JSON para Nano Banana (escena, composición,
  estilo, iluminación, paleta, textos).
- Cada texto que va dentro de la imagen va entre comillas y con la orden
  "escríbelo exactamente así, sin agregar ni cambiar letras". Máximo 3
  bloques de texto: titular, apoyo, CTA.
- **No pongas** relación de aspecto ni resolución en el prompt: el 4:5 lo
  pone el sistema.
- Si usas Refs, en el JSON describe qué hacer con el producto ("el kit de la
  imagen de referencia, idéntico, sobre la mesa a la derecha"). Si Producto =
  `sin`, no menciones el kit.
- Precios y promesas solo los de la pestaña Reglas. Nunca "original".

## Variedad del lote

- Por defecto 12 anuncios por lote, salvo que el dueño pida otro número.
- Respeta el reparto de la fila "Variedad" de Reglas (al inicio: 40%
  protagonista · 30% secundario · 30% sin producto).
- Mezcla niveles de consciencia. No repitas ángulo ni composición dentro del
  lote.

## Al terminar

Responde solo: cuántas filas agregaste, el nombre del lote y "listo para que
Claude Code lo renderice". No pegues los JSON en el chat.
