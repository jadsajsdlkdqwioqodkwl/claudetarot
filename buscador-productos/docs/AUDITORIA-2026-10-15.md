# Auditoría 2026-10-15

Alcance: lectura completa de INSTR 00, 03, 04, 05, 06 y 07 (INSTR 01 y 02 son legado W1/W2), `Config!A1:C102`, las 55 filas de `Mejoras`, `Sesiones` (101 sesiones), `Recetas` A1:G36, `Productos!AG:AH` y `AR`. No se leyeron Crudo, Cola RANKEA ni Log BUSCA (ver pendientes).

## Estado del sistema

| Dato | Valor |
|---|---|
| Productos en `Productos` | 315 |
| Filas en Crudo / limpias | 4.599 / 3.255 |
| Descartadas por RANKEA | 2.782 (85% de las limpias) |
| Llegaron a Productos | 327 filas |
| En la cola ahora | 128 (3 generales, 125 aéreas) |
| Aprobados sin validar | 4 (FILTRA general: 3, aéreo: 1) |
| Pendientes de ALIBABA | 14 generales, 0 aéreos |
| Sesiones registradas | 101 (FILTRA 33, BUSCA AÉREO 23, RANKEA 12, ALIBABA 12+4, BUSCA 7) |

Motivos de descarte más comunes: marca 345, fuera de foco 319, producto base común 294, sin producto identificable 172, ya en Productos 128.

## Hallazgos

| # | Hallazgo | Impacto | Estado |
|---|---|---|---|
| 1 | FILTRA llena el chat (25-30 llamadas de Meta MCP por producto) y no usaba tandas; ~40% de los productos sigue «Sin chequear» o «Pendiente Meta» | Cuello de botella del flujo de validación | **Aplicado** (M-056, M-017): FILTRA en tandas, `Recetas!D37` |
| 2 | Productos «parcial» repetían rondas de Meta ya contadas (13 repetidos, ~250 créditos) | Gasto de Firecrawl sin ganancia | **Aplicado** (M-028): leer antes la fila de Chequeo Meta |
| 3 | `Recetas!E30` vs `F30`: INSTR 06 y la descripción de `C36` decían F30; el código está en E30 y ya trabó a un subagente | Una tanda de ALIBABA completa se bloqueaba | **Aplicado** (M-051) |
| 4 | Peso/tamaño (O) quedaba con la caja del proveedor, no el producto | Dato de importación aérea engañoso | **Aplicado** (M-052) en INSTR 06 y `D36` |
| 5 | Foto (Crudo U) vacía en las filas de BUSCA AÉREO de la sesión -n | ALIBABA no tiene foto sin abrir PiPiAds | **Aplicado** (M-055): regla en INSTR 06 §2.6 |
| 6 | 20 de 101 sesiones sin notas; las últimas tienen I:N en 0 | La sesión siguiente no sabe qué se hizo | **Aplicado** (M-058): nota de cierre obligatoria. Falta revisar por qué I:N quedan en 0 |
| 7 | El embudo pierde 85% entre Crudo y Productos; el PiPiAds de esas filas ya se pagó | Créditos desperdiciados | **Propuesta** (M-057): medir marcas repetidas en Crudo antes de tocar el prefiltro |
| 8 | Las citas a filas/columnas se desfasan (M-018, M-022, M-025, M-026, M-039, M-051) | Cada vez que se inserta una receta se rompen referencias | **Mitigado**: regla «filas nuevas al final» y tabla de filas clave en `MAPA.md`. No se cambió a citar por nombre (decisión de M-022: más riesgo) |
| 9 | Tamaño de los documentos: INSTR 06 ~54 mil caracteres, INSTR 00 ~20 mil | Cada chat paga esa lectura | **Mitigado**: `OPERAR.md` indica qué sección leer por comando; los subagentes leen una celda de Recetas |
| 10 | Config con muchas filas «solo comandos antiguos W1/W2» y una nota inconsistente en B66 («Bajado de 3000», valor 3000) | Ruido al leer Config | **No tocado**: Config no se reordena ni se borra; B66 vale 3000 por autorización del dueño (M-053) |
| 11 | INSTR 00 §2: ítem 2 vacío y numeración que se reinicia | Cosmético | **Pendiente**: exige editar la estructura del documento |
| 12 | M-011 figura «Aplicada» pero su nota dice «no hace falta todavía» | Estado engañoso en Mejoras | **Pendiente menor**: pasar a «Ya cubierta» en la próxima MEJORA |

## Interpretación y supuestos

- «2 flujos x 2 modos» se tomó como **Descubrir** (BUSCA, RANKEA) y **Validar** (FILTRA, ALIBABA), cada uno en modo **general** y **aéreo**. Los workflows W1/W2 (INSTR 01 y 02) quedan como legado: W1 está apagado (Config, porcentaje de créditos para W1 = 0) y BUSCA los usa solo como referencia.
- No se descartó nada ni se borró nada en el Sheet; todo cambio fue sumar o reemplazar texto de reglas, y el texto anterior está en `DECISIONES.md`.

## Pendientes (próxima sesión)

1. **M-057**: leer `Crudo!H` y `S`, listar las 20 tiendas/marcas que más se repiten como «marca» y probar si una lista corta en el prefiltro (`Recetas!E31`) ahorra créditos sin falsos negativos.
2. Medir la primera **FILTRA en tandas**: créditos de Firecrawl por producto, productos cerrados por chat y si 3 subagentes en paralelo chocan; si chocan, bajar a 1.
3. Revisar por qué `Sesiones!I:N` salen en 0 en las últimas sesiones (¿fórmula que no cuenta el formato nuevo del ID?).
4. Numeración de INSTR 00 §2 y M-011.
5. Sincronizar el espejo del resto de INSTR (00, 03, 04, 05, 07) en `docs/espejo/`: hoy solo está INSTR 06 por límite de lectura (INSTR 00 llegó cortado en la sección 7).
