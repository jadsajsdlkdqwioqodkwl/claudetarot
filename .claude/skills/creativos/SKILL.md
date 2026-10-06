---
name: creativos
description: Ciclo de anuncios estáticos de Tarot Store con Nano Banana (API de Gemini) y feedback del dueño en Google Sheets. Úsala cuando el dueño pida "renderiza", "lote nuevo", "genera anuncios/creativos/imágenes", "lee el feedback", "pasa a Pro" o cambie las reglas de los anuncios.
---

# Creativos: Prompts → imágenes → feedback → Reglas

Todo vive en `creativos/` (ver `creativos/README.md`). Hoja:
`19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY` (conector de Google Sheets).

| Pestaña | Quién escribe | Columnas |
|---|---|---|
| **Prompts** | el Project del dueño (o tú con "lote nuevo") | A Lote · B ID · C Calidad (flash/pro, vacío = flash) · D Ángulo · E Consciencia · F Producto · G Titular · H Copy · I Refs (`foto: rol \| foto: rol`) · J Prompt JSON · K Estado (pendiente/hecho/error) · L Nota |
| **Creativos** | tú (`filas.mjs`) + el dueño (E, F, G) | A Lote · B ID · C Imagen · D Calidad · E Nota 1-5 · F Comentario · G ¿A Pro? · H Ángulo · I Consciencia · J Producto · K Titular · L Copy · M Refs · N Archivo |
| **Reglas** | tú, tras cada feedback | A Sección · B Regla (espejo de brief + reglas_aprendidas) |
| **Fotos** | tú, cuando cambian las refs | A Nombre · B Imagen · C Para qué sirve (de refs.json) |

Comandos (siempre con `NODE_USE_ENV_PROXY=1` para que fetch use el proxy):

## "Renderiza" (default: Flash)

1. `get_values` de `Prompts!A1:L` → guárdalo en el scratchpad como JSON.
2. Siguiente número de lote libre en `creativos/lotes/` (L001, L002…):
   `node scripts/creativos/desde-hoja.mjs <json> creativos/lotes/Lnnn`.
   Escribe `lote.json` (y `pro.json` si alguna fila pidió pro) e imprime las
   filas tomadas y avisos.
3. `npm run creativos:render -- creativos/lotes/Lnnn` (Flash a todo). Si
   hay `pro.json`, también `… --pro`. Falla por política/texto → ajusta ese
   prompt en lote.json y `--solo Cxx`.
4. Mira las imágenes (Read). Texto roto o producto deformado → corrige el
   prompt y re-renderiza antes de mostrarla.
5. Commit + push a `main` (solo `creativos/`; nada de `src/` ni `public/`).
   Las imágenes tienen que estar en GitHub para `=IMAGE`.
6. `node scripts/creativos/filas.mjs creativos/lotes/Lnnn` (y `--pro` si
   corrió) → agrega las filas debajo de la última de Creativos.
7. En Prompts, columna K de las filas tomadas → `hecho` (o `error` + motivo
   en L).
8. Responde: link de la hoja, cuántas, costo.

## "Lote nuevo" (tú escribes los prompts)

Lee `creativos/brief.md`, `creativos/reglas_aprendidas.md`, `refs/refs.json`,
`docs/negocio.md` y los ganadores; usa la skill `static-ad-json` para cada
prompt. Escribe las filas en Prompts (Estado `pendiente`) y sigue con
"Renderiza". Por defecto 12 conceptos, reparto de variedad vigente.

## "Lee el feedback"

1. Lee Creativos. Guarda por lote `creativos/lotes/Lnnn/feedback.json`
   (`{"C01": {"nota": 4, "comentario": "…", "pro": true}}`).
2. **Reescribe** `creativos/reglas_aprendidas.md` destilando TODO el feedback
   acumulado (todos los feedback.json): qué saca 4–5, qué saca 1–2, errores de
   render, reparto de variedad, ganadores. Reglas cortas con lote de origen.
   Separa "no vende" (concepto/copy) de "salió mal dibujado" (render).
3. Copia lo mismo a la pestaña **Reglas** (borra y reescribe desde A2): las
   filas Brief de `brief.md` + Haz más / Evita / Errores de render / Variedad /
   Ganadores. Es lo que lee el Project.
4. Marcados ¿A Pro? sin versión pro: `pro.json`, `render … --pro`, revisa,
   push, `filas.mjs … --pro` → filas nuevas en Creativos.
5. Commit + push a main. Responde en 3–5 líneas qué cambió en las reglas.

## Reglas
- `GEMINI_API_KEY` es variable del entorno. Nunca la pidas en el chat.
- No borres filas de Creativos ni lotes viejos: son el historial que aprende.
- Precios y promesas solo de `docs/negocio.md`. Nunca "original".
- Esto no toca el CRM: no edites `src/`, `public/`, `migrations/` ni
  `wrangler.jsonc` desde este flujo.
