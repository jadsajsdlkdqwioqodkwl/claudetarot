# BUSCA AÉREO 2026-10-15-r — intento y revisión

## Resultado de la corrida

**No se cargó nada (0 créditos de PiPiAds).** Esta sesión corre en la nube: no tiene Claude in Chrome ni tu sesión de PiPiAds, y el navegador de la nube no arranca (`chrome-not-running`). No se intentó iniciar sesión ni se usaron credenciales. Lo único que se pudo hacer del comando fue «Lee al empezar»: el Log BUSCA y el plan de cargas.

> BUSCA, BUSCA AÉREO, EXPLORA y ALIBABA necesitan Chrome con tu sesión. Corren en tu computadora. Desde la nube se pueden correr RANKEA, FILTRA y MEJORA (Meta MCP, Firecrawl y Sheets).

## Lo que muestra el Log BUSCA (60 combinaciones, 3.000 créditos de tope por chat)

1. **El pool por tiempo está casi seco.** Todas las ventanas leídas terminan el 2026-09-12 o 2026-09-13. El límite superior es `hoy − 30 días` (Config B72), o sea que cada día aparece solo ~1 día nuevo de productos. La condición «ventana nueva de 30 días» de Config B94 se cumple una vez al mes. Hoy habría ~2 días nuevos: no vale la pena pagar cargas por eso.
2. **RANKEA va atrasado y distorsiona la medición.** Config dice 125 filas aéreas en la cola. En el Log, unas 35 combinaciones dicen «falta RANKEA» (por ejemplo US luces con 19 pendientes, US autorep con 15, US limpieza con 9). Mientras haya pendientes, «créditos por producto que llegó» (AH) no dice nada, así que el plan de cargas se decide con datos incompletos.
3. **Mejores rendimientos medidos** (créditos por producto que llegó a Productos, solo combinaciones ya rankeadas): US automotriz 5,7 · GB aereo9 6,7 · US herramientas 7 · BR herramientas 10 · BR automotriz 11,5.
4. **Lo que más desperdicia:**
   - Bandas de precio después de leer 8a80 completo: US luces 8a20, 20a40 y 40a80 costaron 9, 14 y 9 créditos para 1 fila nueva cada una (9 a 14 créditos por fila).
   - Cargas grandes sobre categorías ya leídas: US deportes 98 créditos para 8 filas nuevas (12,3 por fila); US aereo9 260 créditos para 14 filas nuevas (18,6 por fila, aunque dio 10 productos).
5. **La amplitud está por explotar.** Casi todo se leyó en US y BR; MX aparece solo con «mejoras», GB solo con aereo9, ID solo con aereo9. ES y otras regiones del selector no figuran.

## Qué mejorar (en orden de ahorro)

| # | Acción | Dónde | Estado |
|---|---|---|---|
| 1 | Correr **RANKEA AÉREO antes** de la próxima BUSCA AÉREO, o en otro chat al mismo tiempo (no usa Chrome): baja las 125 pendientes y da AH real para decidir las cargas | Operación | Recomendado |
| 2 | **Dejar de cargar bandas de precio** después de leer una subcategoría en 8a80 | INSTR 06 §2.8 / Recetas E31 | Propuesta M-060 |
| 3 | Con el pool de tiempo seco, gastar créditos en **amplitud**: regiones nuevas (MX, ES, GB) para las categorías que mejor rinden (automotriz, herramientas), y la banda de videos 10-19 de la escalera | INSTR 06 §2.8 | Propuesta M-060 |
| 4 | No volver a cargar categorías enteras de las que ya se leyó la ventana (deportes, aereo9, cocina, mejoras): el costo por fila nueva sube a 12-26 | Config B94 | Ya cubierto por B94 (12): vigilar que se respete |
| 5 | Documentar dónde corre cada comando para no pedir BUSCA desde la nube | `OPERAR.md` | Aplicado |

## Plan de cargas para la próxima BUSCA AÉREO (en tu computadora)

1. Antes: RANKEA AÉREO (o en paralelo).
2. Regiones nuevas, v1000, videos 10-19, sin banda de precio (8a80), en este orden de AH: automotriz, herramientas, aereo9 (GB ya medido; probar ES y MX), deportes (solo regiones sin leer).
3. Ventana nueva `2026-09-13..hoy−30` solo para US y BR de las 3 mejores combinaciones, si ya pasó un mes desde la última lectura de esa combinación.
4. Tope de la sesión: Config B91 (3.000). Registrar cada carga en Log BUSCA y cerrar con la nota en Sesiones!H.
