---
name: creativos
description: Ciclo de anuncios estáticos de Tarot Store con Nano Banana (API de Gemini) y feedback del dueño en Google Sheets. Úsala cuando el dueño pida "lote nuevo", "genera anuncios/creativos/imágenes", "lee el feedback", "pasa a Pro" o cambie las reglas de los anuncios.
---

# Creativos: lote → imágenes → feedback → reglas

Todo vive en `creativos/` (ver `creativos/README.md`). Hoja de feedback:
`19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY`, pestaña **Creativos**
(columnas A–N: Lote | ID | Imagen | Calidad | Nota | Comentario | ¿A Pro? |
Ángulo | Consciencia | Producto | Titular | Copy | Refs | Archivo).
Se escribe con el conector de Google Sheets (`update_values`, fórmulas con
`=IMAGE(...)`).

## "Lote nuevo" (por defecto 12 conceptos, Flash)

1. Lee `creativos/brief.md`, `creativos/reglas_aprendidas.md` (manda sobre el
   brief), `creativos/refs/refs.json`, `docs/negocio.md` y los `lote.json` de
   los ganadores que liste reglas_aprendidas (son el ejemplo a superar).
2. Escribe `creativos/lotes/Lnnn/lote.json` (siguiente número):
   ```json
   {"lote": "L002", "creado": "AAAA-MM-DD", "aspecto": "4:5",
    "conceptos": [{
      "id": "C01", "angulo": "…", "consciencia": "problema",
      "producto": "protagonista|secundario|sin",
      "titular": "…", "copy": "texto del anuncio en Meta (primary text)",
      "refs": [{"foto": "kit_completo", "rol": "reproduce exactamente este kit…"}],
      "prompt": { …JSON estilo static-ad-json… }
    }]}
   ```
   - El `prompt` sigue la skill `static-ad-json` (copy dentro de la imagen
     entre comillas, "exactamente así"). No pongas el aspecto en el prompt.
   - Respeta el reparto de variedad vigente de reglas_aprendidas. `refs: []`
     en los "sin producto". Distintos ángulos y composiciones en el lote.
3. `NODE_USE_ENV_PROXY=1 node scripts/creativos/render.mjs creativos/lotes/Lnnn`
   Si alguno falla por texto/política, ajusta su prompt y re-renderiza con
   `--solo Cxx`.
4. Mira tú las imágenes (Read). Si una tiene texto roto o producto deformado,
   corrígela y re-renderiza antes de mostrarla.
5. Commit + push (las imágenes deben estar en GitHub para `=IMAGE`).
6. `node scripts/creativos/filas.mjs creativos/lotes/Lnnn` → agrega esas filas
   debajo de la última fila con datos de la hoja.
7. Responde con el link a la hoja y el costo. Nada más.

## "Lee el feedback"

1. Lee la pestaña Creativos (filas del último lote o de los no procesados).
   Guarda notas y comentarios en `creativos/lotes/Lnnn/feedback.json`
   (`{"C01": {"nota": 4, "comentario": "…", "pro": true}}`).
2. **Reescribe** `creativos/reglas_aprendidas.md` destilando TODO el feedback
   acumulado (lee los feedback.json anteriores): qué patrones sacan 4–5, qué
   sacan 1–2, errores de render, reparto de variedad nuevo, ganadores (5).
   Reglas concretas y cortas, con el lote de origen. Separa "el ángulo/copy no
   vende" (va a conceptos) de "salió mal dibujado" (va a errores de render).
3. Los marcados en ¿A Pro?: escribe `creativos/lotes/Lnnn/pro.json`
   (`["C03","C07"]`), corre `render.mjs … --pro`, revisa, commit + push y
   `filas.mjs … --pro` → filas nuevas en la hoja (Calidad = pro).
4. Commit + push. Responde en 3–5 líneas qué cambió en las reglas.

## Reglas
- La API key es `GEMINI_API_KEY` (variable del entorno). Nunca la pidas en el chat.
- No borres filas de la hoja ni lotes viejos: son el historial que aprende.
- Precios y promesas solo de `docs/negocio.md`. Nunca "original".
