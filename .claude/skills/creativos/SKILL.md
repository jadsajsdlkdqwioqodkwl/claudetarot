---
name: creativos
description: Anuncios estáticos de Tarot Store con Nano Banana (API de Gemini) y feedback del dueño en Google Sheets. Dos flujos: CREA (genera las imágenes de los prompts que aún no se hicieron) y REVISA COMENTARIOS (lleva las notas del dueño a las reglas y al brief). Úsala cuando el dueño diga "crea", "renderiza", "genera anuncios/imágenes", "revisa comentarios" o "lee el feedback".
---

# Creativos: CREA y REVISA COMENTARIOS

Hoja `19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY` (conector de Google
Sheets). Antes de mover o renombrar algo, `docs/MAPA.md`.

| Pestaña | Quién escribe | Columnas |
|---|---|---|
| **Prompts** | el Project de conceptos | A Lote · B ID · C Ángulo · D Consciencia · E Producto · F Titular · G Copy · H Refs (`foto: rol \| foto: rol`) · I Prompt JSON · J Estado (pendiente / hecho / error / pausado) · K Nota · L Avatar · M Titular (novedoso) |
| **Creativos** | tú (`filas.mjs`) + el dueño (D, E) | A Lote · B ID · C Imagen · D Nota 1-5 · E Comentario · F Ángulo · G Consciencia · H Producto · I Titular · J Copy · K Refs · L Archivo · M Avatar |
| **Copy Meta** | tú + el dueño (M, N) | A Lote · B ID · C Imagen · D Lo que dice la imagen · E Consciencia · F Texto principal · G–I Titular 1–3 · J Descripción · K Botón · L Estado · M Nota · N Comentario |
| **Ángulos** | tú | A Lote · B ID · C Formato · D Ángulo · E Consciencia · F Producto · G Titular · H Refs · I Nota · J Comentario · K Estado (ganador / variar: … / descartado: …) · L Avatar · M Titular (novedoso) |
| **Formatos** | tú + el Project | biblioteca de formatos por familia: A Familia · B Formato (nombre exacto para Prompts K) · C Cómo se ve · D Avatares que le van · E Usos y F Nota prom. (fórmulas) · G Estado (gana / probar / variar / prohibido) |
| **Avatares** | tú + Routine de voz del cliente | razones de compra (A1, A2…) × 5 niveles de consciencia, con Cobertura por fórmulas. Lógica en `creativos/avatares.md` |
| **Instrucciones** · **Reglas** · **Copy reglas** | tú | espejo de `creativos/instrucciones.md`, `reglas_aprendidas.md`, `copy-meta.md` (A Sección · B Texto) |
| **Voz del cliente** · **Fotos** · **Memoria** | Routine diaria · tú · Project | ver `docs/MAPA.md` |

Comandos con `NODE_USE_ENV_PROXY=1` (fetch por el proxy).

## CREA

Genera todo lo pendiente. Un JSON ya usado no se vuelve a crear: queda
"hecho" en Prompts (col. J) y su lote tiene carpeta en `creativos/lotes/`
(`desde-hoja.mjs` salta esos lotes aunque la hoja no esté marcada).

1. `get_values` de `Prompts!A1:M` → guárdalo en el scratchpad (no lo leas entero).
2. Repite mientras haya pendientes:
   a. `node scripts/creativos/desde-hoja.mjs <json> creativos/lotes/Lnnn`
      (Lnnn = siguiente libre). Toma el primer lote pendiente. Si imprime
      avisos (foto prohibida o repetida, comillas, WhatsApp, avatar faltante
      o poco variado…), corrige ese prompt en `lote.json` antes de renderizar
      (si falta el avatar, asígnalo según `creativos/avatares.md` y escríbelo
      también en Prompts col. L).
   b. `npm run creativos:render -- creativos/lotes/Lnnn`: Flash 2K + versión
      final 1080×1350 PNG en `final/`. Cada prompt lleva al final las
      REGLAS_RENDER de `render.mjs` (sin recortes, sin duplicados, sin
      collage). Error 402 = sin créditos: avisa al dueño y para.
   c. Revisa en hojas de contacto de 5 (`montage`). Si una salió rota (fondo
      mal recortado, pieza pegada o transparente, objeto o texto duplicado,
      texto cortado, comillas), corrige su prompt y `--solo Cxx`, una sola
      vez. Si sigue mal, anótalo en Ángulos (K: "error de render: …").
3. Commit + push a `main` (solo `creativos/`). Las imágenes tienen que estar
   en `main` para que `=IMAGE` las muestre.
4. Por cada lote nuevo:
   - `node scripts/creativos/filas.mjs creativos/lotes/Lnnn` → filas debajo
     de la última de **Creativos**. Si creaste varios lotes, junta sus filas y
     ordénalas por avatar (A1, A2…) antes de escribirlas: el dueño revisa por
     avatar. Copy Meta y Ángulos van en el mismo orden.
   - `node scripts/creativos/filas.mjs creativos/lotes/Lnnn --angulos` →
     filas en **Ángulos**.
   - **Copy Meta**: una fila por imagen siguiendo `creativos/copy-meta.md`
     (mira la imagen y los "textos" del prompt; C = la misma fórmula
     `=IMAGE` de Creativos). El titular y la primera oración son lo más cuidado.
   - En Prompts, col. J de sus filas → `hecho` (o `error` + motivo en K).
5. Responde: lotes, cuántas imágenes, costo, problemas en una línea cada uno.

Retoque de una imagen ya hecha (ej. el dueño pide solo cambiar el CTA): pon
en su concepto de `lote.json` el campo `"editar": "Cambia solo …"` y corre
`npm run creativos:render -- creativos/lotes/Lnnn --solo Cxx --editar`.
Después actualiza la fórmula =IMAGE de esa fila en Creativos y Copy Meta.

## REVISA COMENTARIOS

Lleva las notas y comentarios del dueño (Creativos D–E y Copy Meta M–N) a
las reglas y al brief. Solo filas con nota o comentario nuevo.

1. Guarda por lote `creativos/lotes/Lnnn/feedback.json`
   (`{"C01": {"nota": 4, "comentario": "…"}}`).
2. Analiza en qué se parecen las de 4–5 y las de 1–2 (avatar, formato,
   consciencia, producto, foto, titular, CTA, paleta, largo). Separa "no vende" de "salió
   mal dibujado".
3. Escribe lo aprendido:
   - `creativos/reglas_aprendidas.md` (destila todo el feedback acumulado) →
     reescribe la pestaña **Reglas** desde A2.
   - Errores de render nuevos → también a `REGLAS_RENDER` de
     `scripts/creativos/render.mjs` (para que no se repitan en ningún prompt).
   - **Ángulos**: Nota, Comentario y Estado de cada fila calificada.
   - **Formatos** col. G: "gana" (prom. 4+), "variar: …" o pásalo a la familia "No usar" (prom. ≤2 o el dueño dice "mal formato"); copia ahí también los que el dueño rechace.
   - **Avatares** col. O: "gana" si sus anuncios promedian 4+, "no vende" si
     promedian ≤2 con 3+ anuncios, "saturado" si ya tiene muchos y los demás
     están en 0.
   - Si cambia cómo debe trabajar el Project: `creativos/instrucciones.md` →
     pestaña **Instrucciones** (una fila por `## Sección`).
   - Copy: sección "10. Aprendizajes" de `creativos/copy-meta.md` → pestaña
     **Copy reglas**.
   - **Brief**: `creativos/brief.md` ("Lo que aprendimos de los anuncios" +
     una línea arriba en "Bitácora de aprendizajes": fecha · lote ·
     aprendizaje con notas). La Routine diaria de voz del cliente pasa esa
     bitácora al Google Doc del brief (no lo edites ni lo recrees desde aquí).
   - Prompts pendientes que ya chocan con las reglas nuevas → `pausado` con
     el motivo en K.
4. Commit + push a `main`. Responde en 3–6 líneas qué aprendiste y qué cambió.

## Reglas
- `GEMINI_API_KEY` es variable del entorno. Nunca la pidas en el chat.
- No borres filas de Creativos ni lotes viejos: son el historial que aprende.
- Precios y promesas solo de `docs/negocio.md`. Nunca "original".
