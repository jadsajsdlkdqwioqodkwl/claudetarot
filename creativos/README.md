# Creativos (anuncios estáticos con Nano Banana)

Ciclo: **lote nuevo → imágenes Flash → nota y comentario en la hoja →
Claude reescribe las reglas → las marcadas pasan a Pro → siguiente lote**.
Todo corre en Claude Code en la nube (skill `creativos`).

Hoja de feedback: https://docs.google.com/spreadsheets/d/19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY

```
creativos/
  brief.md               reglas fijas (producto, público, formato, variedad)
  reglas_aprendidas.md   lo que dijo el feedback; Claude lo reescribe cada lote
  refs/                  fotos reales del kit + refs.json (qué es cada una)
  lotes/
    L001/
      lote.json          conceptos: ángulo, titular, copy, refs, prompt JSON
      render.json        qué modelo hizo cada imagen (o el error)
      img/C01.flash.png  …y C01.pro.png si pasó a Pro
      feedback.json      notas y comentarios bajados de la hoja
      pro.json           IDs que se pasan a Pro
scripts/creativos/
  render.mjs             llama a la API de Gemini y guarda las imágenes
  filas.mjs              arma las filas de la hoja (=IMAGE al commit en GitHub)
```

Modelos: Flash `gemini-3.1-flash-image-preview` (1K, ~US$0.067) y Pro
`gemini-3-pro-image-preview` (2K, ~US$0.134). Se cambian con las variables
`MODELO_FLASH` / `MODELO_PRO`. Clave: `GEMINI_API_KEY` en el entorno.
