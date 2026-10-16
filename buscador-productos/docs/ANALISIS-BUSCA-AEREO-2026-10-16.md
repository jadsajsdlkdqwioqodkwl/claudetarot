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
