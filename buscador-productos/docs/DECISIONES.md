# Decisiones y cambios (con el texto anterior, para poder revertir)

Fuente de cada decisión: el dueño pidió el 2026-10-15 «aplica todo… resuelve por mí… sistema que mi agente pueda trabajar solo, sin segundas preguntas, con logs, nunca descartando, ahorrando tokens». Las decisiones que antes esperaban al dueño (M-017, M-028) las resolvió el administrador con ese mandato.

## D-001 — FILTRA en modo tandas (M-056, resuelve M-017)

- **Problema:** FILTRA tenía propuesta de tope por chat (M-017), que choca con la regla «sin tope» del dueño. Cada producto cuesta 25-30 llamadas de Meta MCP y el chat se llena con 1 o 2.
- **Decisión:** sin tope; FILTRA reparte la lista (`Config B97/B98`) en tandas de 4 productos y lanza hasta 3 subagentes a la vez. Cada subagente hace Fase A y Fase B y lee solo `Recetas!D37`. El principal escribe Chequeo Meta y Excluidos en lote y suma créditos contra `Config B28`.
- **Descartado:** limitar las frases de problema a `limit 10` (contaría mal AS, umbral B39 = 20 tiendas).
- **Dónde:** INSTR 06 §4.2 y §4.3 (v3.29), `Recetas` fila 37.
- **Texto anterior (§4.2, título):** «…(todos los aprobados, en este chat, sin subagentes)».
- **Texto anterior (§4.3, primera frase):** «Si tienes una herramienta de subagentes (Agent o Task), valida cada producto con uno propio, hasta 5 a la vez.»
- **Riesgo / cómo medir:** sin probar. Si 3 subagentes escriben a la vez y chocan, bajar a 1 (como ALIBABA).

## D-002 — Retomar parciales sin repetir rondas (M-028)

- **Problema:** productos «parcial» (validación cortada) volvían a FILTRA y repetían rondas ya contadas (~250 créditos en 13 productos).
- **Decisión:** la Fase A (Meta MCP, gratis) siempre re-mide y la medida de hoy manda sobre una fila vieja de Excluidos; y al retomar un «Pendiente validación» se lee antes su fila en Chequeo Meta (columna B = ID) para no repetir rondas ni keywords.
- **Texto anterior (§4):** «(validación estimada o cortada antes de tiempo; retómala)».

## D-003 — Scripts de ALIBABA en `Recetas!E30` (M-051)

- **Texto anterior en INSTR 06 §5:** «Recetas!F30», «léelos de la columna F», «y F30 (scripts)». Ahora E30 / columna E (la F es una nota de prueba).
- **Recetas C36 antes:** «…esta celda y F30…». D36 ya decía E30.

## D-004 — Peso y tamaño del producto, no de la caja (M-052)

- **INSTR 06 §5.3, fila O, antes:** «…estímalo del producto (ml ≈ g, más el envase)». Ahora termina con «Antes de escribir O, relee el valor: si salió de la caja del proveedor, no lo dejes».
- **`Recetas!D36`:** paso 6 agrega la regla de la caja (estimar del producto y marcar «(estimado)»).

## D-005 — Foto U en BUSCA AÉREO (M-055)

- **INSTR 06 §2.6, fila U, antes:** «…(receta de la fila 27)». Ahora agrega: «En BUSCA AÉREO escribe U = pageData.data[].image (im.pipiads.com) de cada producto; si viene vacío, escribe s/d y avísalo en la entrega».

## D-006 — Nota de cierre en Sesiones (M-058)

- **INSTR 00 §6 paso 3, antes:** terminaba en «…nunca en la fila de otra sesión ni en Sesiones I:N.» Ahora agrega la obligación de completar H (Notas) al cerrar, incluso si el chat se corta.

## D-007 — Lo que no se hizo, y por qué

- **Citar recetas por nombre en vez de por número:** se mantiene la decisión de M-022 (más cambio y más riesgo). En su lugar: las recetas nuevas van al final y `MAPA.md` lista las filas clave.
- **Prefiltro de marcas en BUSCA (M-057):** queda en Propuesta; hacerlo bien exige leer Crudo H y S y probar títulos, para no introducir falsos negativos.
- **Numeración de INSTR 00 §2:** cosmético, exige editar la estructura del documento.
- **Crear un repo propio:** la integración de GitHub de esta sesión no tiene permiso para crear repos (403) y solo ve `claudetarot`. La carpeta es autocontenida para moverla después.

## Versiones resultantes

INSTR 00 v4.17 -> **v4.18** · INSTR 06 v3.28 -> **v3.29** · Recetas: C36 y D36 corregidas, fila 37 nueva · Mejoras: M-017, M-028, M-051, M-052, M-055 pasaron a Aplicada; M-056 y M-058 Aplicadas; M-057 Propuesta · Sesiones: fila 863 (`2026-10-15-q MEJORA`).

## D-008 — Fila libre del Log BUSCA (M-061), 2026-10-15

- **Incidente:** la sesión `2026-10-15-t BUSCA AÉREO` escribió sobre `Log BUSCA!A3:R3` y pisó el registro BR · automotriz del 2026-10-12.
- **Reparación:** se movió la carga de `-t` a la fila 314 (A:R) y se reescribió la fila 3 con los valores leídos antes del incidente (BR, automotriz, 605196, 8a80, 1000, 10, 2026-04-15..2026-09-12, 23 resultados, 23 créditos, «Completa (2026-10-12)»). Las fórmulas S:W recalcularon igual que antes (10 filas nuevas, 2 productos, 2,3 créditos por fila).
- **Causa y cambio:** INSTR 06 decía «primera fila vacía» sin forma de verla. Ahora `Config!B103` la calcula (como B101 para Sesiones) y INSTR 06 v3.30 y `Recetas!D31` paso 7 la exigen, con lectura previa de A de esa fila.
- **Texto anterior (INSTR 06):** «Escribe 'Log BUSCA'!A:R en la primera fila vacía con update_values.»
- **No se tocó** `Sesiones!H866` (nota de la sesión `-t`): cada sesión escribe solo en su fila.
