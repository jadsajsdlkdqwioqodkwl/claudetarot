# Análisis de rendimiento de BUSCA AÉREO (2026-10-16)

Fuente: `Crudo!A1:U4800` leído completo (4.602 filas), cortado por carril A (aéreo). Es lectura pura: no se escribió nada en el Sheet para este análisis.

## Embudo del modo aéreo

| Dato | Valor |
|---|---|
| Filas de Crudo | 4.602 (W2 2.732 · W1 1.374 · **aéreo 476 = 10%**) |
| Aéreas descartadas por RANKEA | 251 |
| Aéreas preseleccionadas (esperan puntaje) | 111 |
| Aéreas pendientes (triage) | 68 |
| Aéreas que llegaron a Productos | 46 |
| Aéreas ya juzgadas (Producto o Descartado) | 297 -> **46 productos = 15%** |

## Qué predice que una fila llegue a Productos (297 filas aéreas juzgadas)

**Ventas a 30 días** (filtro actual: 2.000 o más)

| Banda | Éxito |
|---|---|
| menos de 1.500 | 11/81 = 14% |
| 1.500 a 2.000 | 7/45 = 16% |
| 2.000 a 3.000 | 6/51 = 12% |
| 3.000 a 5.000 | 6/51 = 12% |
| 5.000 a 10.000 | 9/33 = 27% |
| 10.000 o más | 7/36 = 19% |

**Videos del producto** (filtro actual: 20 o más): menos de 20 = 15%, 20-40 = 15%, 40-80 = 18%, 80 o más = 13%.

> Conclusión: ventas y videos **no separan buenos de malos**. Una fila con 1.000 ventas llega a Productos tanto como una con 3.000. El umbral 2000/20 solo achica el pool. No hay datos por debajo de 1.000 ventas.

**Región**: US 34/170 = 20% · **BR 9/120 = 8%** · GB 3/5 = 60% (muestra chica) · ID 0/2.

**Categoría** (con 6 o más filas juzgadas):

| Categoría | Éxito |
|---|---|
| **aereo (grupo aereo9)** | **13/22 = 59%** |
| automotriz | 9/32 = 28% |
| deportes | 6/25 = 24% |
| herramientas | 7/31 = 23% |
| cocina | 4/32 = 12% |
| mejoras | 3/32 = 9% |
| celacc | 2/23 = 9% |
| electrodomesticos | 1/24 = 4% |
| electronica, autoint, hogarelec, limpieza | 0/36 en conjunto |

## Por qué se descartan las aéreas (251)

Los más repetidos: voluminoso 27 · funda de celular 11 · producto base común (paraguas, etc.) 10 · moda 9 · ya en Productos 9 · decoración 8 · pesado 8 · electrodomésticos 8 · luminaria solar 7. Voluminoso + pesado = 35 filas (14%): se pueden ver por el título antes de que RANKEA gaste una lectura.

## Reciclar el Crudo de otros carriles

2.620 filas W1/W2 fueron descartadas. Con un cribado por título (sin batería, líquido ni cosmético, y con palabras de herramienta, cocina, auto, organización) salen **~124 candidatas (5%)**, y casi todas son accesorios de mascotas que ya caen por «producto base común». No es una palanca grande.

## Lo que se concluye

1. **Los créditos no son el límite; el pool lo es.** Quedan ~97.000 créditos y las sesiones gastan 3 a 100. La regla de no volver a pagar combinaciones a más de 12 créditos por fila (Config B94) y el 2000/20 achican el pool sin mejorar la calidad.
2. **Dónde está el rendimiento:** grupo aereo9, automotriz, deportes y herramientas en US (y GB por probar). BR rinde 8% y cuatro categorías rinden 0.
3. **El cuello de botella aguas abajo es RANKEA**: 179 aéreas esperan puntaje (111 + 68). Más BUSCA sin vaciar la cola solo la alarga.
4. **Hipótesis aún sin medir** (para EXPLORA): ordenar por crecimiento reciente en vez de ventas totales, ampliar a productos de 10-30 días (hoy se exigen 30 o más, Config B72), y partir de los vendedores de los productos que ya están en Top aéreo.

## Segunda pasada (cruce Crudo con Productos, mismo día)

Se cruzaron las 41 filas aéreas de Productos (ID `-A-`) con su fila de Crudo por el ID del anuncio (41 de 41 enlazadas).

| Resultado en Productos | Cantidad |
|---|---|
| Recomendado **Sí** (Top) | 17 |
| Recomendado No | 24 |
| Estado Meta: Entrando · Quemado · Sobreexplotado | 18 · **17** · 6 |
| Clasificación: RENTABLE · LOSER · **WINNER** | 37 · 4 · **0** |

- **23 de 41 (56%) mueren por saturación en Perú** al validar (17 Quemados, 6 Sobreexplotados): cada uno gastó una lectura de RANKEA y una validación de FILTRA. Propuesta M-065.
- **Ningún aéreo llega a WINNER**: la recompra (peso 3) vale 0 en herramientas y accesorios. Propuesta M-066.
- **Edad del producto no separa** (muestra de 41, todos con 30 días o más por la regla B72): 41% Sí con menos de 45 días, 50% con 120 o más. No hay evidencia para o contra la «banda de 10 a 30 días»; se deja la regla del dueño como está.
- **Ventas**: Sí en 44% con menos de 1.500 ventas, 36% de 1.500 a 3.000, 50% de 3.000 a 10.000, 29% con 10.000 o más (muestras de 7 a 14: solo orientativo).

## Correcciones al análisis anterior

1. **El piso 1000/10 casi no abre pool nuevo.** El 12 de octubre ya se había leído US con ventas 1000 y videos 10 (Log BUSCA, ventanas «v1000»). Por eso la escalera de INSTR 06 baja ahora a 500/5 y 250/3, con control: si la tasa de Producto de una carga baja de 8%, se vuelve atrás.
2. **El ruido de «voluminoso/pesado» no se arregla con palabras.** Los 56 descartes de ese tipo son sobre todo títulos en portugués de BR (panelas, tampa, churrasqueira, antiaderente, ventilador). Las palabras en inglés que aparecen también están en productos buenos (led, kit, magnetic, fast). Se descartó el prefiltro (M-064 pasó a «Ya cubierta»): bajar BR al final del orden es lo que lo resuelve.

## Qué se aplicó (aprobado por el dueño el 2026-10-16)

- `Config!B92` 2000 -> 1000, `B93` 20 -> 10, `B94` 12 -> 25 (valores anteriores en las notas C92:C94).
- INSTR 06 v3.31: escalera hasta 500/5 y 250/3 con control del 8% y plan de cargas ordenado por rendimiento.
- `Recetas` fila 38: ranking de regiones y categorías.

## Tercera pasada: logs, Sesiones y pestaña Exploración (2026-10-16)

**Lo que EXPLORA ya había confirmado el 2026-10-14 y no estaba en las reglas:**

1. `sales_volume_max` filtra en el servidor (20 filas de 999 a 976 ventas). Sin el máximo, una carga con piso 500 vuelve a traer las 20 de mayor venta ya leídas: en el Log, US autorep con ventas 1500 y 1000 dio 10 de 11 y 12 de 13 repetidos. Por eso la escalera de INSTR 06 v3.32 va por **bandas** (500 a 999, luego 250 a 499).
2. `current_page=2` pagina la lista de la interfaz (Pages:20, filas 21 a 40). INSTR 06 decía «la URL no tiene página 2» y mandaba partir por precio. Ahora pide primero la página siguiente y parte por precio solo si falla.
3. `sort=7` ordena por videos, pero al cambiar el orden o buscar por texto se pierde `categorize`: hay que volver a ponerlo.

**RANKEA sigue cerrando parcial:** las sesiones `-s` y `-w` del 2026-10-15 hicieron el pre-chequeo a mano (~20 grupos) y la cola aérea solo bajó de 128 a 124. El modo tandas de M-050 existía pero no se usaba. INSTR 06 §3.2 lo hace ahora el modo por defecto y `Recetas!D39` trae la instrucción compacta del subagente.

**EXPLORA rinde poco:** una sola sesión con presupuesto (140 de 150 créditos) y 7 pruebas pendientes. El tope fijo de 150 (INSTR 07 §3) impide pruebas como Pages:100 con ~97.000 créditos disponibles. Se dejó una cola de 8 pruebas en `Exploración!A12:J19` (regiones en inglés SG/PH/MY/IE, orden por crecimiento, banda 500-999, paginación, Pages:100, árbol de categorías, productos del vendedor, búsqueda por texto) y se propone subir el tope a 500 (M-069).

**Esta sesión no tiene Chrome:** no se pudo probar la plataforma a mano. EXPLORA debe correr en tu computadora, en un chat aparte, cuando termine la BUSCA AÉREO en curso (comparten Chrome).
