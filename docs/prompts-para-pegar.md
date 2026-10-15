# Prompts para pegar (Routines de claude.ai → Routines → Nueva)

Cada Routine: sesión nueva en cada corrida, repo `jadsajsdlkdqwioqodkwl/claudetarot` (rama main), entorno «Default». Pega el **inicio común** y, debajo, el texto de la Routine. Horarios en hora de Lima.

## Inicio común

Trabajas en el repo jadsajsdlkdqwioqodkwl/claudetarot (rama main actualizada). Si no estás dentro de un clon: `GIT_TERMINAL_PROMPT=0 git clone https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot` y trabaja ahí (no uses gh ni add_repo: en las Routines no funcionan). Lee CLAUDE.md y docs/MAPA.md y síguelos al pie de la letra. La clave del asesor está en la variable de entorno ASESOR_CLAVE (no la imprimas); si falta, termina y responde «Falta ASESOR_CLAVE en el entorno de la Routine». Si el Worker responde 401 «No autorizado», termina y responde «La ASESOR_CLAVE del entorno no es la correcta (¿se pegó el SHA-256 de wrangler.jsonc en vez de la clave?)». No hagas commits ni cambies código. Gasta pocos tokens.

## Director de marketing y CRO (7:52)

**Horario:** 7:52 diario

Eres el director de marketing y CRO.
1) `python3 scripts/asesor/contexto.py --salida /tmp/cro/negocio.md` y
`python3 scripts/asesor/embudo.py api --dias 7 --salida /tmp/cro`. 2) Lee
negocio.md, embudo.json, perdidos.txt y sin_respuesta.txt; con el conector de
Meta revisa la fatiga de los anuncios (frecuencia, CTR y costo por chat de 7
días). 3) Escribe /tmp/cro/salida.json (`origen: "director CRO"`) con hasta 3
`variantes` con su hipótesis, respuestas rápidas nuevas solo para objeciones
sin respuesta y `preguntas` al dueño si hace falta; usa la skill
voz-tarot-store y las de análisis de `.claude/skills/`. Revisa las ediciones de
las vendedoras, las frases que venden y las fotos/videos de cada mensaje
(contexto.py). Manda con `python3 scripts/asesor/enviar.py
/tmp/cro/salida.json --solo-mensajes`. 4) Informe de 300 palabras (embudo,
chats perdidos y sin respuesta, anuncios, experimentos) con `enviar.py
--informe /tmp/cro/informe.txt`. 5) Crea en Drive el Google Doc «Bitácora CRO
Tarot» del día (busca el de ayer por título, copia su historia y suma la
entrada de hoy; manda el viejo a la papelera). 6) Anota 1–3 lecciones con
`scripts/asesor/memoria.py agregar --fuente director`.

## Asesor — rescate de lead 1 (9:47)

**Horario:** 9:47 diario

Regla 10 de CLAUDE.md y
docs/asesor.md «Rescate de lead 1». `python3 scripts/asesor/preparar.py api
--dias 30 --salida /tmp/rescate`; lee los chats que ya salieron de su ventana
de 7 días, escribieron hace más de 24 h y no compraron. Pon en `rescates` de
/tmp/rescate/salida.json (`origen: "asesor rescate"`) solo a quien tenga
posibilidades reales (preguntó precio, dio distrito/ciudad, pidió datos de
envío, dijo «luego», duda sin resolver), con su motivo. Tope 15. Manda con
`enviar.py /tmp/rescate/salida.json --solo-mensajes`. Responde cuántos y por
qué.

## Asesor — reporte de pedidos (10:30)

**Horario:** 10:30 diario

`python3 scripts/asesor/contexto.py
--salida /tmp/asesor/negocio.md` y `python3 scripts/asesor/preparar.py api
--dias 3 --salida /tmp/asesor`. Lee todo (reglas 5–8 de CLAUDE.md: provincia
confirmada, saldos, EMPAQUE con lo 📦 PROMETIDO, reposiciones y cambios con
🚨). Escribe /tmp/asesor/salida.json con `fecha_objetivo` = hoy, `pedidos`,
`saldos` y `origen: "asesor 10:30"`. Manda con `enviar.py
/tmp/asesor/salida.json` (PDF al dueño y a Danitza). Si enviar.py lista
pedidos con «⚠️ VERIFICAR» o textos que suenan a bot, corrígelos y vuelve a
mandar.

## Asesor — mensajes y cierre (11:30 · 16:30 · 22:30)

**Horario:** 11:30, 16:30 y 22:30 diario

Mira la hora de Lima.
`contexto.py --salida /tmp/asesor/negocio.md`; a las 11:30 y 16:30
`preparar.py api --dias 3 --activos-horas 6 --salida /tmp/asesor`, a las 22:30
`--dias 1` sin `--activos-horas`. Propón seguimientos (reglas 1–4 y 10–16 de
voz-tarot-store: diagnostica la objeción, cada mensaje aporta algo nuevo, solo
a su destino Lima/provincia) en `mensajes`, más `saldos`, `analisis` y hasta 2
lecciones con memoria.py. `origen: "asesor HH:MM"`. A las 11:30 y 16:30:
`enviar.py /tmp/asesor/salida.json --solo-mensajes`. A las 22:30 cierra el
reporte del día: suma `pedidos` para mañana (`fecha_objetivo` = mañana, mismas
reglas del reporte de pedidos) y manda sin `--solo-mensajes`.

## Voz del cliente → brief y ángulos (11:56)

**Horario:** 11:56 diario

Sigue
`docs/anuncios/voz-del-cliente.md` completo (usa
`docs/anuncios/rutina-brief-drive.md`; donde dice CLAVE usa $ASESOR_CLAVE).
El brief vivo es el Google Doc 1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0:
se edita SIEMPRE ese mismo; prohibido crear otro, copiarlo o mandarlo a la
papelera.

## Coaching y voz del cliente (lunes 7:37)

**Horario:** 11:56 diario

el prompt de
docs/asesor.md «Routine semanal (lunes) — prompt sugerido».

## Asesor — reporte A PEDIDO (a mano)

**Horario:** sin horario (a mano)

igual que el reporte de pedidos de
las 10:30, con `origen: "asesor a pedido"`.

## Asesor — reporte de ventas (21:00)

**Horario:** 21:00 diario

`contexto.py` y `preparar.py api --dias 1 --salida /tmp/ventas`. Lee «Cómo hacer un buen reporte de ventas» al final de docs/negocio.md. DEFINICIÓN DE VENTA: Lima = el cliente pasó su dirección; provincia = el cliente mandó el adelanto; confirmación verbal sin eso = otra cosa o error de asesor. Escribe /tmp/ventas/salida.json con el formato de pedidos más `"tipo_reporte": "ventas"`, `"hora"`, `"fecha_objetivo"`, `"origen"` y por pedido `vendedora`, `destino`, `estado`. Manda con `python3 scripts/asesor/enviar.py /tmp/ventas/salida.json` (PDF; no uses --informe). La vendedora de la venta es la asesora del chat en el CRM. Añade `mensajes` de seguimiento para los que quedaron a medio camino (voz-tarot-store). Guarda /tmp/ventas/salida.json en Drive como «ventas-AAAA-MM-DD.json». AVISO META: cada chat de preparar.py trae el campo `embudo` (las etiquetas del CRM); si es una venta según la definición y `embudo` NO contiene `purchase`, el asesor olvidó marcarla como COMPRA y Meta no se enteró: ponla en `sin_marcar_compra` [{whatsapp, vendedora, motivo}] (vendedora = la asesora del chat). enviar.py la dibuja arriba del PDF en rojo; en tu respuesta final di qué asesor olvidó marcar y cuántas.

## Asesor — reporte de ventas (22:00 · 23:00 · 00:00)

**Horario:** 22:00, 23:00 y 00:00 diario

Mira la hora de Lima: el día que reporta es hoy a las 22:00 y 23:00, y el que cerró a las 00:00. `contexto.py` y `preparar.py api --dias 1 --salida /tmp/ventas` (`--dias 2` a las 00:00). Lee «Cómo hacer un buen reporte de ventas» al final de docs/negocio.md. DEFINICIÓN DE VENTA: Lima = el cliente pasó su dirección; provincia = el cliente mandó el adelanto; confirmación verbal sin eso = otra cosa o error de asesor. Escribe /tmp/ventas/salida.json con el formato de pedidos más `"tipo_reporte": "ventas"`, `"hora"`, `"fecha_objetivo"`, `"origen"` y por pedido `vendedora`, `destino`, `estado`. Manda con `python3 scripts/asesor/enviar.py /tmp/ventas/salida.json` (PDF; no uses --informe). A las 23:00 y 00:00 di qué cambió desde la hora anterior. AVISO META: cada chat de preparar.py trae el campo `embudo` (las etiquetas del CRM); si es una venta según la definición y `embudo` NO contiene `purchase`, el asesor olvidó marcarla como COMPRA y Meta no se enteró: ponla en `sin_marcar_compra` [{whatsapp, vendedora, motivo}] (vendedora = la asesora del chat). enviar.py la dibuja arriba del PDF en rojo; en tu respuesta final di qué asesor olvidó marcar y cuántas. No propone mensajes a clientes.

## Conectores por Routine

Director CRO y Voz del cliente: Google Drive, Google Sheets, Google Docs, Meta Ads MCP. Mensajes y cierre y ventas 21:00: Google Drive. Las demás: ninguno.

## Project de conceptos (claude.ai → Projects)

Instrucciones: `creativos/prompt-project.md`. Archivos del Project: `creativos/instrucciones.md`, `creativos/reglas_aprendidas.md`, `creativos/avatares.md`, `creativos/brief.md`, `creativos/copy-meta.md` y el link del brief vivo (Google Doc 1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0).

## 2026-10-14 · Ahorro de tokens (pedido del dueño)

Qué se cambió en los prompts vivos de las 9 Routines (los textos de arriba son la historia; para recrearlas usa los de esta sección y `docs/prompts-para-pegar.md` con estos cambios):
1. **Inicio común nuevo**: `git clone --depth 1`; lee SOLO `CLAUDE.md`, NO `docs/MAPA.md` (54 KB ≈ 15 000 tokens que cada corrida releía y solo sirve para cambiar código); de `docs/` solo el archivo que la tarea nombra; cada archivo una sola vez; si no hay novedad, terminar con una línea.
2. **Cortes tempranos sin novedad**: «mensajes y cierre» de 11:30 y 16:30 termina si `preparar.py … --activos-horas 6` da `chats_a_leer` = 0; las de la noche (22·23·00) corren primero `preparar.py api --dias 1 --activos-horas 1` y, si nadie escribió en la última hora, responden «Sin novedad» y NO mandan reporte; el rescate termina si no hay candidatos.
3. **Rescate de lead 1**: `--dias 9` en vez de 30 (releía a diario los mismos chats viejos); mira solo a quien acaba de salir de su ventana de 7 días; de `docs/asesor.md` lee solo su sección.
4. **Voz del cliente**: de diaria a lunes, miércoles y viernes (`56 11 * * 1,3,5`); procesa hasta 2 días. El brief no cambiaba desde el 06/10.
5. **Director CRO**: la Bitácora ya no se recrea cada día (leía y copiaba toda la historia): solo lunes o si empezó/terminó un experimento, y se agrega la entrada AL FINAL con el conector de Google Docs, sin leer el historial.
6. **Ventas 21:00**: ya no propone mensajes de seguimiento (los propone la corrida de las 22:30; estaba duplicado).
Sin tocar: horarios de pedidos (10:30), mensajes (11:30·16:30·22:30), ventas (21·22·23·00 pero ahora omiten cuando no hay novedad), semanal y a pedido. Idea pendiente si se quiere gastar aún menos: poner un modelo más barato en rescate y a pedido (requiere decisión del dueño).
