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
