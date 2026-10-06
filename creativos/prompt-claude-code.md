# Prompt maestro para Claude Code (sesión nueva, repo claudetarot)

Pegar en una sesión nueva de Claude Code sobre el repo `claudetarot`, cambiando
solo la línea TAREA. Todo el procedimiento vive en
`.claude/skills/creativos/SKILL.md`; este prompt solo dice qué hacer y cómo
gastar poco.

---

TAREA: renderiza
(otras opciones: "lee el feedback" · "renderiza y después lee el feedback" · "pasa a Pro lo marcado")

Usa la skill `creativos` del repo y sigue su procedimiento al pie de la letra. Hoja: 19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY.

Para gastar pocos tokens:
- No explores el repo ni leas archivos que la skill no pida. No leas lote.json, render.json ni las respuestas grandes de la hoja: guárdalas en un archivo del scratchpad y pásalas a los scripts (desde-hoja.mjs, render.mjs, filas.mjs, filas.mjs --angulos).
- Lee de la hoja solo los rangos necesarios.
- Revisa las imágenes en hojas de contacto de 5 por imagen (montage), nunca una por una a tamaño completo.
- Re-renderiza solo lo que salió roto (texto cortado o deformado, producto pegado o transparente, comillas dibujadas), una sola vez por imagen. Si sigue mal, déjalo anotado en Ángulos y sigue.
- Si los créditos de Gemini se acaban (error 402), para y avísame.
- Renderiza todos los lotes pendientes de la pestaña Prompts, uno por uno (L00n siguiente libre). No toques filas "pausado".
- Commit y push a main solo de creativos/ y scripts/creativos/. No toques src/, public/, migrations/ ni wrangler.jsonc.
- No me expliques el proceso. Al final responde solo:
  1. Lotes hechos y cuántas imágenes.
  2. Costo aproximado.
  3. Problemas, una línea cada uno.
  4. Si la tarea fue "lee el feedback": qué cambió en Reglas, Instrucciones y en el doc de Copy (3 a 5 líneas).
