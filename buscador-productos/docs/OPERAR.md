# Manual corto de operación

Resumen para operar rápido y gastar pocos tokens. **Los INSTR de Drive mandan**; esto solo dice qué leer y en qué orden. Versiones al 2026-10-15: INSTR 00 v4.18, INSTR 06 v3.29.

## 1. Elegir comando (si el dueño no escribe uno)

1. `Config!B77` (aprobados sin validar) mayor que 0 -> **FILTRA**.
2. Si no, `Config!B58` (en la cola) mayor o igual a `B57` -> **RANKEA**.
3. Si no -> **BUSCA**.

Solo se usa la versión AÉREO si el dueño la nombra.

## 2. Arranque ligero (todos los comandos)

Nada más que esto, y a trabajar:

| Qué | Dónde |
|---|---|
| ID y fila de tu sesión | `Config!B101:B102` (escribe con `update_values`, nunca `append_values`) |
| Topes y umbrales | `Config!A1:C82` y `A85:C100` (B83 y B84 son largas; B84 solo en BUSCA) |
| Tu lista de trabajo ya calculada | ALIBABA `B95`/`B96` · FILTRA `B97`/`B98` · RANKEA `B99`/`B100` |
| Qué hizo la sesión anterior | Las 3 últimas filas de `Sesiones` (columna H) |
| Solo BUSCA y RANKEA | `Excluidos!A:B` y `E:E` (solo filas con E = «Sí») |
| Solo BUSCA | `Productos!D:D`, `Sub-nichos!B:B` |
| Solo BUSCA AÉREO | `Log BUSCA`: plan de cargas y resumen (INSTR 06 §2.8, «Lee al empezar») antes de abrir PiPiAds |

Recetas: solo las filas que indica INSTR 06 para tu comando (la pestaña tiene scripts largos).

## 3. Qué leer y escribir por comando

| Comando | Documentos (solo estas secciones) | Escribe | Gasta |
|---|---|---|---|
| BUSCA / BUSCA AÉREO | INSTR 06 §1-2 (AÉREO: §2.8) · INSTR 01 Fase 1 y plan de Fase 2 | Crudo (todo, con motivo), Log BUSCA | Créditos PiPiAds (Config B66 / B91) |
| RANKEA / AÉREO | INSTR 06 §3 · INSTR 03 | Productos (A:AF, AI:AL, AS:AV), Crudo R:S | Nada (Meta MCP gratis) |
| FILTRA / AÉREO | INSTR 06 §4 · INSTR 04 | Productos (AD:AF, AI:AL, AS, AV, X, Y), Chequeo Meta, Excluidos | Firecrawl (B28 por chat, B76 por producto) |
| ALIBABA / AÉREO | INSTR 06 §5 | Productos (O, AZ:BB, BD, BE) | Chrome; Firecrawl solo respaldo (B89) |
| EXPLORA | INSTR 07 | Exploración | 150 créditos PiPiAds fijos |
| MEJORA | INSTR 06 §6 | Mejoras, INSTR, Recetas, Config | Nada |

## 4. Tandas con subagentes (el principal casi no gasta)

| Comando | Quién hace qué | Instrucciones del subagente |
|---|---|---|
| ALIBABA | Tandas de 4 filas, un subagente tras otro (comparten el Chrome) | `Recetas!D36` + `E30` (scripts) |
| FILTRA | Tandas de 4 productos, hasta 3 a la vez (Meta MCP y Firecrawl no comparten navegador) | `Recetas!D37` |
| RANKEA | Principal hace el triage; hasta 3 subagentes puntúan tandas de 8 grupos | INSTR 06 §3.2 |
| BUSCA | **Sin subagentes**: dos subagentes en PiPiAds pagarían los mismos productos dos veces | — |

Reglas de tanda: el subagente escribe solo las celdas de **sus** filas en Productos y devuelve una línea por producto; el principal escribe Chequeo Meta, Excluidos, Sesiones y Mejoras en lote y asigna los IDs.

## 5. Qué ya se buscó y qué vale la pena repetir

| Pregunta | Dónde mirar |
|---|---|
| ¿Ya leí esta combinación en PiPiAds? | `Log BUSCA` (claves en V; resumen Z:AF) y la fila de Config «BUSCA: ventanas de TikTok Shop ya usadas» |
| ¿Ya tengo este anuncio/producto? | `Crudo!E` (ID) y los IDs vistos (`Log BUSCA!X2`) |
| ¿Por qué se descartó? | `Crudo!R:S` (estado y motivo) |
| ¿Está saturado? | `Excluidos` (solo E = «Sí») |
| ¿Ya lo validé en Meta, hasta dónde? | `Chequeo Meta` (columna B = ID del producto) y `Productos!AD:AF` |
| ¿Qué probé de la plataforma? | `Exploración` (veredictos Confirmada/Parcial/Descartada/Por probar) |
| ¿Qué frenó a otras sesiones? | `Mejoras` (Propuesta/Aplicada/Rechazada) |

**Cuándo repetir una combinación de BUSCA AÉREO** (`Config B94`): con 2 o más cargas y más de 12 créditos por fila nueva, no se vuelve a pagar. Con 1 sola carga, solo si hay ventana nueva de 30 días o más. Si lo fácil se acabó, baja por la escalera de INSTR 06 §2.8 (ventas 2000, 1500, 1000; videos 20, 10-19; otro orden; subcategorías sin leer). BUSCA AÉREO nunca cierra por «pool agotado».

Al terminar una carga, lo que más pesa para decidir qué repetir es **AH (créditos por producto que llegó a Productos)**, no los créditos por fila de Crudo. Ignora AE y AH mientras AG (pendientes de RANKEA) sea mayor que 0.

## 6. Cerrar la sesión (siempre)

1. `Sesiones!A{B101}:H`: ID, fecha, comando, fuentes, y en H una línea: qué hiciste, cuánto gastaste, qué quedó pendiente.
2. Una fila en `Mejoras` por cuello de botella (con evidencia). Si ya existe en Propuesta, suma 1 en I. Aplica lo que no choque con una regla del dueño.
3. Entrega en tabla corta, fuentes que fallaron, recetas nuevas, link al Sheet.
4. Cierra con «Siguiente paso: abre un chat nuevo y escribe <comando>».
5. RANKEA y FILTRA terminan con «Tu reporte está en la pestaña Top» y los 5 primeros de Top.

## 7. Dónde corre cada comando

| Dónde | Comandos | Por qué |
|---|---|---|
| Tu computadora (Claude Code o chat con **Claude in Chrome** y tu sesión de PiPiAds/Alibaba) | BUSCA, BUSCA AÉREO, EXPLORA, ALIBABA, ALIBABA AÉREO | Necesitan el navegador con tus sesiones. Solo uno a la vez (comparten Chrome) |
| Cualquier sesión, incluida la nube | RANKEA, FILTRA, MEJORA (y sus versiones AÉREO) | Solo usan Meta MCP, Firecrawl y Google Sheets/Drive. Pueden correr en paralelo con uno de Chrome |

Si una sesión sin Chrome recibe un comando de Chrome: lo dice en una línea, **no gasta nada**, registra la sesión en `Sesiones!H` con «Sin Chrome — [fecha] — [comando]» y termina. Ver compuerta en INSTR 06 §1 y `BUSCA-AEREO-2026-10-15.md`.
