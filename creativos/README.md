# Creativos (anuncios estáticos con Nano Banana)

Ciclo: **el Project escribe prompts en la hoja (Prompts) → Claude Code los
renderiza en Flash (Creativos) → nota y comentario → Claude reescribe las
reglas (Reglas) → las marcadas pasan a Pro → siguiente lote**.
Instrucciones del Project: viven en la pestaña **Instrucciones** (copia en
`creativos/instrucciones.md`); en claude.ai solo va el arranque de
`creativos/prompt-project.md`. Memoria de lo probado: pestaña **Ángulos**.
Todo corre en Claude Code en la nube (skill `creativos`).

Hoja de feedback: https://docs.google.com/spreadsheets/d/19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY

```
creativos/
  brief.md               reglas fijas (producto, público, formato, variedad)
  reglas_aprendidas.md   lo que dijo el feedback; Claude lo reescribe cada lote
  refs/                  fotos reales del kit + refs.json (qué es cada una)
  instrucciones.md       copia de la pestaña Instrucciones (lo que sigue el Project de conceptos)
  prompt-project.md      arranque corto para pegar en el Project de conceptos
  copy-meta.md           reglas del copy y titular de Meta (Claude Code las sigue tras cada render)
  prompt-claude-code.md  prompt maestro para una sesión nueva de Claude Code
  lotes/
    L001/
      lote.json          conceptos: ángulo, titular, copy, refs, prompt JSON
      render.json        qué modelo hizo cada imagen (o el error)
      img/C01.flash.jpg  original 2K de Gemini (…y C01.pro.jpg si pasó a Pro)
      final/C01.flash.png  1080×1350 PNG para Meta: va a la hoja y es la que se sube
      feedback.json      notas y comentarios bajados de la hoja
      pro.json           IDs que se pasan a Pro
scripts/creativos/
  render.mjs             llama a la API de Gemini y guarda las imágenes
  desde-hoja.mjs         filas pendientes de Prompts → lote.json
  final.mjs              versión 1080×1350 PNG para Meta (render.mjs la llama sola)
  filas.mjs              arma las filas de Creativos y Ángulos (=IMAGE al commit en GitHub)
```

Modelos: Flash `gemini-3.1-flash-image` (2K, ~US$0.10) y Pro
`gemini-3-pro-image` (2K, ~US$0.134). Se cambian con las variables
`MODELO_FLASH` / `MODELO_PRO`. Clave: `GEMINI_API_KEY` en el entorno.

Descarga: abre la imagen de la columna C (o el archivo de la columna N en
GitHub); la de `final/` ya es 1080×1350 PNG.
