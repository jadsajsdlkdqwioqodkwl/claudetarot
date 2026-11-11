# Laboratorio de BUSCA AÉREO (bucle de prueba y error)

Reglas completas: INSTR 08 en Drive (`1QCt6LLHP4mB9LCRaPNxO-1lP1LqhwNiPB4KAtjYBwbM`), espejo en `docs/espejo/INSTR-08.md`. Esta es la guía rápida.

## Cómo se usa

1. En tu computadora (con Claude in Chrome), un chat nuevo: **BUSCA AÉREO**. Nada más.
2. El agente lee el estado del laboratorio, elige el experimento pendiente de mayor prioridad, carga PiPiAds, y en paralelo manda subagentes a RANKEA y FILTRA; al final busca proveedor para los Top nuevos, mide la corrida, da el veredicto del experimento y deja todo en la hoja.
3. Repite **BUSCA AÉREO** en un chat nuevo (un día distinto: la ventana de productos avanza un día por día) hasta que `Laboratorio!B4` diga **META CUMPLIDA**.

## Dónde mirar

| Qué | Dónde |
|---|---|
| Si ya se cumplió la meta | `Laboratorio!B4` |
| Metas (editables) | `Laboratorio!B6:B9` |
| KPI en vivo | `Laboratorio!A12:C22` |
| Línea base fija | `Laboratorio!A24:F31` |
| Historia de corridas | `Laboratorio!A34:N94` |
| Experimentos y su veredicto | pestaña `Experimentos` |
| Interruptor de validación automática | `Config!B106` (Sí/No) |

Las pestañas `Laboratorio` y `Experimentos` están ocultas al final del Sheet (clic derecho en las pestañas > Mostrar).

## Línea base (2026-10-16)

Aéreo: 319 cargas, 1.760 créditos, 446 filas nuevas, 41 productos, 17 Top. Todos los productos son del 12/10: del 13 al 15 entraron 230 filas y 0 productos porque ninguna RANKEA AÉREO terminó la cola. Rendimiento del día 1: 7,9 Top por 100 filas nuevas, 1,6 Top por 100 créditos.

## Meta («mejora significativa»), en las 3 últimas corridas completas

- Mediana de Top nuevos por corrida: 10 o más.
- Mediana de Top por 100 créditos: 3,2 o más (el doble de la línea base).
- La cola aérea no crece más de 10 entre el inicio y el fin de la corrida.
- Sin intervención manual ni cierre parcial.
- En 3 días distintos.

Son números tuyos: cámbialos en `Laboratorio!B6:B9` si quieres más o menos exigencia.

## Qué puede mover el Juez solo, y qué no

Solo: `Config!B92`, `B93`, `B94`, `B105`; el orden de regiones y categorías (`Recetas` fila 38); tamaño de tandas y subagentes en paralelo. Todo lo demás queda en `Mejoras` como «Necesita OK del dueño» (E-010, E-011 y E-012 esperan tu decisión). Cada cambio guarda su valor anterior en `Experimentos` para revertir.

## Qué parte puede correr sin ti y qué no

| Fase | Dónde |
|---|---|
| Cargas de PiPiAds (1) y proveedor en Alibaba (4) | Solo tu computadora, con Chrome y tus sesiones |
| RANKEA (2), FILTRA (3) y Juez (5) | Cualquier sesión, incluida la nube |

Por eso el bucle avanza **un experimento por corrida de BUSCA AÉREO** que tú lances. Desde la nube se puede programar una rutina diaria que solo corra RANKEA, FILTRA y el Juez para que la cola no se acumule; no está creada (escribe en tu hoja sin supervisión): si la quieres, se activa aparte.

## Pruebas hechas el 2026-10-16

- Fórmula de `Laboratorio!B4`: probada con 3 corridas de ejemplo que cumplen (META CUMPLIDA) y una con cierre parcial (EXPERIMENTANDO); las filas de ejemplo se borraron.
- Subagente de RANKEA (`Recetas!D39`): dos pilotos de solo lectura con grupos reales. v1: 113 mil tokens, 4 de 6 grupos sin puntuar. v2: 90 mil tokens, 4 de 4 resueltos. Costo medido: ~45 mil tokens fijos por subagente y ~11 mil por grupo.
- **No probado:** una corrida completa de BUSCA AÉREO (necesita tu Chrome), FILTRA en tandas y ALIBABA en tandas dentro de la misma corrida.
