# INSTR 08 — INICIA AEREO (BUSCA AÉREO de punta a punta) y Laboratorio

Versión 3.1 · 2026-11-02 (v3.1: fase F0 «cierre de la sesión anterior»: cada INICIA AEREO hace el Juez de la sesión previa si quedó sin hacer y aplica las Mejoras de riesgo Bajo pendientes; INICIA AEREO es el único comando que el dueño necesita escribir). v3.0: Reescritura: sin orquestador ni subagentes; un chat recorre las fases en orden hasta llenarse y el siguiente chat con INICIA AEREO retoma desde la hoja. Copia v2.1 archivada (ID 15Bw73MXFz-aVbBYECre6hT00hsk0eFaiReSm9F3DJe4); el historial v1.x está en la copia v1.19 (ID 1cmKaS_F1CGLXyQF3bNW1xr_vXx2YnWOZby1AbBPnzfQ). Evidencia: D-038 del repo.

## 1. Qué es

INICIA AEREO (lo mismo que BUSCA AÉREO o INICIA AÉREO) es un solo comando que hace, en este chat y él mismo, las fases del flujo aéreo en orden: cargas, RANKEA, FILTRA, ALIBABA, y EXPLORA y DESCUBRE cuando tocan, más el Juez y el cierre. Cada fase sigue su sección de INSTR 06 v4. No hay subagentes. Cuando el chat se llena, cierra con el estado en Sesiones!H, y el siguiente chat con INICIA AEREO retoma en la fase que corresponda. ES EL ÚNICO COMANDO QUE EL DUEÑO NECESITA ESCRIBIR, una y otra vez. Los comandos sueltos (BUSCA AÉREO SOLO, RANKEA AÉREO, FILTRA AÉREO, ALIBABA AÉREO, EXPLORA, DESCUBRE, MEJORA) siguen existiendo solo para correr una fase a propósito; INICIA AEREO los cubre todos.

## 2. Arranque (sin preguntar)

Lee solo: Config!B91:B110; la nota de la sesión anterior, Sesiones!H{B101 menos 1}; Laboratorio!A4:B10; Plan carga Q1:AE40. Registra la sesión (Sesiones!A{B101} con el ID de B102 más «INICIA AEREO») y escribe en H «INICIO: modo, cola B100, créditos 0 de B91». Prueba Chrome una vez: con Chrome, modo COMPLETO; sin Chrome, modo NUBE (solo fases 2, 3, 6 y 7; la corrida se registra Parcial). Lee INSTR 06 v4 completo una sola vez (es corto); no abras INSTR 03, 04 ni 07 salvo en la fase 5.

## 3. Fases, en este orden y en este chat

- F0 CIERRE DE LA SESIÓN ANTERIOR (siempre): (a) si la nota anterior no dice «JUEZ hecho», haz su Juez (sección 4): fila en Laboratorio CORRIDAS, veredicto en Experimentos, perillas; escribe «JUEZ hecho por <tu sesión>» al final de esa nota. (b) Aplica hasta 3 filas de Mejoras con K = Propuesta y riesgo Bajo (INSTR 06 §6). (c) Marca Agotado en Nodos Amazon y Excluida en Plan carga N lo que tenga 2 visitas seguidas con 0 productos. Sin créditos.
- F1 CARGAS (COMPLETO): INSTR 06 sección 1, hasta Config!B108 cargas (hoy 25) o hasta que Plan carga quede sin filas con Siguiente = Sí. Si la nota anterior dice que las cargas quedaron a medias de B108, retoma ahí.
- F2 RANKEA AÉREO: INSTR 06 sección 2, hasta que Config!B100 = 0 (incluye los Candidatos de Descubrimiento).
- F3 FILTRA AÉREO: INSTR 06 sección 3, sobre Config!B104 hasta B105 productos, reparaciones primero.
- F4 ALIBABA AÉREO (COMPLETO): INSTR 06 sección 4, hasta Config!B110 productos (hoy 6), Recomendado Sí primero.
- F5 EXPLORA (COMPLETO): solo si al terminar F1 Plan carga no tenía filas con Siguiente = Sí, o si las últimas 10 cargas dieron menos de 1 producto por 50 créditos: INSTR 07, hasta 6 pruebas o 500 créditos; los resultados van a Exploración con la columna K vacía (entran al plan del siguiente chat).
- F6 DESCUBRE (siempre en NUBE; en COMPLETO solo si F1 no tuvo nada que cargar): INSTR 06 sección 5.
- F7 JUEZ Y CIERRE: sección 4; una fila en Laboratorio CORRIDAS (la primera libre de A35:A94, columnas A:G e I:N; NUNCA la H, es una fórmula); Experimentos; Mejoras; Sesiones!H final con «JUEZ hecho»; entrega (sección 6).

Si el chat se llena en cualquier fase: punto de control en Sesiones!H («quedé en F2, lote 3…») y cierre con «Siguiente paso: abre un chat nuevo y escribe INICIA AEREO». El siguiente chat retoma esa fase y sigue el orden; si no hay nota, empieza en F1.

## 4. Juez (bucle de prueba y error)

Un experimento por corrida (pestaña Experimentos: el «En curso» o, si no hay, el «Pendiente» de menor prioridad). Al cerrar mide: créditos (suma de Log M de la sesión), filas nuevas, productos nuevos (Productos con el ID de la sesión), Top nuevos (Recomendado Sí de esos productos), tasa de Producto (productos entre filas juzgadas), cola inicial y final, y el rendimiento por combinación (Plan carga, columna L). Veredicto: Mantener si Top por 100 créditos o Top nuevos suben y la tasa no baja de 8%; Revertir si la tasa baja de 8% o Top por 100 créditos cae más de 30% frente a la mediana de las 3 corridas anteriores; Seguir midiendo (máximo 2 corridas) si no se distingue; no se revierte mientras haya filas de la corrida sin juzgar. Perillas que el Juez mueve solo, dentro de su rango: Config!B92 (250 a 3000), B93 (3 a 30), B94 (8 a 40), B105 (10 a 80), B108 (10 a 40), B109 (3 a 8), B110 (3 a 12); Plan carga N (Excluida o Pendiente) y Nodos Amazon I (Agotado) con evidencia de 2 visitas con 0 productos; Recetas D38 cada 5 corridas. Todo lo demás va a Mejoras como «Necesita OK del dueño». Anti-trampa: la métrica es Top nuevos después de FILTRA, nunca filas ni productos.

## 5. Meta y estado (Laboratorio!B4)

META CUMPLIDA cuando en las 3 últimas corridas completas la mediana de Top nuevos es al menos B6, la de Top por 100 créditos al menos B7, la cola no creció más de B8, no hubo cierre parcial y fueron al menos B9 días distintos. En META CUMPLIDA no se activan experimentos nuevos salvo 1 de cada 5 corridas; si deja de cumplirse, vuelve sola a EXPERIMENTANDO.

## 6. Entrega

NECESITA AL DUEÑO en una línea; tabla corta de los Top nuevos (producto, estrellas, precio, anunciantes en Perú, precio proveedor); créditos, filas y productos de la corrida; experimento y veredicto; estado del laboratorio; recomendaciones y cuellos de botella (máximo 5, con evidencia, también en Mejoras). Cierra con «Siguiente paso: abre un chat nuevo y escribe INICIA AEREO».

## 7. Lo que nunca

Escribir la casilla de Revisión o columnas con fórmula; borrar, ordenar o mover filas; dos comandos con Chrome a la vez; estimar un estado de Meta; cambiar Config!B91; usar subagentes; preguntar «¿sigo o corto?».
