# Buscador de Productos — mejoras pendientes de aplicar (auditoría 2026-10-14)

> Todo es en Google Drive/Sheets (no en este repo). Sheet `1DlLjVSqA3bs26xLrXxTFXGpdSdCA8_Cwz1hY0Nzhsd0`,
> carpeta `1pm8A0Zltc1CEGW4Exg3EuKDgoAUuLyR8`, versiones viejas en la carpeta `1HtyOttQaEvvfh07Jm-DF9altfXcuWZNM`.
> Lee la skill google-workspace antes de escribir. Edita los INSTR **en su lugar** con el conector de Google Docs
> (replaceAllText anclado en frases únicas; nunca recrees el doc desde texto: pierde tablas y formato).
> Al terminar, marca cada punto como hecho al final de este archivo y súbelo.

## Ya hecho (2026-10-14, sesión de auditoría)

- Respaldos: «INSTR 00 … (v4.10)» y «INSTR 06 … (v3.13)» en Versiones anteriores.
- Pestaña **Mejoras** creada (índice 7, visible, sheetId 17, 14 columnas, fila 1 congelada, listas en J = Bajo/Alto y K = Propuesta/Aprobada/Aplicada/Rechazada/Ya cubierta). **Falta escribir el encabezado y las filas.**
- `Log BUSCA`: +2 columnas (ahora hasta AH) y fórmula en **W1** (pendientes de RANKEA por carga).

## 1. Hoja

### 1a. `Log BUSCA`!Z1 (reemplaza la fórmula; agrega AG y AH)

```
=ARRAYFORMULA(LET(h,{"Combinación (región · nombre · precio), de mejor a peor rendimiento","Cargas","Créditos","Filas nuevas","Créditos por fila nueva","Llegaron a Productos","Ventanas leídas: desde..hasta (total/créditos v=ventas mín.)","Pendientes de RANKEA (si es más de 0, AE y AH todavía no dicen nada)","Créditos por producto que llegó (solo con AG = 0)"},r,C2:C1000,key,r&" · "&D2:D1000&" · "&F2:F1000,win,TEXT(I2:I1000,"yyyy-mm-dd")&".."&TEXT(J2:J1000,"yyyy-mm-dd")&" ("&L2:L1000&"/"&M2:M1000&" v"&G2:G1000&")",cr,M2:M1000,fi,S2:S1000,pr,T2:T1000,pe,W2:W1000,IFERROR(LET(u,UNIQUE(FILTER(key,r<>"")),car,MAP(u,LAMBDA(x,SUM(--(key=x)))),c,MAP(u,LAMBDA(x,SUM(FILTER(cr,key=x)))),q,MAP(u,LAMBDA(x,SUM(FILTER(fi,key=x)))),pp,MAP(u,LAMBDA(x,SUM(FILTER(pr,key=x)))),pd,MAP(u,LAMBDA(x,SUM(FILTER(pe,key=x)))),cpf,MAP(c,q,LAMBDA(a,b,IF(b>0,ROUND(a/b,1),"sin filas"))),cpp,MAP(c,pp,pd,LAMBDA(a,b,d,IF(d>0,"falta RANKEA",IF(b>0,ROUND(a/b,1),IF(a>0,"0 productos","sin filas"))))),ord,MAP(c,q,LAMBDA(a,b,IF(b>0,a/b,9999+a))),w,MAP(u,LAMBDA(x,TEXTJOIN("; ",TRUE,FILTER(win,key=x)))),VSTACK(h,SORT(HSTACK(u,car,c,q,cpf,pp,w,pd,cpp),ord,TRUE))),h)))
```
Verifica que Z1:AH salga sin #ERROR y que AG/AH tengan datos.

### 1b. Recetas!E30 — prefiltro nuevo

Reemplaza solo el regex dentro de `window.__noaereo = /…/i;` por el de abajo (probado: 21 títulos que deben pasar pasan —coffee grinder, tea infuser, ice cream scoop, food storage, toilet brush, foil cutter, oil sprayer, soap dispenser, vacuum cleaner…— y 17 que deben caer caen). Al final del comentario agrega: `(2026-10-14: comida y bebida ya no tumban utensilios de cocina; + oil, soap, cleaner, fluid, endoscope, borescope, smart, portable charger con excepciones; spray solo palabra entera)`.

```
supplement|vitamin|gumm|capsule|probiotic|collagen|protein(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|serum|(?<!ice )cream(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|lotion|shampoo|conditioner|skin ?care|makeup|lipstick|perfume|cologne|deodorant|toothpaste|whiten|\btea\b(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|coffee(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|snacks?(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|food(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|candy(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|\btreats?\b(?! ?(container|storage|grinder|maker|scoop|infuser|kettle|dispenser|scale|frother|chopper|processor|warmer|clip|sealer|press|filter|scraper|mold|mould|server|tray|bowl|box|holder|dryer|dehydrator|jar|canister|spoon|whisk|tamper|dripper|brewer|cutter|slicer|rack|pot|cup|mug|tumbler|bottle|shaker|thermos|lid|cover|tongs|spatula|pan))|\btoys?\b|lego|doll|plush|baby|infant|pacifier|diaper|insecticide|repellent|pesticide|thermometer|blood pressure|oximeter|bluetooth|wi-?fi|earbud|headphone|headset|speaker|smart ?watch|tracker|walkie|drone|\brc\b|remote control|router|dash ?cam|power ?bank|jump starter|battery pack|spare batter|lithium batter|power station|generator|solar panel|aerosol|\bsprays?\b(?! ?(bottle|nozzle|mop|gun|head))|liquid|detergent|degreaser|ceramic coating|tire shine|car wax|lighter|fuel|nail polish|shirt|dress|legging|jeans|pants|shorts|hoodie|sweater|jacket|\bsocks?\b|\bbra\b|underwear|lingerie|swimsuit|bikini|\bshoes?\b|sneaker|sandal|slipper|\bboots?\b|\bhat\b|beanie|\bwig\b|jewel|necklace|earring|bracelet|handbag|purse|\bbook\b|notebook|journal|planner|sticker|\bpens?\b|pencil|marker|crayon|calendar|poster|wall art|canvas|\bdecor|vase|artificial (flower|plant)|curtain|\brug\b|carpet|pillow|blanket|bedding|duvet|candle|incense|wax melt|\bfans?\b|halloween|christmas|suplement|vitamina|crema|creme|loção|brinquedo|juguete|beb[eêé]|fone de ouvido|aud[ií]fono|parlante|caixa de som|bater[ií]a|camiseta|vestido|calça|sapato|t[eê]nis|chinelo|zapat|sandalia|livro|libro|caderno|cuaderno|caneta|bol[ií]grafo|adesivo|pegatina|decora[cç]|cortina|tapete|alfombra|almohada|travesseiro|cobertor|manta|ventilador|\bvela\b|navidad|natal|\boils?\b(?! ?(dispenser|sprayer|bottle|pourer|brush|filter|drain|pan|catch|funnel|extractor|change|pump|mister|can|skimmer))|\bsoaps?\b(?! ?(dispenser|holder|dish|tray|box|pump|saver|bag|rack))|(?<!(vacuum|pool|window|keyboard|lint|shoe|grill|gutter) )cleaners?\b(?! ?(brush|tool|kit|gun|pad|cloth|machine))|\bfluids?\b|endoscope|borescope|\bsmart\b|portable charger|battery charger|magnetic battery
```

### 1c. Recetas!D30 — dos pasos nuevos

- En el paso 6, después de «saltar los IDs de 'Log BUSCA'!X2»: `Cárgalos UNA vez por sesión: localStorage.setItem('__vistosA', '<X2>') y en cada carga window.__vistos = new Set((localStorage.getItem('__vistosA')||'').split(',')); suma a localStorage los IDs nuevos que escribas. No los pegues en cada carga (gasta contexto). X2 tiene tope de ~2.500 IDs (50.000 caracteres por celda): si pasa de 40.000 caracteres, avisa en Mejoras.`
- En el paso 7: `En R anota también qué palabras del prefiltro tumbaron títulos (ej. prefiltro: spray 3, smart 2).`

### 1d. Pestaña Mejoras

Encabezado A1:N1: ID · Fecha · Sesión · Comando · Problema (qué frenó, con dato) · Cambio propuesto (exacto) · Dónde (INSTR y sección, o celda) · Evidencia (fila de Log, Sesiones o Crudo) · Veces propuesta · Riesgo · Estado · Aplicada el · Versión resultante · Notas / resultado medido después.

Filas (fecha 2026-10-14; comando BUSCA AÉREO salvo que diga otra cosa; las «Aplicada» llevan L = 2026-10-14 y M con la versión):

| ID | Sesión | Problema | Cambio | Dónde | Evidencia | Riesgo | Estado |
|---|---|---|---|---|---|---|---|
| M-001 | sesión de BUSCA AÉREO del 13/10 (Sesiones fila 74) | La primera carga se pagó sin leer el Log y repitió 2 productos | Leer Log y armar el plan antes de abrir PiPiAds | INSTR 00 §6 paso 5 | Log BUSCA 121–162 | Bajo | Aplicada (INSTR 00 v4.11) |
| M-002 | ídem | Log no comparable entre ventas 1000 y 2000 | No separar (lo leído con 1000 incluye lo de 2000: se pagaría dos veces); mostrar v=ventas en cada ventana del resumen | Log BUSCA Z1 | utensilios US 2/2 vs 9/9 | Bajo | Aplicada (fórmula Z1) |
| M-003 | ídem | Pegar los IDs vistos en la página costó mucho contexto | Cargarlos una vez en localStorage | Recetas D30 paso 6 | — | Bajo | Aplicada |
| M-004 | ídem | celacc, limpieza y deporacc rinden 1 útil cada 15–20 créditos | No hace falta lista fija: la regla de Config B94 ya frena limpieza/deporacc; celacc llevó 2 a Productos | Recetas F30 | Log resumen | Bajo | Ya cubierta |
| M-005 | ídem | El prefiltro dejó pasar power banks, líquidos y cámaras | Sumar charger/fluid/endoscope/borescope/cleaner/oil/soap/smart **con excepciones**: oil tumbaba toilet y foil, soap los dispensadores, cleaner las aspiradoras | Recetas E30 | prueba con 38 títulos | Bajo | Aplicada |
| M-006 | auditoría | Contradicción: INSTR 00 «En BUSCA, lo primero es PiPiAds» contra INSTR 06 2.8 «Lee al empezar» | Unificar (ver M-001) | INSTR 00 §6 / INSTR 06 2.8 | — | Alto | Aplicada |
| M-007 | auditoría | Se optimiza créditos por fila en Crudo, pero lo que vale es lo que llega a Productos (US aereo9: 18,6 por fila pero 10 productos; US electrico: 1 por fila y 0) | Columnas AG (pendientes de RANKEA) y AH (créditos por producto); plan de cargas prioriza AH | Log Z1, INSTR 06 2.8 | Log resumen | Alto | Aplicada |
| M-008 | auditoría | «Llegaron a Productos» va con retraso: toda carga nueva sale 0 hasta que corre RANKEA | Ignorar AF/AH mientras AG > 0 | INSTR 06 2.8 | ventanas 04-16..09-13 todas en 0 | Bajo | Aplicada |
| M-009 | auditoría | El prefiltro tumbaba utensilios de cocina (food, coffee, tea, cream, snack, protein) | Excepciones por palabra de utensilio | Recetas E30 | prueba de títulos | Bajo | Aplicada |
| M-010 | auditoría | Lo que tumba el prefiltro no queda registrado: falsos negativos invisibles | Anotar en Log R qué palabras tumbaron | Recetas D30 paso 7, INSTR 06 2.8 | — | Bajo | Aplicada |
| M-011 | auditoría | X2 tiene tope de ~2.500 IDs por celda (hoy ~400) | Avisar al pasar 40.000 caracteres; luego partir en X2/X3 | Recetas D30 | — | Bajo | Propuesta |
| M-012 | auditoría | Las recomendaciones se perdían en el chat | Pestaña Mejoras + comando MEJORA | INSTR 00 §3, §7; INSTR 06 §6 | — | Alto | Aplicada |

## 2. INSTR 00 → v4.11 (doc `1jZCQy6a6w2PsZTOHxee0yNjlMrrmfaYk9WzO31F3i9A`)

replaceAllText, cada uno debe dar 1 ocurrencia (si da 0, busca el texto exacto con read_doc):
1. `Versión 4.10 · 2026-10-12` → `Versión 4.11 · 2026-10-14`
2. `En BUSCA, lo primero es PiPiAds.` → `En BUSCA, lo primero es PiPiAds. En BUSCA AÉREO no: primero lees 'Log BUSCA' (INSTR 06, 2.8, «Lee al empezar») y pones en la lista de tareas el plan de cargas (subcategoría, región, precio y ventana de cada una, sin claves que ya estén en 'Log BUSCA'!V); recién entonces abres PiPiAds.`
3. `Si el usuario escribe otra cosa:` → `MEJORA aplica las propuestas de la pestaña Mejoras a los INSTR, Recetas y Config (INSTR 06, sección 6). No gasta créditos. Si el usuario escribe otra cosa:`
4. `Revisión (aprobación), Productos, Guía y Config.` → `Revisión (aprobación), Productos, Guía, Config y Mejoras (propuestas de cambio del proyecto; el usuario puede marcar Rechazada).`
5. `Únicas excepciones: el estado de Crudo (R y S),` → `Únicas excepciones: el estado de Crudo (R y S), Mejoras I y K:N,`
6. `Log BUSCA S:AF` → `Log BUSCA S:AH (W incluida)`
7. `RANKEA, FILTRA o ALIBABA` → `RANKEA, FILTRA, ALIBABA o MEJORA` (todas las ocurrencias)
8. En §7, la frase que empieza `No los apliques tú: solo propón` (hasta el punto final) → `Escríbelos además en la pestaña Mejoras, una fila por punto (INSTR 06, sección 6), con la evidencia. Si ya hay una fila igual en estado Propuesta, súmale 1 en I en vez de crear otra; si está Rechazada, no la repitas salvo con un dato nuevo. No los apliques tú en este chat: los aplica MEJORA en un chat nuevo.`

## 3. INSTR 06 → v3.14 (doc `1POkxb0Gb7OhhN_LCzab5HPi4PnLJE8AOwApetWNPpB8`)

1. `Versión 3.13 · 2026-10-12` → `Versión 3.14 · 2026-10-14`
2. `'Log BUSCA'!Z1:AF80: el resumen` → `'Log BUSCA'!Z1:AH80: el resumen`; y después de `las ventanas ya leídas con su total y sus créditos.` agrega ` AG = filas de esa combinación que RANKEA todavía no revisó; AH = créditos por producto que llegó a Productos (solo vale con AG = 0). Cada ventana dice con qué ventas mínimas se leyó (v1000, v2000): lo leído con ventas menores ya incluye lo de ventas mayores, no lo vuelvas a pagar.`
3. `'Log BUSCA'!X2: los IDs ya vistos en el carril.` → `'Log BUSCA'!X2: los IDs ya vistos en el carril. Cárgalos en la página una sola vez por sesión, en localStorage (Recetas fila 30 D, paso 6).`
4. Paso 1 del plan: `Combinaciones del resumen con 6 créditos o menos por fila nueva, o con "Llegaron a Productos" mayor que 0.` (comillas pueden ser tipográficas) → `Primero las combinaciones con AH de 15 o menos créditos por producto. Después las que tienen AG mayor que 0 (aún sin RANKEA: su AF y su AH todavía no dicen nada) y 6 o menos créditos por fila nueva. Lo que importa son los productos, no las filas: muchas filas y 0 productos ya rankeados no es rendir.`
5. Paso 3: `Con 1 carga sobre B94, vuelve solo si la ventana nueva tiene 30 días o más.` → agrega al final ` Tampoco vuelvas a una combinación ya rankeada (AG = 0) con 20 o más créditos y 0 productos.`
6. `así ninguna sesión lo vuelve a escribir.` → agrega ` En R anota también qué palabras del prefiltro tumbaron títulos (por ejemplo prefiltro: spray 3, smart 2); si una tumbó productos que servían, ponlo en Mejoras.`
7. `Nunca escribas S:AF: son fórmulas.` → `Nunca escribas S:AH: son fórmulas.` y `S, T, U, V y el resumen Z:AF se calculan solos:` → `S, T, U, V, W (pendientes de RANKEA) y el resumen Z:AH se calculan solos:`
8. En la Entrega de 2.8, agrega una viñeta: `filas Aplicada de Mejoras que tocan BUSCA AÉREO y sin nota en N: escribe en N si la sesión rindió mejor o peor (con el dato del Log).`
9. **Nueva sección al final** (encabezado `## 6. MEJORA` con estilo HEADING_2 como las demás):

> **MEJORA (aplicar las mejoras del proyecto).** Lee la pestaña Mejoras (A:N), Config!A1:C94 si alguna toca Config, y los documentos que nombran las filas. No abre PiPiAds, Chrome ni Firecrawl.
>
> Entran las filas con K = Propuesta o Aprobada (el dueño dio permiso para aplicar sin esperar su aprobación; las que él marca Rechazada no se tocan). En orden de ID:
> 1. ¿Sigue haciendo falta? Busca en los INSTR vigentes, Recetas y Config si ya está cubierta. Si lo está: K = Ya cubierta y en N dónde.
> 2. Busca contradicciones en **todos** los INSTR (una regla dicha en dos lugares con dos versiones es el error que más caro sale) y corrígelas en el mismo cambio.
> 3. Antes de tocar un INSTR, cópialo a Versiones anteriores con el título «<título> (v<versión actual>)». Edita el vigente en su lugar con el conector de Google Docs, cambiando solo las palabras que cambian, y sube la versión y la fecha de la primera línea. Sin el conector de Google Docs no edites: deja el texto exacto en N.
> 4. Recetas: corrige la celda en su lugar y agrega al final «(AAAA-MM-DD: qué cambió)»; el texto anterior va a N. Un regex o script se prueba antes con títulos que debe tumbar y títulos que debe dejar pasar.
> 5. Config: nunca B66 ni B91 (solo el usuario). En otras celdas cambia B y anota en C la fecha y el valor anterior.
> 6. Si choca con una regla del usuario o con otra mejora, no la apliques: deja K = Propuesta y explica el choque en N.
> 7. Marca K = Aplicada, L = fecha y M = documento y versión.
>
> Entrega: tabla corta (ID, qué cambió, dónde, versión) y lo que no se aplicó con el motivo. Cierra con «Siguiente paso: abre un chat nuevo y escribe» el comando que corresponda.

10. En la tabla de la sección 1 (Comandos), si se puede, agrega fila `MEJORA | Aplica las mejoras de la pestaña Mejoras (sección 6) | Nada`.

## 4. Verificación

- Lee INSTR 00 y 06 con read_file_content: versiones 4.11 y 3.14, sin frases rotas.
- Lee Log BUSCA Z1:AH10 y Mejoras A1:N13.
- Busca otra vez «lo primero es PiPiAds» en ambos: solo debe quedar la frase con la excepción de BUSCA AÉREO.

## Estado

- [x] Todo aplicado el 2026-10-14 en la misma sesión de la auditoría (Z1, Recetas D30/E30, Mejoras M-001..M-012, INSTR 00 v4.11, INSTR 06 v3.14 con sección 6 MEJORA). Verificado leyendo los documentos y Log BUSCA Z1:AH.
