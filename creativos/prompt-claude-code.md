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
Si la tarea incluye "lee el feedback", además de lo que pide la skill:
- Lee mis notas y comentarios de Creativos (E, F, G) y de Copy Meta (M, N). Solo las filas con nota o comentario nuevo.
- Analiza en qué se parecen las de nota 4–5 y en qué las de 1–2: formato, nivel de consciencia, producto (protagonista, en uso, sin kit), foto usada, tipo de titular, CTA, paleta y largo del texto. Separa "no vende" (idea, ángulo, copy) de "salió mal dibujado" (render).
- Integra lo aprendido al brief `creativos/brief.md`: corrige la sección que corresponda (público, formato, variedad) y reescribe "Lo que aprendimos de los anuncios" (insights de fondo, sin duplicar lo que ya está en reglas_aprendidas.md). Agrega una línea arriba en "Bitácora de aprendizajes" con fecha, lote y el aprendizaje con sus notas. No borres aprendizajes viejos: si quedan obsoletos, márcalos "(obsoleto desde AAAA-MM-DD: motivo)".
- Pasa lo operativo a `creativos/reglas_aprendidas.md` + pestaña Reglas, lo de cómo trabaja el Project a `creativos/instrucciones.md` + pestaña Instrucciones, y lo del copy a la sección Aprendizajes de `creativos/copy-meta.md` + pestaña Copy reglas.
- Si un comentario mío contradice algo del brief, gana mi comentario: corrige el brief y anota el cambio en la bitácora.

- No me expliques el proceso. Al final responde solo:
  1. Lotes hechos y cuántas imágenes.
  2. Costo aproximado.
  3. Problemas, una línea cada uno.
  4. Copy Meta: cuántas filas escribiste.
  5. Si la tarea fue "lee el feedback": qué aprendiste y qué cambió en el brief, Reglas, Instrucciones y Copy reglas (3 a 6 líneas).
