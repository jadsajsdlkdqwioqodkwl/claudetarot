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

## D-009 — Piso de BUSCA AÉREO, créditos y orden de cargas (M-062, M-063), 2026-10-16

- **Aprobado por el dueño** («sí 2 y 3»). Motivo: ventas y videos no predicen el éxito en 297 filas aéreas juzgadas, y el límite es el pool, no los créditos (~97.000 disponibles).
- **Config:** `B92` 2000 -> 1000 · `B93` 20 -> 10 · `B94` 12 -> 25. Las notas C92:C94 conservan la historia.
- **INSTR 06 v3.31:** el paso 1 de la escalera pasa de «ventas mínimas 1500 y luego 1000 (Config B64)» a «500 y videos 5, luego 250 y 3», con control: una carga que dé menos de 8% de filas juzgadas en Producto vuelve al nivel anterior. El plan de cargas se ordena por el ranking de `Recetas` fila 38. «Hoy 1000» del presupuesto pasó a «hoy 3000».
- **Corrección propia:** el piso 1000/10 ya se había leído en US el 12 de octubre, por eso la escalera baja más.
- **M-064 (prefiltro de voluminoso/pesado)** se retiró a «Ya cubierta»: los descartes son títulos de BR.
- **Revertir:** volver `Config!B92:B94` a 2000, 20 y 12 y restaurar el texto anterior del paso 1 (arriba).

## D-010 — Bandas, paginación y RANKEA en tandas (M-067, M-068), 2026-10-16

- **Origen:** revisión de Exploración, Sesiones y Log BUSCA. Hallazgos de EXPLORA del 2026-10-14 sin llevar a las reglas, y dos RANKEA AÉREO del 2026-10-15 cerradas parciales.
- **INSTR 06 v3.32:** (1) escalera por bandas `sales_volume_min` y `sales_volume_max` (500 a 999, luego 250 a 499); (2) «Si el total pasa de 20» pide `current_page=2, 3…` antes de partir por precio; (3) RANKEA en tandas por defecto, subagentes leen `Recetas!D39` e INSTR 03.
- **Textos anteriores:** «léelas con ventas mínimas 500 y videos 5, y si rinden, con 250 y 3.» · «Para no pagar otra vez lo leído con 2000, prueba sales_volume_max=1999 (o 1499) en la URL; si el servidor lo respeta, solo pagas la banda nueva. Si no, parte por precio» · «la URL no tiene página 2. Parte la combinación por precio (8a20, 20a40, 40a80).» · «Modo tandas (si tienes la herramienta de subagentes): el triage (3.1) lo haces tú.» · «lee solo INSTR 03 y esta sección 3.2,».
- **Recetas fila 39:** nueva, instrucciones compactas del subagente de RANKEA.
- **Exploración A12:J19:** cola de 8 pruebas «Por probar».
- **Pendiente de decisión del dueño:** M-069, subir el tope de EXPLORA de 150 a 500 créditos (INSTR 07 §3).

## D-011 — BUSCA AÉREO de punta a punta y Laboratorio (M-070, M-071), 2026-10-16

- **Pedido del dueño:** poder correr un solo «BUSCA AÉREO» que haga todo el flujo de la manera más eficiente encontrada, con un bucle de prueba y error con subagentes que solo se detenga cuando la búsqueda haya mejorado significativamente, y que escale.
- **Hecho:** INSTR 08 nuevo (Drive); pestañas `Laboratorio` y `Experimentos` (ocultas, al final); `Config!B104:B106`; INSTR 00 v4.19 y INSTR 06 v3.33 enlazan a INSTR 08; `Recetas!D39` v2/v3.
- **Autorización registrada:** el dueño autoriza (chat 2026-10-16) que BUSCA AÉREO valide con FILTRA AÉREO y busque proveedor sin esperar su ✅. Interruptor en `Config!B106`. Nunca se escribe la casilla de Revisión.
- **Meta** (editable en `Laboratorio!B6:B9`): 10 Top por corrida, 3,2 Top por 100 créditos, cola que no crece más de 10, 3 corridas sin intervención en 3 días distintos. Se fijó con la línea base (día 1: 17 Top, 1,6 Top por 100 créditos; días 13 a 15: 0 productos).
- **Pilotos:** dos subagentes de solo lectura con grupos reales. Costo medido ~45 mil tokens fijos + ~11 mil por grupo. v1 de D39 devolvió 4 de 6 grupos sin puntuar; v2 resolvió 4 de 4.
- **Texto anterior de D39 (v1):** mandaba leer INSTR 03 y devolver «SIN CHEQUEAR» ante búsquedas sin resultados útiles.
- **Corrección propia durante la sesión:** INSTR 08 §6 prometía volver a EXPERIMENTANDO con una caída bajo 70% de la meta; la fórmula de `Laboratorio!B4` no lo implementa. Se corrigió el texto para que coincida con la fórmula.
- **Revertir:** `Config!B106` = No (la corrida se detiene tras RANKEA y espera ✅); «BUSCA AÉREO SOLO» da el comportamiento anterior; borrar INSTR 08 y restaurar el texto de INSTR 00 §3.
- **No creado (a propósito):** una rutina programada en la nube. Escribiría en la hoja sin supervisión; se activa solo si el dueño lo pide.

## D-012 — Índice vivo en Drive en vez de pegar en el prompt (M-072), 2026-10-16

- **Problema:** el prompt del Project solo se edita a mano en claude.ai; los chats del Project no leen el repo; un chat abrió copias archivadas (INSTR 00 v4.16, INSTR 06 v3.26).
- **Decisión (idea del dueño):** poner el mapa en un documento de Drive que INSTR 00 enlaza. Documento «MAPA del proyecto (índice vivo)», ID `1VR4kTJhNzMZ-dYiCWPJHKMyjbMrO2yY6RvFsFcdWh8s`. INSTR 00 v4.20 agrega, tras «Documentos vigentes», el índice vivo, la prohibición de abrir la carpeta de versiones o títulos «(v…)», y que la lista de «Datos fijos» del prompt puede ir atrasada (usar INSTR 08 sin avisar).
- **Texto anterior de INSTR 00:** «Documentos vigentes: INSTR 00 a INSTR 08 (9 documentos).» (sin más).
- **Mantenimiento:** cada cambio de versión de un INSTR actualiza la tabla del MAPA de Drive y `docs/MAPA.md`.
- **Revertir:** borrar el párrafo de INSTR 00 y el documento MAPA.

## D-013 — Prompt único y corto del Project (M-073), 2026-10-16

- **Problema:** el prompt mandaba buscar los INSTR por título y llevaba una lista de IDs que se atrasa; un chat abrió copias archivadas, otro no abrió INSTR 00 ni supo el ID de la hoja.
- **Decisión:** prompt que abre por ID INSTR 00, INSTR 05 y el MAPA (índice vivo), prohíbe copias archivadas y trae la autorización de subagentes y la línea de BUSCA AÉREO. Texto en `docs/PROMPT-PROYECTO.md` y en el documento de Drive «ARRANQUE del proyecto (pegar en el proyecto de Claude)» (ID `1SCso_Af8OvRbUX1UL2YpmyOPT_ZWVgAeBvi1xFqApws`).
- **Texto anterior:** documento de Drive «ARRANQUE del proyecto (v2026-10-06)» (ID `1PW8x2UjdMlcsHrOD8P6HTM905kgBrt-j-gNrIovsCe0`), renombrado para que cuente como copia archivada. Su paso 1 buscaba `parentId = '1pm8…' and title contains 'INSTR'` y su paso 2 leía INSTR 00 e INSTR 05.
- **Arreglos menores en INSTR 00:** «hoy 1000 cada uno» pasó a «hoy 3000 cada uno» (B66 y B91) y `Config!A85:C100` a `A85:C106`.
- **Pendiente del dueño:** pegar el texto en claude.ai > Project > Instructions (no se puede editar desde aquí).

## D-014 — Primera corrida real: el principal solo orquesta; filtro de Crudo!P del carril aéreo (M-074, M-075, M-076), 2026-10-16

- **Qué pasó:** la primera corrida real de BUSCA AÉREO (`2026-10-15-x`) hizo 1 carga y cerró parcial por falta de contexto, sin subagentes. El principal había leído INSTR 00, 05, MAPA, INSTR 08, INSTR 06 completo (~16 mil tokens: `read_file_content` no lee secciones), Config, Laboratorio, Experimentos, Log BUSCA, X2 y Recetas 31 a 39 porque INSTR 08 fase 0 se lo mandaba. Error de diseño mío.
- **Dato bueno:** US autorep, ventas 500 a 999, videos 5 o más: 8 filas nuevas por 8 créditos, 0 repetidos. La banda funciona.
- **Dato malo (más importante):** esas filas quedaron con `Crudo!P` = «No». La fórmula exigía `found_time` válido en L y ventas y videos de `Config!B64` y `B65` (1000 y 10) para todas las filas de TikTok Shop, incluido el carril aéreo; por eso lo cargado bajo 1000 ventas, o sin fecha, nunca llegaba a la Cola de RANKEA. M-062 (bajar B92 y B93) no tenía efecto aguas abajo.
- **Cambios:**
  1. `Crudo!P1`: en el carril A (columna B = A) el filtro lee `Config!B92` y `B93`. Neutro con B92 = B64 y B93 = B65 (la cola siguió en 3 y 124). Prueba: fila 4699 con L de prueba pasó a «Sí» y la cola subió a 125; la fecha de prueba se restauró a `s/d`. **Fórmula anterior** en `Experimentos!E15` y abajo.
  2. `Config!B92` 1000 -> 500 y `B93` 10 -> 5 (E-002).
  3. INSTR 08 v1.1: el principal lee solo Config, Laboratorio y Experimentos; subagente cargador por lotes (`Recetas!D40`); corrida mínima (5 cargas, una tanda de RANKEA, una de FILTRA, el Juez).
  4. INSTR 00 v4.21: en BUSCA AÉREO el principal no abre INSTR 06 ni lee el Log.
  5. INSTR 06 v3.34: la ventana de found_time ya no está fija (antes «2026-04-16 hasta 2026-09-13, nunca otra»): va de hoy − B71 a hoy − B72 y avanza.
  6. `Recetas!D40`: found_time (L) obligatorio; completar L, O y T de filas existentes con `s/d`.
- **Registro honesto:** la corrida se anotó en `Laboratorio` CORRIDAS como C-001 con «Parcial = Sí» (no cuenta para la meta).
- **Fórmula anterior de `Crudo!P1` (para revertir):**
  `=VSTACK("Pasa filtro ganador",LET(age,ARRAYFORMULA(IFERROR(TODAY()-DATEVALUE(L2:L),-1)),okmax,ARRAYFORMULA(((age<0)+(age<=Config!$B$71))>0),oktt,ARRAYFORMULA((age>=Config!$B$72)*(age<=Config!$B$71)),ARRAYFORMULA(IF(LEN(F2:F),IF(LEN(O2:O),IF((IFERROR(O2:O*1,0)>=Config!$B$64)*((LEN(T2:T)=0)+(IFERROR(T2:T*1,0)>=Config!$B$65)>0)*oktt,"Sí","No"),IF((IFERROR(I2:I*1,0)>=Config!$B$61)*(IFERROR(J2:J*1,0)>=Config!$B$62)*(IFERROR(K2:K*1,0)>=Config!$B$63)*okmax,"Sí","No")),))))`
- **Pendiente:** las 8 filas de la primera carga (`Crudo` A4699:A4706) siguen en «No» hasta que una carga con su found_time complete L; la siguiente corrida las completa por la regla de D40.

## D-015 (2026-10-16) Dedupe posterior en la hoja, cola primero

- **Evidencia:** corrida 2026-10-15-y: 166 filas nuevas, pero el cargador no pudo pasar X2 (~2.400 IDs) al navegador; 23 créditos sin filas. Comprobado en la hoja: 0 IDs repetidos entre las 166 filas. Cola aérea 124 -> 190.
- **Cambio:** `Recetas!D40` v2 (no usar X2, escribir toda carga pagada, marcar `Duplicado: ya en fila N` en Crudo!R, verificar min<=max, probar paginación comparando IDs). INSTR 06 v3.35 (X2 y current_page). INSTR 08 v1.2 (si Config B100 > 60, máximo 3 cargas y RANKEA/FILTRA primero).
- **Para revertir:** el texto anterior de D40 está en el historial de versiones de la celda (Recetas!D40) y en el commit anterior de esta carpeta; INSTR 06 v3.34 y INSTR 08 v1.1 en el historial de Drive.
- Anotado en Sheet: Mejoras M-077 a M-079, Experimentos E-005, Laboratorio C-002.

## D-016 (2026-10-16) FILTRA en tandas de 3 y AR no da Sí con validación parcial

- **Evidencia:** corrida 2026-10-15-z: 6 tandas de FILTRA (8 a 10 productos) salieron parciales; 9 filas con Recomendado «Sí» falso porque Productos!AV (escrito en el parcial) bastaba para la fórmula AR; 90 créditos de Firecrawl sin validar.
- **Cambio:** `Productos!AR1` ahora devuelve «Pendiente validación» si AL contiene «parcial» o «corte» (antes solo «corte»). `Recetas!D37` regla v2 (un producto a la vez, máx. 3, escribir solo si terminó). INSTR 08 v1.3.
- **Para revertir:** en AR1 quitar `+ISNUMBER(SEARCH("parcial",AL2:AL))` y el `(...)>0`; D37: quitar el párrafo «REGLA v2» del inicio.
- Sheet: Mejoras M-080, M-081; Laboratorio C-003; Sesiones H872.

## D-017 (2026-10-16) AR lee AV con LEFT; orquestador no pregunta; Laboratorio!H intocable

- **Evidencia:** corrida 2026-10-16-a: FILTRA completó 11 de 14 con tandas de 3, pero Productos!AR dio «No» a todos porque exigía `AV="Sí"` exacto y los subagentes escribieron «Sí (ventas…)». Laboratorio!B4 daba #REF! por valores escritos en H36:H37. El orquestador cerró con una pregunta.
- **Cambio:** `Productos!AR1`: `AV2:AV="Sí"` pasa a `LEFT(AV2:AV,2)="Sí"` (resultado: 9 Recomendado Sí). Laboratorio!H36:H37 vaciadas. INSTR 08 v1.4 (no pregunta; H de CORRIDAS intocable).
- **Para revertir AR:** volver a `(AV2:AV="Sí")`. Sheet: Mejoras M-082, M-083; Laboratorio C-004.

## D-018 (2026-10-16) Dedupe por ID automático en Crudo!P

- **Evidencia:** corrida 2026-10-16-b: los cargadores dejaron 49 IDs repetidos sin marcar (Crudo 4900-5046) y sin `R = Pendiente` desde la fila 4908.
- **Cambio:** `Crudo!P1` devuelve «No» si el ID (col. E) ya aparece en una fila anterior (`IFERROR(MATCH(E2:E,E2:E,0),0)<ROW(E2:E)-1`). Las filas 4699:4706 (s/d) recibieron su found_time y 4900:4907 quedaron como duplicadas. R de 4900:5046 escrita por Claude Code (49 «Duplicado», 98 «Pendiente»).
- **Para revertir:** quitar el `IF(IFERROR(MATCH(...))<ROW(...)-1,"No", ... )` interno de la fórmula; la versión anterior es la de D-014 con B92/B93.
- Sheet: Mejoras M-084.

## D-019 (2026-10-16) RANKEA: máximo 10 grupos por subagente, tandas sucesivas

- **Evidencia:** corrida 2026-10-16-b: un subagente de RANKEA con 40 grupos hizo el pre-chequeo de Meta y no puntuó ni escribió nada; el orquestador preguntó «¿sigo así?».
- **Cambio:** INSTR 08 v1.5: nunca más de 10 grupos por subagente; tandas sucesivas sin preguntar hasta Config!B100 <= 60; un parcial se relanza. Revertir: quitar la frase añadida en la fase 2.

## D-020 (2026-10-16) FILTRA ligero: terminar con Meta MCP, Firecrawl solo para candidatos a Virgen

- **Evidencia:** corrida 2026-10-16-b: RANKEA completó (cola 224 -> 59, 77 productos nuevos) pero las tandas de FILTRA (tres filas) salían parciales y costaban ~150.000 tokens cada una; 0 de 5.000 créditos de Firecrawl usados porque la receta lo exigía solo para inactivos y los subagentes se quedaban sin contexto antes.
- **Cambio:** `Recetas!D37` v3: un producto termina con Fase A + rondas 1-3 de Meta MCP + AS + AV + AI, sin Firecrawl; los candidatos a Virgen (0 o 1 anunciante) se dejan con AD:AF vacíos y nota «Candidato Virgen…» para una pasada única con Firecrawl; AV se escribe exacto «Sí»/«No». INSTR 08 v1.6: FILTRA no se pausa ni pregunta.
- **Para revertir:** el texto anterior de D37 es la regla v2 de D-016 (quitar el párrafo «REGLA v3»).

## D-021 (2026-10-16) FILTRA escribe celdas sueltas (no rangos que crucen AT:AU)

- **Evidencia:** en 2026-10-16-b, FILTRA escribió el rango AS:AV de la fila 325 y borró AT y AU (primer anuncio visto y señal de novedad, de RANKEA). Restauradas a mano desde la nota de la fila.
- **Cambio:** `Recetas!D37` v3.1: AS y AV en celdas sueltas; nunca un rango que cruce AT o AU.

## D-022 (2026-10-16) Carril de Crudo corregido y Recetas D40 v3

- **Evidencia:** 48 filas del lote 2 de 2026-10-16-b (Crudo 4999-5046) tenían el ID de sesión en la columna B y no entraban a la cola; al corregirlas Config!B100 pasó de 59 a 102.
- **Cambio:** Crudo!B4999:B5046 = «A». `Recetas!D40` v3 (B = letra A, nunca el ID de sesión; R = Pendiente en todas las filas; el dedupe lo hace Crudo!P).
- **Pendiente:** ALIBABA (requiere Chrome conectado), exclusión de «no apto aéreo» en Config!B104, escala de la columna X. Ver Mejoras M-085, M-086.

## D-023 (2026-10-16) Las 24 filas «Producto» de 2026-10-16-c eran correctas; D40 v4

- **Verificado:** las 24 filas de Crudo R:S con «RANKEA AÉREO 2026-10-16-c: pasa a Productos» (4468…4913) tienen su ID de anuncio en un link de Productos!K: no hubo escritura por error, no se restaura nada.
- **Cambio:** `Recetas!D40` v4: no pagar bandas cuyo piso sea menor que Config!B92 (250-499 con B92=500 nunca pasa Crudo!P); no repetir combinaciones con más de la mitad de repetidos; el cargador nunca toca P ni Q.

## D-024 (2026-10-17) Recetas D37 v3.2: celdas numéricas y escala de X

- **Evidencia:** sesión 2026-10-16-c: FILTRA escribió texto en AE («10 por muestra», «25+»), no escribió Y en cortes y la columna X (P7B) nunca se llenó por falta de escala; el principal tuvo que escribir Chequeo Meta y Excluidos porque los subagentes no tienen permiso.
- **Cambio:** AD/AE/AF enteros o vacíos; corte escribe Y = 0; X con escala 0/1/2 (alternativa en retail peruano); Chequeo Meta/Excluidos los escribe el principal. Revertir: quitar el párrafo «REGLA v3.2» y la escala de X.

## D-025 (2026-10-17) ALIBABA: regla de oro y paso 4b para precios

- **Evidencia:** sesión 2026-10-16-c: la búsqueda por foto funciona y encuentra proveedores, pero el script F de Recetas!E30 devolvió la lista de precios vacía (Alibaba cambió el HTML); el orquestador no escribió nada y preguntó si lanzar tandas o parar.
- **Cambio:** `Recetas!D36`: nunca dejar una fila sin escribir (foto, links y nota aunque BA = s/d); paso 4b con el script F2 de respaldo (JSON del HTML + precios visibles + tramos) y get_page_text; precios solo en S/ se anotan en BE. INSTR 08 v1.7: ALIBABA en tandas de 3, un subagente a la vez, sin preguntar. El script F2 NO está probado: la primera corrida lo valida.
- **Revertir:** quitar el paso 4b y la regla de oro de D36; el texto anterior es el de M-052.

## D-026 (2026-10-17) Reversión del Juez deshecha: B92 = 500 y B93 = 5

- **Evidencia:** C-006 (2026-10-16-c) revirtió E-002 con una tasa de Producto de 3/84 que cuenta como «sin producto» las 84 filas que RANKEA no había juzgado; los 14 Top de C-005 salieron de la banda 500-999. Log BUSCA S daba 0 en esas cargas.
- **Cambio:** Config!B92 = 500, B93 = 5 y Experimentos E-002 = «En curso» (restaurados por Claude Code). Mejoras M-087. Regla pendiente para el Juez: no revertir con filas nuevas sin juzgar.

## D-027 (2026-10-17) Vista «Aéreo por lotes», cola con lo nuevo primero, Log S, B104 y corrida larga

- **Pedido del dueño:** presentar los productos aéreos por lotes para no perder los nuevos, y dejar todo listo para una corrida larga con muchos créditos.
- **Cambios en el Sheet:** pestaña nueva visible `Aéreo por lotes` (QUERY sobre Productos con Workflow = Aéreo, agrupado por Productos!B, orden por ID descendente; selector de lote y de «solo Sí»). `Log BUSCA` S/T/W aceptan el código con o sin «A|» (daba 0 porque Crudo!D no lleva el prefijo). `Cola RANKEA`: orden Estado (Preseleccionado primero) y luego fila de Crudo descendente. `Config!B104`: excluye notas con «no apto». Config B92 = 500 / B93 = 5 restaurados (D-026). Experimentos E-001 = «Reemplazado por E-002».
- **Cambios en Drive:** INSTR 08 v1.8 (corrida larga por ciclos con punto de control en Sesiones!H; el Juez no revierte con filas sin juzgar y mide por lote). MAPA actualizado.
- **Revertir:** Cola RANKEA A2: volver a `SORT(...,2,FALSE,11,FALSE,10,FALSE,7,FALSE)`; B104: quitar `ISERROR(SEARCH("no apto",...))`; Log S/T/W: quitar el segundo COUNTIFS con MID; pestaña: borrar «Aéreo por lotes».

## D-028 (2026-10-17) Decisiones tras el test: pool agotado, B72 = 21, EXPLORA 500, AV automático

- **Evidencia (sesión 2026-10-17-a):** 33 créditos dieron 22 filas nuevas; el lote 2 (GB/ES/MX) dio 0 porque esas regiones están casi vacías; solo 1 Top. El cuello ya no es el flujo, es el pool de PiPiAds. Resultados de corridas anteriores: ni Quemados ni WINNER hacen falta para tener Top.
- **Aprobado por Claude Code (autorizado por el dueño tras el test):** E-012 → `Config!B72` 30 → 21 (revertir: 30); M-069 → INSTR 07 tope 150 → 500 créditos; AV automático «Sí» en el carril aéreo (`Recetas!D37` v3.3); `Recetas!D40` v5 con PLAN AMPLIADO y parada a las 8 cargas vacías; INSTR 08 v1.9.
- **Rechazado:** E-010 (contar inactivos en el pre-chequeo) y E-011 (sacar recompra del puntaje): sin evidencia de que hagan falta.
- Sheet: Mejoras M-088 a M-090, Experimentos E-010..E-012.

## D-029 (2026-10-17) Login de PiPiAds no frena la corrida

- **Evidencia:** sesión 2026-10-17-b: PiPiAds pedía iniciar sesión en el Chrome conectado; el orquestador se detuvo y preguntó si correr RANKEA/FILTRA mientras tanto.
- **Cambio:** INSTR 08 v1.10: sin sesión en PiPiAds el principal no pregunta; sigue con RANKEA, FILTRA y ALIBABA (corrida parcial) y pide el login al final; `sigue` retoma las cargas.

## D-030 (2026-10-17) El pool no se agotaba: faltaba leer todas las páginas (Recetas D40 v6)

- **Pregunta del dueño:** por qué se acaba el pool si EXPLORA lo iba a ampliar.
- **Hallazgo:** Log BUSCA (2026-10-16-c) muestra total 543 / 947 / 732 con solo 20 filas leídas por combinación (página 1). El cargador solo pagaba la primera página y llamaba «pool agotado» a eso. Quedan unas 2.000 filas por leer en el piso actual (500) a ≈1 crédito por fila.
- **Cambio:** `Recetas!D40` v6 «Cobertura completa» (paginar con recarga o partir por precio y por found_time hasta cubrir el total; el plan ampliado va después). INSTR 08 v1.11. Mejoras M-091.
- **EXPLORA** (regiones SG/PH/MY/IE, orden por crecimiento, categorías sin leer) sigue pendiente: necesita el Chrome del dueño en un chat aparte, ahora con tope de 500 créditos.

## D-031 (2026-10-17) Cobertura por ventanas de fecha, RANKEA siempre se escribe, el piso lo manda B92

- **Evidencia (sesión 2026-10-17-c):** 236 créditos, 59 filas nuevas: `current_page` no pagina (2 cargas perdidas, 40 créditos); partir solo por precio dentro de la misma ventana trajo 88 repetidas de 147. El orquestador no escribió el triage de RANKEA «por ser estimado» y cerró parcial. Tres dudas de reglas.
- **Cambios:** `Recetas!D40` v7 (no paginar; partir `found_time` en trozos de 14, 7 y 3 días y solo después por precio; se escriben todas las filas, también las que están fuera de ventana, que Crudo!P deja en espera). INSTR 08 v1.12: el principal siempre escribe RANKEA (precio y peso son estimados por diseño), el piso lo manda `Config!B92` (E-002 = banda 500-999; 250-499 solo cuando el Juez baje B92), lo que se deduplicó de más no se recupera.
- **Revertir:** quitar los párrafos añadidos; D40 anterior = v6 (D-030).

## D-032 (2026-10-17) Reestructura: el subagente de RANKEA escribe, el principal solo reserva bloques

- **Evidencia (sesión 2026-10-17-d):** ~760 créditos cargados, RANKEA devolvió su primera tanda y el orquestador no la escribió en Productos y preguntó «¿sigo o cortas aquí?». Segunda vez que el paso de «copiar lo que devuelve el subagente» se pierde en el principal.
- **Cambio:** `Recetas!D39` v4: el subagente recibe `FILA_INICIAL` e `ID_INICIAL` (bloque de 10 propio), escribe él sus filas de Productos (solo columnas no-fórmula, nunca AD:AF) y marca Crudo R:S de todas sus filas; devuelve una línea por grupo. INSTR 08 v1.13: el principal reserva bloques, cuenta `Config!B100`, copia SOBREEXPLOTADO a Excluidos y sigue; prohibido preguntar «¿sigo o corto?» o cerrar por «datos estimados».
- **Revertir:** `Recetas!D39` v3 (el subagente devuelve, el principal escribe) + quitar el párrafo v1.13 de INSTR 08.

## D-033 (2026-10-18) «INICIA AEREO» = BUSCA AÉREO y EXPLORA integrada como fase 1B

- **Pregunta del dueño:** si EXPLORA ya exploró todo y qué falta para que un solo comando dé todo.
- **Hallazgo:** EXPLORA corrió una sola vez (2026-10-14-e). En la hoja Exploración quedan 11 pruebas «Por probar» (regiones SG/PH/MY/IE y otras, orden por crecimiento, subcategorías no leídas, Pages:100, banda 500-999, ficha de producto, búsqueda por texto) y nunca se corrieron; EXPLORA no formaba parte de BUSCA AÉREO.
- **Cambio:** INSTR 08 v1.14: alias «INICIA AEREO»; fase 1B corre hasta 6 pruebas de Exploración (tope 150 créditos) cuando quedan más de 300 créditos; el principal lee que D39 sea v4 y D40 v7, y escribe nota de Sesiones y Laboratorio aunque la corrida sea parcial. ARRANQUE del proyecto actualizado. Sesiones fila 880 (-d) cerrada con nota.
- **Revertir:** quitar el párrafo v1.14 de INSTR 08 y la frase de alias del ARRANQUE.

## D-034 (2026-10-18) Lazo de EXPLORA: los hallazgos entran al plan de carga

- **Pregunta del dueño:** en qué parte del loop los hallazgos de EXPLORA amplían los parámetros o lugares de búsqueda.
- **Hallazgo:** no había punto de integración. La columna «Uso sugerido» de Exploración era solo una nota; el cargador no leía esa pestaña y los cambios al plan los hacía MEJORA a mano.
- **Cambio:** `Recetas!D40` v8 (el cargador lee Exploración A:K, carga primero las recetas Confirmada/Parcial con K vacía, las marca «Integrada» y sube regiones/categorías nuevas a Recetas D38). INSTR 08 v1.15 (el Juez marca «Agotada» lo que rinde menos que el plan base). Columna K de Exploración = estado de integración.
- **Revertir:** quitar el párrafo inicial de D40 v8 y el párrafo v1.15 de INSTR 08.

## D-035 (2026-10-18) Prohibido cerrar parcial por «no cabe en este chat»

- **Evidencia (sesión 2026-10-18-a):** el principal hizo solo la fase 1 (74 créditos, 54 filas), dijo que RANKEA, FILTRA, ALIBABA y el Juez «no caben bien en este chat» y cerró como parcial. Es la tercera corrida seguida que se detiene por una razón distinta (pregunta, no escribir RANKEA, falta de espacio). Además llamó una herramienta de borrado por error (falló, no tocó nada) y no pudo marcar Exploración K por no existir la columna.
- **Cambio:** INSTR 08 v1.16: el principal es solo coordinador, delega todo a subagentes y lee solo su línea final; el cierre parcial solo vale por orden del dueño, Chrome/PiPiAds sin sesión (tras hacer lo que no los necesita), presupuesto agotado o error repetido 3 veces; con cola > 60 la fase 2 va antes de más cargas. Nota: la fecha de `Crudo!L` no coincide con el filtro de ventana de PiPiAds (casi todas ~hoy-31 d), pero los totales y los productos sí cambian por ventana: no es motivo de parar. Exploración ahora tiene la columna K.
- **Observación abierta:** el prefiltro de `Recetas!E31` marca «dress» dentro de «Address» (sin límite de palabra); 14 de 54 filas cayeron en prefiltro, varias con razón (Halloween, Christmas) y alguna de más.
- **Revertir:** quitar el párrafo v1.16 de INSTR 08.

## D-036 (2026-10-18) RANKEA en paralelo y chico (Recetas D39 v5, INSTR 08 v1.17)

- **Evidencia (sesión 2026-10-18-b, ya con el texto de proyecto nuevo):** el chat trabajó solo 8 tandas de RANKEA, 43 productos (261018-A-001 a 043), pero cada subagente se quedó sin contexto tras 1 o 2 grupos (Meta devuelve texto largo) y el principal cerró parcial con la cola en 430, llamando «error de herramienta repetido» a lo que era falta de contexto. Además le pasó al cargador datos de Config equivocados (fila de sesión, cola, fila de Log).
- **Cambio:** `Recetas!D39` v5 (máx. 4 grupos por subagente, escribir cada grupo antes del siguiente, Meta con limit 8/5 y máx. 2 frases, leer solo las filas propias de la Cola). INSTR 08 v1.17: tres subagentes a la vez con bloques distintos, relanzar si uno se queda sin contexto, limpieza en bloque de filas con `[prefiltro:` antes de la primera tanda, releer Config justo antes de pasar datos.
- **Revertir:** quitar el párrafo inicial de D39 v5 y el v1.17 de INSTR 08; limit 25/10 como antes.
