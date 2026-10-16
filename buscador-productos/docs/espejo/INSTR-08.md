# INSTR 08 — BUSCA AÉREO de punta a punta y Laboratorio

Versión 1.0 · 2026-10-16

(Espejo del documento de Drive `1QCt6LLHP4mB9LCRaPNxO-1lP1LqhwNiPB4KAtjYBwbM`. Manda el de Drive.)

## 1. Qué es

- **BUSCA AÉREO** hace ahora todo el flujo aéreo en una sola corrida: cargas en PiPiAds, RANKEA AÉREO, FILTRA AÉREO y ALIBABA AÉREO, y mide y mejora su propio rendimiento con el Laboratorio (secciones 4 a 6).
- **BUSCA AÉREO SOLO** hace únicamente las cargas, como antes (INSTR 06, sección 2.8).
- Este documento manda sobre INSTR 06 en el orden de las fases. INSTR 06 sección 2.8 sigue mandando en cómo se hace cada carga.
- Un comando por chat y sin preguntas (INSTR 00, sección 6). Si el chat se llena: «Escribe BUSCA AÉREO en un chat nuevo»; todo el estado está en la hoja.

## 2. Autorizaciones del dueño (2026-10-16)

1. Subagentes en todo el flujo: cargador (uno solo), RANKEA, FILTRA, ALIBABA y Juez.
2. FILTRA AÉREO y ALIBABA AÉREO sin esperar el ✅ de Revisión mientras Config!B106 sea «Sí». La casilla de Revisión no se escribe nunca. Lista de trabajo: Config!B104; tope por corrida: Config!B105.
3. El Juez puede mover solo las perillas de la sección 4, punto 5, dentro de sus rangos.
4. Créditos de PiPiAds: tope por chat Config!B91 (el chat no lo cambia sin autorización del dueño).

## 3. Fases de cada corrida

| Fase | Quién | Dónde corre | Qué hace |
|---|---|---|---|
| 0. Arranque ligero | Principal | Cualquiera | Lee solo: Config!B91:B94, B96, B100:B106; Laboratorio!A4:B10 (estado y metas) y A33:N94 (corridas); Experimentos!A:K (el experimento «En curso» o, si no hay, el «Pendiente» de menor prioridad; nunca uno «Necesita OK del dueño»); Log BUSCA Z1:AH80 y X2; Recetas filas 31, 34, 36, 37, 38 y 39. Anota «cola al inicio» = Config!B100. Registra la sesión (Config!B101:B102). |
| 1. Cargas | Principal o un subagente cargador (uno solo, nunca dos) | Chrome (tu computadora) | Plan de cargas de INSTR 06 sección 2.8, ordenado por Recetas fila 38, más el experimento activo. Una fila de Log BUSCA por carga, en la fila de Config!B103. Para por el presupuesto B91, por B59 filas nuevas, o cambia de grupo tras 5 cargas seguidas sin filas nuevas. |
| 2. RANKEA AÉREO | El principal hace el triage; hasta 3 subagentes pre-chequean y puntúan tandas de grupos (Recetas!D39) | Cualquiera | Arranca en cuanto hay 24 filas Preseleccionadas y sigue en paralelo con la fase 1; al terminar la fase 1 vacía el resto de la cola. El principal asigna los IDs y escribe Productos, Excluidos y Crudo R:S en lote. |
| 3. FILTRA AÉREO | Hasta 3 subagentes en tandas de 4 productos (Recetas!D37) | Cualquiera | Con Config!B106 = Sí, valida la lista de Config!B104 (mayor puntaje primero) hasta el tope B105, sin tocar la casilla de Revisión. Se dispara después de cada tanda de RANKEA que dejó productos nuevos. |
| 4. ALIBABA AÉREO | Subagentes en tandas de 4, uno tras otro (Recetas!D36) | Chrome | Cuando terminó la fase 1: los Top aéreos sin proveedor (Config!B96), empezando por los Top nuevos de la corrida. |
| 5. Juez | Un subagente | Cualquiera | Mide la corrida, da el veredicto del experimento y elige el siguiente (sección 4). |
| 6. Cierre | Principal | Cualquiera | Sesiones!H (qué hizo, cuánto gastó, qué quedó pendiente); una fila en Laboratorio CORRIDAS (primera libre de A35:A94); Mejoras para lo que necesite al dueño; entrega (sección 8). |

**Sin Chrome** (por ejemplo una sesión en la nube): se saltan las fases 1 y 4 y se corren la 2, la 3 y la 5, que vacían la cola. Esa corrida se registra con «Parcial = Sí» y no cuenta para la meta.

## 4. Bucle de prueba y error (el Juez)

1. **Un experimento por corrida** (pestaña Experimentos). El principal lo pasa a «En curso» en la fase 0 y lo aplica en la fase que corresponde. Con dos cambios a la vez no se sabe cuál funcionó.
2. **Medición.** El Juez calcula: créditos (suma de Log BUSCA M de la sesión), filas nuevas, productos nuevos (Productos con el ID de la corrida), **Top nuevos** (Recomendado «Sí» de esos productos después de FILTRA), tasa de Producto de las cargas (productos / filas juzgadas), cola al inicio y al final. Escribe la fila en CORRIDAS.
3. **Veredicto.** *Mantener* si los Top por 100 créditos o los Top nuevos suben, la tasa de Producto no baja de 8% y la cola no crece más de Laboratorio!B8. *Revertir* si la tasa de Producto baja de 8% o los Top por 100 créditos caen más de 30% frente a la mediana de las 3 corridas anteriores (o la línea base). *Seguir midiendo* (máximo 2 corridas más) si no se distingue. Escribe Resultado, Corrida y Notas en Experimentos.
4. **Revertir** es devolver la perilla a su «Valor anterior» y anotarlo en Mejoras.
5. **Perillas que el Juez mueve sin pedir permiso:** Config!B92 (250 a 3000), B93 (3 a 30), B94 (8 a 40), B105 (10 a 80); el orden de regiones y categorías de Recetas fila 38; el tamaño de las tandas (4 a 8; para RANKEA 8 a 10) y los subagentes en paralelo (1 a 3). Todo lo demás (texto de los INSTR, Config!B72 y B91, el puntaje, los estados) queda en Mejoras como «Necesita OK del dueño», con la evidencia.
6. **Siguiente experimento:** el de menor prioridad numérica en «Pendiente». Si no queda ninguno, el Juez propone 3 nuevos a partir de lo que falló en la corrida, con su evidencia, y los agrega como «Pendiente».
7. Cada 5 corridas recalcula Recetas fila 38 con las filas juzgadas nuevas (experimento E-013).
8. **Anti-trampa:** la métrica es «Top nuevos» después de FILTRA, nunca filas ni productos. Un Top no cuenta si luego queda Quemado o Sobreexplotado: el estado lo fija FILTRA.

## 5. Escalabilidad (que funcione siempre, no solo la primera vez)

- Todo el estado vive en la hoja (Laboratorio, Experimentos, Log BUSCA, Cola RANKEA, Crudo, Productos). Ningún agente depende de la memoria del chat.
- El principal solo orquesta: lee únicamente lo listado en la fase 0 y los subagentes devuelven una línea por producto. Así una corrida completa cabe en un chat.
- La ventana de found_time avanza un día por día y el pool se renueva solo; por eso la meta exige corridas en 3 días distintos.
- Rotación: cada corrida dedica 20% de los créditos a explorar (subcategoría × región nueva, o una prueba de Experimentos) y 80% a lo que rinde (Recetas fila 38).
- Capacidad: Crudo (si quedan menos de 300 filas libres, agregar 1.000 con appendDimension antes de volcar); Productos (999 filas: si hay más de 850 usadas, avisar al dueño en la entrega y nunca mover filas); Log BUSCA!X2 (partir en X2 y X3 al pasar 40.000 caracteres); Log BUSCA (agregar 500 filas al pasar 900).
- Un fallo no frena el resto: si un subagente falla, el principal hace esa tanda; si PiPiAds o Alibaba bloquean, sigue con lo demás. Nunca se resuelve ni se esquiva un captcha.
- Si el rendimiento cae después de cumplir la meta, el Laboratorio vuelve solo a EXPERIMENTANDO (sección 6).

## 6. Meta y parada

- **Laboratorio!B4** (fórmula) dice META CUMPLIDA cuando, en las 3 últimas corridas completas: la mediana de Top nuevos es al menos B6; la mediana de Top por 100 créditos es al menos B7; la cola no creció más de B8; no hubo intervención manual ni cierre parcial; y fueron al menos B9 días distintos. Los valores los puede cambiar el dueño.
- **META CUMPLIDA = modo producción:** la corrida usa las mejores perillas, no activa experimentos nuevos salvo 1 de cada 5 corridas (exploración), y el Juez solo vigila.
- Si después alguna condición de la meta deja de cumplirse en las 3 últimas corridas, B4 vuelve sola a EXPERIMENTANDO y se retoman los experimentos.
- Antes de la meta el laboratorio no se detiene: solo se corta el chat por presupuesto de créditos o por contexto lleno, dejando todo escrito.

## 7. Lo que nunca

- Escribir la casilla de Revisión (columnas A y P) o columnas con fórmula; borrar filas; ordenar o mover filas de Productos.
- Dos comandos que usan Chrome a la vez, ni dos subagentes cargando PiPiAds a la vez (pagarían los mismos productos dos veces).
- Estimar un estado de Meta: si no hay búsqueda útil queda «Sin chequear». Ante la duda entre Virgen y Entrando, Entrando.
- Cambiar Config!B91, usar la API de Claude desde scripts o hablar de costos en dinero (INSTR 00).

## 8. Entrega

Tabla corta de los Top nuevos (producto, estrellas, precio de venta, anunciantes en Perú, precio de proveedor); créditos, filas nuevas y productos de la corrida; el experimento medido y su veredicto; el estado del laboratorio (Laboratorio!B4); y «Recomendaciones y cuellos de botella» de INSTR 00 sección 7 (máximo 5 puntos). Cierra con: «Siguiente paso: abre un chat nuevo y escribe BUSCA AÉREO».
