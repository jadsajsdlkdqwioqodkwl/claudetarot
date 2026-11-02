# MAPA — qué se conecta con qué

> **El índice vivo está en Drive:** documento «MAPA del proyecto (índice vivo)», ID `1VR4kTJhNzMZ-dYiCWPJHKMyjbMrO2yY6RvFsFcdWh8s` (lo leen los chats del Project; el repo no). Este archivo es el espejo con más historia. Si cambia la versión de un INSTR, se actualizan los dos.

Regla de esta carpeta: **en el MAPA no se quita nada, solo se agrega o se corrige.** Si algo sale del sistema, se anota que se quitó y cuándo.

## Drive

| Qué | ID |
|---|---|
| Carpeta «Buscador de Productos Ganadores Perú» | `1pm8A0Zltc1CEGW4Exg3EuKDgoAUuLyR8` |
| Sheet «Base Productos Ganadores Perú» | `1DlLjVSqA3bs26xLrXxTFXGpdSdCA8_Cwz1hY0Nzhsd0` |
| INSTR 00 Reglas generales y arranque (v4.22, 2026-11-02) | `1jZCQy6a6w2PsZTOHxee0yNjlMrrmfaYk9WzO31F3i9A` |
| INSTR 01 Workflow 1 desde el dolor (v3, legado W1) | `15nN2K-CbJ7I_DCT0ESlajkb8i2lk4rFpl9JbGdp86rU` |
| INSTR 02 Workflow 2 desde el producto (v3.1, legado W2) | `1h3qx_8NI0xa4khIEt4UJoyc7zrTotanIPmQAXaHo-88` |
| INSTR 03 Filtro, puntaje y ranking (v3.2) | `1YVz1WgkhKyDHW0mS36fI5GDHqV62sBxQ7KNXTzEStGg` |
| INSTR 04 Validación Meta, modo detective (v3.9) | `10EvbqMsHVONqQNkxBgBs3Ut99ojAOZA-gCi3J-h3plk` |
| INSTR 05 Recetas técnicas (v3.4) | `1Iwo-v-tqHJYddyq7wKRiT9xVYmun-AoD_ojtYJICmVI` |
| INSTR 06 Comandos del buscador: BUSCA AÉREO, RANKEA, FILTRA, ALIBABA, DESCUBRE y MEJORA (v4.0, 2026-11-02; antes «BUSCA, RANKEA, FILTRA y ALIBABA» v3.35, copia archivada 1JnemgdN05s1BUUZdooAMgUo3AswKYtjmYv-L0WSKU1c) | `1POkxb0Gb7OhhN_LCzab5HPi4PnLJE8AOwApetWNPpB8` |
| INSTR 07 EXPLORA (v1.9, 2026-11-02) | `1GYNtUCA8i7ZCSjh_K1pyynPxUOPmTrbrpAl9QJ4dgD0` |
| INSTR 08 INICIA AEREO (BUSCA AÉREO de punta a punta) y Laboratorio (v3.1, 2026-11-02; v1.19, v2.0 y v2.1 archivadas, la v2.1 en 15Bw73MXFz-aVbBYECre6hT00hsk0eFaiReSm9F3DJe4) | `1QCt6LLHP4mB9LCRaPNxO-1lP1LqhwNiPB4KAtjYBwbM` |

Los Drive de INSTR con título terminado en «(v…)» son copias viejas guardadas en la carpeta de versiones (ID `1HtyOttQaEvvfh07Jm-DF9altfXcuWZNM`): se ignoran. El 2026-10-16 un chat leyó INSTR 00 v4.16 e INSTR 06 v3.26 de esa carpeta por error; las vigentes son las de la tabla de arriba. Si aparece un INSTR con un número que no está aquí, se agrega a esta tabla.

## Pestañas del Sheet

| Pestaña | Visible | Rol | Quién escribe |
|---|---|---|---|
| Top, Oportunidades, Aéreo | Sí | Reportes para quien decide qué importar | Fórmulas. **Nadie escribe** |
| Revisión | Sí | Aprobación del dueño (casillas A y P) | **Solo el dueño** |
| Productos | Sí | Base de productos puntuados (fila fija por producto) | RANKEA, FILTRA, ALIBABA (cada uno sus columnas) |
| Guía | Sí | Ayuda para el dueño | Nadie |
| Config | Sí | Pesos, umbrales, topes, listas calculadas | Dueño; los chats solo B66/B91 con su autorización |
| Mejoras | Sí | Propuestas de cambio del proyecto | MEJORA y cierres de sesión |
| Crudo | Oculta | Todo lo que devuelve BUSCA, con estado y motivo | BUSCA (A:O, T:U), RANKEA (R:S) |
| Cola RANKEA | Oculta | Lo que pasa el filtro y espera puntaje | Fórmulas/RANKEA |
| Chequeo Meta | Oculta | Rondas y keywords contadas por producto | FILTRA |
| Sesiones | Oculta | Una fila por sesión (H = notas de cierre) | Cada sesión en su fila (nunca I:N) |
| Excluidos | Oculta | Productos/problemas saturados | Solo A:D (E es fórmula) |
| Recetas | Oculta | Cómo llamar cada fuente; prompts de subagentes | Solo filas nuevas al final |
| Sub-nichos, Fuentes, Rankings | Oculta | Legado de W1/W2 | — |
| Log BUSCA | Oculta | Memoria de BUSCA AÉREO | BUSCA AÉREO (S:AH son fórmulas) |
| Exploración | Oculta | Pruebas de EXPLORA | EXPLORA |
| Laboratorio | Oculta (al final) | Estado, metas, KPI, línea base y corridas de BUSCA AÉREO (INSTR 08). Creada 2026-10-16 | Orquestador de BUSCA AÉREO (CORRIDAS A35:N94); metas B6:B9 el dueño |
| Aéreo por lotes | Sí (al final) | Vista por lotes de los productos aéreos (lote = sesión de RANKEA AÉREO), lo nuevo arriba; selectores B3 (lote) y D3 (solo Sí). Creada 2026-10-17 | Nadie (fórmulas) |
| Plan carga | Oculta (al final). Creada 2026-11-02 | Plan de cargas por cobertura: por región · subcategoría, última ventana leída, ventana pendiente, créditos, filas nuevas, productos, rendimiento, restante sin leer (fórmulas A:M, O); Q:AE = próximas cargas ordenadas; AG:AP = hallazgos de Exploración sin integrar | Solo la columna N (Estado) la escriben el Juez o MEJORA |
| Descubrimiento | Oculta (al final). Creada 2026-10-19 | Candidatos de Amazon Best Sellers (DESCUBRE, Recetas D42) | DESCUBRE (A:N); RANKEA marca M:N |
| Nodos Amazon | Oculta (al final). Creada 2026-10-19 | Árbol de departamentos y subnodos de Amazon con rendimiento | DESCUBRE; el Juez escribe I (Agotado) |
| Experimentos | Oculta (al final) | Hipótesis, perilla, valor anterior y veredicto del bucle (INSTR 08). Creada 2026-10-16 | Orquestador y Juez |

Nunca cambies el orden de las pestañas ni las muestres u ocultes.

## Columnas de Productos

- **Las llena un comando:** A:AF, AI:AL, AS:AV, AZ:BB, BE (y BD de RANKEA/ALIBABA).
- **Con fórmula, nunca se escriben:** AG:AH, AM:AR, AW, AX, AY, BC, BF, BG. En otras pestañas: Crudo P:Q, Sesiones I:N, Excluidos E, Log BUSCA S:AH.
- Un solo valor escrito sobre una columna con fórmula rompe la columna entera (#REF!). Pasó en Excluidos E y en Sesiones I:N (M-027, M-042).
- Mapa completo: INSTR 00 §5.

## Recetas que otros documentos citan por número de fila

El encabezado es la fila 1. Los INSTR citan el **número de fila de la hoja**; las filas nuevas van siempre al final para no correr los números (M-022).

| Fila | Receta |
|---|---|
| 21 | Meta MCP: anunciantes distintos en Perú |
| 26 | Alibaba con Firecrawl (respaldo) |
| 30 | ALIBABA scripts A a I: el código está en la **columna E** (la F es una nota de prueba) |
| 31 | BUSCA AÉREO: contador, plan, Log BUSCA y prefiltro |
| 34 | PiPiAds TikTok Shop por interfaz (pageData completo) |
| 36 | ALIBABA: instrucciones del subagente (D36) |
| 37 | FILTRA: instrucciones del subagente (D37), creada 2026-10-15 |
| 38 | BUSCA AÉREO: ranking de rendimiento por región y categoría, creada 2026-10-16 (se actualiza en MEJORA) |
| 39 | RANKEA: instrucciones del subagente (D39), creada 2026-10-16; v3 el mismo día tras dos pilotos |
| 41 | RANKEA AÉREO: triage por rangos de Crudo (D41, 2026-10-18) |
| 42 | DESCUBRE: Amazon Best Sellers con Firecrawl (D42, 2026-10-19) |
| 40 | BUSCA AÉREO: instrucciones del cargador (D40; desde 2026-11-02 las ejecuta el propio chat, prefijo SIN SUBAGENTES, igual que D37 y D39), creada 2026-10-16 tras la primera corrida real | (v2 2026-10-16: dedupe posterior en la hoja, sin X2 en el navegador)

## Lo que se agregó desde esta carpeta (2026-10-15)

- INSTR 06 v3.29, INSTR 00 v4.18, Recetas C36/D36/fila 37, Mejoras M-017/M-028/M-051/M-052/M-055 aplicadas y M-056 a M-058 nuevas, fila de sesión 863 en Sesiones. Detalle y texto anterior en `DECISIONES.md`.

## Celdas calculadas de Config para registrar sesión y cargas

| Celda | Qué da |
|---|---|
| `Config!B101` / `B102` | Fila e ID libres de la próxima sesión en `Sesiones` |
| `Config!B103` | Fila libre de la próxima carga en `Log BUSCA` (A:R). Agregada 2026-10-15 (M-061) |
| `Config!B104` | Lista de filas de Productos (Registro = Ninguno, Recomendado «Pendiente…») para validar sin esperar el ✅ (2026-10-16) |
| `Config!B105` | Máximo de productos a validar con FILTRA por corrida de BUSCA AÉREO (hoy 40) |
| `Config!B107` | Créditos de Firecrawl por chat para DESCUBRE (2026-10-19) |
| `Config!B108` | Cargas de PiPiAds por chat en INICIA AEREO antes de pasar a RANKEA (2026-11-02, hoy 25) |
| `Config!B109` | Grupos por lote en RANKEA sin subagentes (2026-11-02, hoy 5) |
| `Config!B110` | Productos de ALIBABA por chat dentro de INICIA AEREO (2026-11-02, hoy 6) |
| `Config!B106` | Interruptor: validar y buscar proveedor sin esperar el ✅ (Sí/No) |


## Reestructura 2026-11-02 (D-038): sin subagentes

Ninguna corrida con orquestador y subagentes llegó al cierre (Sesiones 2026-10-15 a 2026-10-24). Desde el 2026-11-02 ningún comando usa subagentes: el chat hace el trabajo en lotes y escribe al cerrar cada lote. INSTR 06 v4.0 e INSTR 08 v3.0 reescritos desde cero (copias v3.35 y v2.1 en la carpeta de versiones); INSTR 00 v4.22; INSTR 07 v1.9; ARRANQUE actualizado (la autorización de subagentes queda retirada). Pestaña «Plan carga»: el plan de cargas lo da la hoja (ventana pendiente por combinación, rendimiento, restante sin leer, hallazgos de Exploración sin integrar). La tarea programada «Buscador aéreo — RANKEA y FILTRA (diario)» (trig_01VbaVTzd8zuHHtD5ChyTjSC) se apagó: sin conectores no podía correr; se reactiva cuando el dueño los agregue en claude.ai. Nada se quitó de este mapa: lo retirado queda anotado.

Agregado 2026-11-02 (segunda vuelta): INSTR 08 v3.1, fase F0 (cada INICIA AEREO cierra el Juez de la sesión anterior y aplica hasta 3 Mejoras de riesgo Bajo). INICIA AEREO es el único comando que el dueño necesita escribir.
