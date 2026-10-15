# Routines de claude.ai: prompts para recrearlas

Copia de respaldo de los prompts de las Routines (hora de Lima). Se escribió el
2026-10-13, cuando al pasar la cuenta al plan Team se borraron todas y se
recrearon desde una sesión de Claude Code. Si se vuelven a perder, se recrean
con estos textos.

**La clave del asesor ya no va dentro del prompt**: se lee de la variable de
entorno `ASESOR_CLAVE` del entorno de la nube (claude.ai → Claude Code → el
entorno «Default» → Editar → variables de entorno). Para los anuncios, además,
`GEMINI_API_KEY`. Sin `ASESOR_CLAVE` los scripts terminan con «Falta
ASESOR_CLAVE en el entorno».

Todas: sesión nueva en cada corrida, repo `jadsajsdlkdqwioqodkwl/claudetarot`
(rama `main`), entorno «Default».

## Inicio común (va al principio de cada prompt)

> Trabajas en el repo jadsajsdlkdqwioqodkwl/claudetarot (rama main
> actualizada). Si no estás dentro de un clon: `GIT_TERMINAL_PROMPT=0 git
> clone https://github.com/jadsajsdlkdqwioqodkwl/claudetarot
> /home/user/claudetarot` y trabaja ahí (no uses gh ni add_repo: en las
> Routines no funcionan). Lee CLAUDE.md y docs/MAPA.md y síguelos
> al pie de la letra. La clave del asesor está en la variable de entorno
> ASESOR_CLAVE (no la imprimas); si falta, termina y responde «Falta
> ASESOR_CLAVE en el entorno de la Routine». Si el Worker responde 401 «No
> autorizado», termina y responde «La ASESOR_CLAVE del entorno no es la
> correcta (¿se pegó el SHA-256 de wrangler.jsonc en vez de la clave?)». No
> hagas commits ni cambies código. Gasta pocos tokens.

(2026-10-13, tras la primera corrida de prueba: las Routines creadas desde
Claude Code no traen el repo adjunto y `add_repo` / `gh repo clone` no
existen o fallan ahí; `git clone` por HTTPS sí funciona. Antes este inicio
decía «pide acceso con add_repo y clónalo».)

## Tabla

| Routine | Cron | Conectores |
|---|---|---|
| Director de marketing y CRO | `CRON_TZ=America/Lima 52 7 * * *` | Google Drive, Meta |
| Asesor — rescate de lead 1 | `CRON_TZ=America/Lima 47 9 * * *` | Google Drive |
| Asesor — reporte de pedidos | `CRON_TZ=America/Lima 30 10 * * *` | Google Drive |
| Asesor — mensajes y cierre | `CRON_TZ=America/Lima 30 11,16,22 * * *` | Google Drive |
| Voz del cliente → brief y ángulos | `CRON_TZ=America/Lima 56 11 * * *` | Google Drive, Google Sheets (y Google Docs si está) |
| Asesor — reporte de ventas | `CRON_TZ=America/Lima 0 21 * * *` | Google Drive |
| Coaching y voz del cliente (semanal) | `CRON_TZ=America/Lima 37 7 * * 1` | Google Drive |
| Asesor — reporte A PEDIDO | sin horario (se corre a mano) | Google Drive |
| Asesor — reporte de ventas (22:00 · 23:00 · 00:00) | `CRON_TZ=America/Lima 0 22,23,0 * * *` | ninguno |

IDs en claude.ai (2026-10-13): Director `trig_01AppxhSheDGy6TwdVuqznez` · rescate 1
`trig_011P6q2BbNWT2Pi2KDQ5Y4DH` · pedidos `trig_01JEzZcdKvF4rPL9jYyda8x9` ·
mensajes y cierre `trig_01TtApS72NepvZsB85hZRBHt` · voz del cliente
`trig_01Bi2xeNnPJp7M81WXtxqmwP` · ventas 21:00 `trig_01MqeNCP2gXjMyXZaWt2sqBo` ·
semanal `trig_015rVWTp5F7Kx7vFvSAt2xZh` · a pedido `trig_01H81ksgqKo2NLNdv1TvN296` ·
ventas de la noche `trig_01MUZWZBq7nr1Cvq1cLRNpAN`.

**Red del entorno**: permitir `kit-tarot-para-principiantes.tarotperu.store`
(sin eso los scripts no llegan a la API del asesor) y, para anuncios,
`generativelanguage.googleapis.com`. Ver docs/MAPA.md → Routines.

**Regla**: toda Routine nueva, borrada o cambiada se anota aquí y en
docs/MAPA.md en el mismo commit.

## Prompts (después del inicio común)

**Director de marketing y CRO (7:52)**: Eres el director de marketing y CRO.
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

**Asesor — rescate de lead 1 (9:47)**: Regla 10 de CLAUDE.md y
docs/asesor.md «Rescate de lead 1». `python3 scripts/asesor/preparar.py api
--dias 30 --salida /tmp/rescate`; lee los chats que ya salieron de su ventana
de 7 días, escribieron hace más de 24 h y no compraron. Pon en `rescates` de
/tmp/rescate/salida.json (`origen: "asesor rescate"`) solo a quien tenga
posibilidades reales (preguntó precio, dio distrito/ciudad, pidió datos de
envío, dijo «luego», duda sin resolver), con su motivo. Tope 15. Manda con
`enviar.py /tmp/rescate/salida.json --solo-mensajes`. Responde cuántos y por
qué.

**Asesor — reporte de pedidos (10:30)**: `python3 scripts/asesor/contexto.py
--salida /tmp/asesor/negocio.md` y `python3 scripts/asesor/preparar.py api
--dias 3 --salida /tmp/asesor`. Lee todo (reglas 5–8 de CLAUDE.md: provincia
confirmada, saldos, EMPAQUE con lo 📦 PROMETIDO, reposiciones y cambios con
🚨). Escribe /tmp/asesor/salida.json con `fecha_objetivo` = hoy, `pedidos`,
`saldos` y `origen: "asesor 10:30"`; registra las ventas de provincia y sus
boletas con `scripts/asesor/ventas.py`. Manda con `enviar.py
/tmp/asesor/salida.json` (PDF al dueño y a Danitza). Si enviar.py lista
pedidos con «⚠️ VERIFICAR» o textos que suenan a bot, corrígelos y vuelve a
mandar.

**Asesor — mensajes y cierre (11:30 · 16:30 · 22:30)**: Mira la hora de Lima.
`contexto.py --salida /tmp/asesor/negocio.md`; a las 11:30 y 16:30
`preparar.py api --dias 3 --activos-horas 6 --salida /tmp/asesor`, a las 22:30
`--dias 1` sin `--activos-horas`. Propón seguimientos (reglas 1–4 y 10–16 de
voz-tarot-store: diagnostica la objeción, cada mensaje aporta algo nuevo, solo
a su destino Lima/provincia) en `mensajes`, más `saldos`, `analisis` y hasta 2
lecciones con memoria.py. `origen: "asesor HH:MM"`. A las 11:30 y 16:30:
`enviar.py /tmp/asesor/salida.json --solo-mensajes`. A las 22:30 cierra el
reporte del día: suma `pedidos` para mañana (`fecha_objetivo` = mañana, mismas
reglas del reporte de pedidos) y manda sin `--solo-mensajes`.

**Voz del cliente → brief y ángulos (11:56)**: Sigue
`docs/anuncios/voz-del-cliente.md` completo (usa
`docs/anuncios/rutina-brief-drive.md`; donde dice CLAVE usa $ASESOR_CLAVE).
El brief vivo es el Google Doc 1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0:
se edita SIEMPRE ese mismo; prohibido crear otro, copiarlo o mandarlo a la
papelera.

**Asesor — reporte de ventas (21:00)**: `contexto.py` y `preparar.py api
--dias 1 --salida /tmp/ventas`. Ventas del día (por vendedora, Lima y
provincia, kits, adelantos y saldos) y mensajes de seguimiento para los que
quedaron a medio camino (`mensajes`, voz-tarot-store). Registra las ventas de
provincia con ventas.py. Guarda /tmp/ventas/salida.json en Drive como
«ventas-AAAA-MM-DD.json» (lo usa la corrida de las 22:30) y manda con
`enviar.py /tmp/ventas/salida.json --solo-mensajes`; el resumen con
`enviar.py --informe`.

**Coaching y voz del cliente (lunes 7:37)**: el prompt de
docs/asesor.md «Routine semanal (lunes) — prompt sugerido».

**Asesor — reporte A PEDIDO (a mano)**: igual que el reporte de pedidos de
las 10:30, con `origen: "asesor a pedido"`.

**Asesor — reporte de ventas (22:00 · 23:00 · 00:00)**: mira la hora de
Lima; el día que reporta es hoy a las 22:00 y 23:00, y el que cerró a las
00:00. `contexto.py` y `preparar.py api --dias 1 --salida /tmp/ventas`
(`--dias 2` a las 00:00). Ventas del día: total y por vendedora, Lima y
provincia, kits, adelantos y saldos pendientes; a las 23:00 y 00:00, qué
cambió desde la hora anterior. Registra con ventas.py las ventas de provincia
nuevas. Reporte de máx. 200 palabras, texto plano, título «Ventas HH:MM —
AAAA-MM-DD», con `enviar.py --informe /tmp/ventas/informe.txt` (CRM →
Reportes). No propone mensajes a clientes.

## 2026-10-14 · Reportes de ventas ahora son PDF con tablas

Los reportes de ventas (21:00 y 22:00·23:00·00:00) salían como texto plano (`--informe`) y el dueño los quiere en el PDF con tablas de siempre. Cambio en los prompts de `trig_01MqeNCP2gXjMyXZaWt2sqBo` (21:00) y `trig_01MUZWZBq7nr1Cvq1cLRNpAN` (noche): escriben `/tmp/ventas/salida.json` con el formato de pedidos más `"tipo_reporte": "ventas"`, `"hora"`, `"fecha_objetivo"`, `"origen"` y `"vendedora"` por pedido, y mandan con `enviar.py /tmp/ventas/salida.json` (PDF a CRM → Reportes y a Telegram solo del dueño, `solo_dueno`). No usan `--informe`. Ambos prompts incluyen la DEFINICIÓN DE VENTA (Lima = dio dirección; provincia = mandó el adelanto; confirmación verbal sin eso = otra cosa o error de asesor). Los prompts anteriores (texto plano, 200/300 palabras, `--informe`) quedan arriba en este archivo como historia.

## Estado al 2026-10-13, 19:30 (Lima), revisado por Claude Code

Cambios que hizo el dueño desde claude.ai (se anotan aquí por la regla de la cabecera):
- Conectores: Director CRO → Meta Ads, Google Drive, Google Sheets. Voz del
  cliente → Meta Ads, Google Drive, Google Sheets. Mensajes y cierre → Meta
  Ads, Google Sheets, Meta devtools, Google Drive. Ventas de la noche → Meta
  Ads, Google Drive, Google Sheets, Meta devtools. Las demás, sin conectores.
- Modelo `claude-sonnet-5-5` en Director CRO, Voz del cliente y Mensajes y
  cierre (las demás usan el de la cuenta).
- Ventas de la noche: el reporte pasa de 200 a 300 palabras como máximo.

Pendiente: conectar **Google Docs** en la cuenta Team (claude.ai → Conectores) y
agregarlo a «Voz del cliente» (sin él no puede reescribir el Doc del brief: el
de Drive no reemplaza contenido; el brief no cambia desde el 06/10).
Agregar **Google Drive** a «Asesor — reporte de ventas (21:00)» (guarda el
`ventas-AAAA-MM-DD.json` que usa la corrida de las 22:30).

- 2026-10-14: «Asesor — reporte de ventas (21:00)»: el resumen (`--informe`) empieza con el título «Ventas 21:00 — AAAA-MM-DD» para que llegue por Telegram (todo informe que empieza con «Ventas» va a Telegram).

## 2026-10-14 · Cuenta nueva: Routines recreadas otra vez

La cuenta de Claude/Teams se volvió a perder y se creó un plan nuevo. Se recrearon las 9 Routines desde Claude Code (entorno «Default» `env_01XG9xGN2x7jUfxX9iMzFhCg`, sesión nueva en cada corrida, mismos horarios y prompts de arriba). Los IDs de la tabla de arriba YA NO EXISTEN; los nuevos son: Director `trig_01RYrG4MxuJUsr6EFzx2Cppg` · rescate 1 `trig_012BNuxd8Zs13YZFPNhvaXCK` · pedidos 10:30 `trig_01MZW3PRpqhkUoeDh89qkGFC` · mensajes y cierre `trig_01PN2ZZaL1MzG9AMB8Nj6PoS` · voz del cliente `trig_01VTRaKdHZBKqTjeKpC1ByLV` · ventas 21:00 `trig_01UGtv1RT7LRR1kkuKGMHP6m` · semanal `trig_013aFLWAgwdoXZwLDBS2aUFN` · ventas 22·23·00 `trig_01XkT6T8HZstc4YDvVwZHyXP` · a pedido `trig_01QJUi3xCif1LXq3QoXShSby` (sin horario).

Cambios en los prompts de ventas (21:00 y 22·23·00): salen como PDF (`tipo_reporte: "ventas"`, sin `--informe`), con la DEFINICIÓN DE VENTA y el nuevo **AVISO META**: comparar cada venta con el campo `embudo` del chat (contiene `purchase` si está marcada como compra) y poner en `sin_marcar_compra` las que no lo están, con la `vendedora` que debe marcarla; el PDF las pone arriba en rojo y la respuesta final dice qué asesor la olvidó. El de 22·23·00 ya no limita a 200 palabras (es PDF).

**Pendiente del dueño (no se puede hacer desde aquí):** (1) en claude.ai → Routines → Editar, agregar conectores: Director CRO y Voz del cliente → Google Drive + Google Sheets (+ Google Docs para el brief) + Meta Ads; Mensajes y cierre → Google Drive; ventas 21:00 → Google Drive; las demás sin conectores. (2) En el entorno «Default»: variable `ASESOR_CLAVE` (y `GEMINI_API_KEY` para anuncios, `CLOUDFLARE_API_TOKEN` para desplegar) y red permitida `kit-tarot-para-principiantes.tarotperu.store` (+ `generativelanguage.googleapis.com`, `api.cloudflare.com`). (3) Reconectar Google Sheets, Google Docs y Meta Ads en claude.ai → Conectores. (4) Aplicar `migrations/0056_comisiones_y_danitza.sql` y desplegar el Worker.

## 2026-10-14 · Ahorro de tokens (pedido del dueño)

Qué se cambió en los prompts vivos de las 9 Routines (los textos de arriba son la historia; para recrearlas usa los de esta sección y `docs/prompts-para-pegar.md` con estos cambios):
1. **Inicio común nuevo**: `git clone --depth 1`; lee SOLO `CLAUDE.md`, NO `docs/MAPA.md` (54 KB ≈ 15 000 tokens que cada corrida releía y solo sirve para cambiar código); de `docs/` solo el archivo que la tarea nombra; cada archivo una sola vez; si no hay novedad, terminar con una línea.
2. **Cortes tempranos sin novedad**: «mensajes y cierre» de 11:30 y 16:30 termina si `preparar.py … --activos-horas 6` da `chats_a_leer` = 0; las de la noche (22·23·00) corren primero `preparar.py api --dias 1 --activos-horas 1` y, si nadie escribió en la última hora, responden «Sin novedad» y NO mandan reporte; el rescate termina si no hay candidatos.
3. **Rescate de lead 1**: `--dias 9` en vez de 30 (releía a diario los mismos chats viejos); mira solo a quien acaba de salir de su ventana de 7 días; de `docs/asesor.md` lee solo su sección.
4. **Voz del cliente**: de diaria a lunes, miércoles y viernes (`56 11 * * 1,3,5`); procesa hasta 2 días. El brief no cambiaba desde el 06/10.
5. **Director CRO**: la Bitácora ya no se recrea cada día (leía y copiaba toda la historia): solo lunes o si empezó/terminó un experimento, y se agrega la entrada AL FINAL con el conector de Google Docs, sin leer el historial.
6. **Ventas 21:00**: ya no propone mensajes de seguimiento (los propone la corrida de las 22:30; estaba duplicado).
Sin tocar: horarios de pedidos (10:30), mensajes (11:30·16:30·22:30), ventas (21·22·23·00 pero ahora omiten cuando no hay novedad), semanal y a pedido. Idea pendiente si se quiere gastar aún menos: poner un modelo más barato en rescate y a pedido (requiere decisión del dueño).

## 2026-10-14 · Modelos por Routine (regla del dueño)

Reportes de pedidos y de ventas nunca llevan un modelo bajo. `claude-sonnet-5-5`: `trig_01MZW3PRpqhkUoeDh89qkGFC` (pedidos 10:30) y `trig_01QJUi3xCif1LXq3QoXShSby` (a pedido). `claude-haiku-5-5`: `trig_012BNuxd8Zs13YZFPNhvaXCK` (rescate), `trig_01RYrG4MxuJUsr6EFzx2Cppg` (Director CRO), `trig_01VTRaKdHZBKqTjeKpC1ByLV` (Voz del cliente), `trig_013aFLWAgwdoXZwLDBS2aUFN` (semanal). Sin modelo fijo: `trig_01UGtv1RT7LRR1kkuKGMHP6m` (ventas 21:00), `trig_01XkT6T8HZstc4YDvVwZHyXP` (ventas 22·23·00), `trig_01PN2ZZaL1MzG9AMB8Nj6PoS` (mensajes y cierre, su corrida de las 22:30 cierra el día con las ventas). Los prompts no cambiaron.

## 2026-10-15 · Blindaje del reporte de ventas

Prompts de `trig_01UGtv1RT7LRR1kkuKGMHP6m` (21:00) y `trig_01XkT6T8HZstc4YDvVwZHyXP` (22·23·00): igual que arriba (inicio común del 14/10) con estos cambios. (a) Corren `python3 scripts/asesor/control_ventas.py AAAA-MM-DD --salida /tmp/ventas` y leen `control.json`. (b) Cada candidato va en `pedidos` o en `no_cuentan` [{whatsapp, motivo}]; `enviar.py` no envía si no cuadra. (c) Si `lineas` muestra otro número con chats activos: `preparar.py api --dias 1 --linea N --salida /tmp/ventas_lN` y `lineas_revisadas: [N]`. (d) Noche: la compuerta de 22:00 y 23:00 es `preparar.py api --dias 1 --activos-horas 2` (antes 1) con «Sin novedad» si `chats_a_leer` = 0; a las 00:00 no hay compuerta (cierre del día completo, `--dias 2`, fecha_objetivo = ayer). (e) En la respuesta final se dice que el cuadre con el CRM dio OK. El resto del prompt (definición de venta, formato, sin_marcar_compra, Drive del 21:00) no cambió.

## 2026-10-15 · Reporte de ventas incremental (22:00 · 23:00 · 00:00) con capturas; el de las 21:00 se apaga

`trig_01UGtv1RT7LRR1kkuKGMHP6m` («reporte de ventas 21:00») queda **apagado** (enabled=false, no borrado; su prompt sigue arriba como historia): el día se reporta ahora en tres corridas que se complementan, 22:00 · 23:00 · 00:00 (`trig_01XkT6T8HZstc4YDvVwZHyXP`, `CRON_TZ=America/Lima 0 22,23,0 * * *`). Prompt vigente (inicio común del 14/10 + esto):

Asesor — reporte de ventas de la noche (22:00 · 23:00 · 00:00). Las tres corridas se complementan: cada una lee SOLO lo que pasó desde la anterior y suma a lo ya reportado; el sistema guarda el estado del día (no lo guardes tú). Mira la hora de Lima: FECHA (AAAA-MM-DD) es hoy a las 22:00 y 23:00, y AYER a las 00:00 (cierre del día).
1) `python3 scripts/asesor/ventas_estado.py traer FECHA --salida /tmp/ventas` → te da `hay_estado` y `horas`.
2) Lee los chats: si `horas` es 0 (primera corrida del día, 22:00): `python3 scripts/asesor/preparar.py api --dias 1 --salida /tmp/ventas` (día completo; a las 00:00 sin estado `--dias 2`). Si `horas` > 0: `python3 scripts/asesor/preparar.py api --dias 1 --activos-horas HORAS --salida /tmp/ventas` (a las 00:00 `--dias 2`): trae solo los chats con movimiento desde el corte anterior, con su día completo.
3) Solo a las 22:00 y 23:00 y solo si `hay_estado`: `python3 scripts/asesor/ventas_estado.py novedad FECHA --salida /tmp/ventas --chats N` (N = `chats_a_leer`); si dice SIN_NOVEDAD responde «Sin novedad» y TERMINA. A las 00:00 NUNCA te saltes nada: es el cierre y siempre se manda.
4) Lee «Cómo hacer un buen reporte de ventas» al final de docs/negocio.md y corre `contexto.py`. Corre `python3 scripts/asesor/control_ventas.py FECHA --salida /tmp/ventas` (lo que el sistema sabe: compras del CRM, pedidos web y de catálogo, chats por número de WhatsApp). Si `lineas` muestra otro número con chats activos, léelos con `preparar.py api --dias 1 --linea N --salida /tmp/ventas_lN` y pon `lineas_revisadas: [N]`.
5) CAPTURAS: corre `python3 scripts/asesor/imagenes.py /tmp/ventas --max 20` y MIRA con Read cada imagen de /tmp/ventas/imagenes.md (en los chats aparecen como `[imagen#id]`). En una captura de Yape/Plin/banco confirma monto (adelanto S/20 o saldo), fecha y hora (que sea de FECHA), destinatario (Moises O.) y número de operación; una captura de otro día, de otro monto, de otro destinatario o editada NO confirma la venta: va a POR_CONFIRMAR con nota «🚨 revisar captura» y el motivo. Una captura de saldo (Shalom) va en `saldos` (regla 5 de CLAUDE.md). DNI, ubicación y direcciones en imagen úsalos para completar el pedido.
6) DEFINICIÓN DE VENTA: Lima = dio su dirección; provincia = mandó el adelanto; confirmación verbal sin eso = otra cosa o error de asesor. Escribe /tmp/ventas/salida.json con el formato de pedidos más `"tipo_reporte": "ventas"`, `"hora"`, `"fecha_objetivo": FECHA`, `"origen"`: en `pedidos` pon SOLO lo nuevo o lo que cambió desde la corrida anterior (enviar.py lo suma a lo ya reportado, por WhatsApp; no repitas lo anterior) con `vendedora`, `destino`, `estado`. Pon también lo nuevo en `incidencias`, `no_cuentan` [{whatsapp, motivo}] y `sin_marcar_compra`. CUADRE OBLIGATORIO: cada candidato de control.json (compras del CRM, pedidos web, de catálogo y `compra_otro_dia`) debe quedar en `pedidos` (aunque sea OTRO_DIA o POR_CONFIRMAR) o en `no_cuentan` con motivo concreto, ya sea de esta corrida o del estado previo (/tmp/ventas/previo.json); `enviar.py` NO envía si queda uno sin explicar: léelo, corrige y vuelve a mandar.
7) AVISO META: cada chat de preparar.py trae el campo `embudo` (las etiquetas del CRM); si es una venta según la definición y `embudo` NO contiene `purchase`, el asesor olvidó marcarla como COMPRA y Meta no se enteró: ponla en `sin_marcar_compra` [{whatsapp, vendedora, motivo}] (vendedora = la asesora del chat). A las 23:00 y 00:00 di qué cambió desde la corrida anterior. Registra con ventas.py las ventas de provincia nuevas. Manda con `python3 scripts/asesor/enviar.py /tmp/ventas/salida.json` (PDF con TODO el día; no uses --informe). En tu respuesta final di: qué asesor olvidó marcar y cuántas, qué cambió, cuántas capturas miraste y que el cuadre con el CRM dio OK. No propones mensajes a clientes.


## 2026-10-15 · URO — lista de llamadas (Routine nueva)

`trig_0185gtAmn2gxMDbCTEwYpCH6` · cron `CRON_TZ=America/Lima 7 7-22 * * *` (cada hora, de 7:07 a 22:07 Lima;
si el dueño la quiere las 24 h, cambiar a `7 * * * *`) · sesión nueva en cada corrida, entorno «Default» (necesita
`ASESOR_CLAVE` y la red al CRM) · **Conector: Google Sheets** (ya agregado por el dueño en claude.ai → Routines).
Sin API de IA. Reglas y columnas: `docs/uro/llamadas.md`. **Mientras la rama `claude/sweet-mayer-0079gx` no esté
en `main`, el prompt clona esa rama (`git clone --depth 1`); cuando se fusione a
`main`, quitar el `-b …` del prompt.**

Prompt vigente (2026-10-15, versión barata: compuerta `gate` primero; sin speech ni «Ojo»; hoja de 7 columnas A:G):

```
Mantén la hoja «URO - Lista de llamadas» (Google Sheets ID 1CujjC-Mt_OpEpuJ3S4n_DbKQnR3T_TEa4C9awBkIAjk) para la asesora comercial que llama por teléfono. Gasta MUY pocos tokens: no pienses en voz alta, no leas más de lo indicado. NUNCA llames a ninguna API de IA ni mandes mensajes a clientes: solo escribes en la hoja.

0. Un solo comando: `(cd /home/user/claudetarot 2>/dev/null || GIT_TERMINAL_PROMPT=0 git clone -q --depth 1 https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot) && cd /home/user/claudetarot && python3 scripts/uro/llamadas.py gate`. Si imprime SIN_NOVEDAD: responde «Sin novedad» y TERMINA (no uses ninguna otra herramienta). Si falla por ASESOR_CLAVE o 401, responde el motivo y termina (no revises la variable tú).
1. Con el conector de Google Sheets (búscalo con ToolSearch «get_values append_values update_values» si no está cargado) lee `Estado!A2:B` y `Llamadas!B2:B` con get_values y guarda cada respuesta tal cual con Write en /tmp/uro/estado.json y /tmp/uro/filas.json.
2. `cd /home/user/claudetarot && python3 scripts/uro/llamadas.py preparar --estado /tmp/uro/estado.json --filas /tmp/uro/filas.json --salida /tmp/uro`. Si imprime SIN_NOVEDAD: responde «Sin novedad» y TERMINA.
3. Lee `docs/uro/llamadas.md` (reglas de interés y de las columnas), luego `/tmp/uro/chats.txt` y `/tmp/uro/plan.json`.
4. Por cada chat de `nuevos`: decide si entra (escribió algo más que el saludo: pidió precio, dio ciudad, tocó LIMA/PROVINCIA, preguntó algo) o se descarta (sticker, «gracias», no quiere, otro producto, prueba del equipo). Los que entran: append_values en `Llamadas!A:G` con [false, "51 999 999 999" (con espacios, texto), nombre (o «(sin nombre, emoji)»), Interés (Alto/Medio/Bajo), «dd/mm hh:mm» del último mensaje del cliente, Resumen (2 a 4 frases: qué pidió, qué le respondieron y quién, en qué quedó; si solo recibió mensajes automáticos, «nadie le respondió»), false]. Para cada chat de `actualizar` (trae `fila`): reescribe SOLO `Llamadas!D{fila}:F{fila}` (Interés, Última actividad, Resumen). NUNCA toques la columna A (check de llamado) ni la G (¿Fue venta?). Para cada uno de `ya_compraron`: pon «Ya compró» en D{fila}.
5. Estado: para CADA chat de nuevos/actualizar/ya_compraron anota su `ultimo_id` y «En la lista» o «Descartado: motivo»: si ya tiene fila en Estado (estado.json, fila = lugar + 2) actualiza `Estado!B:C` de esa fila; si no, append en `Estado!A:C` con el WhatsApp (solo dígitos, como texto).
6. Termina con una línea: filas nuevas, actualizadas, descartadas, y `quedan_para_la_proxima` si es > 0.
```

Primera corrida real (18:08 UTC): falló sin escribir nada porque la rama aún no estaba en `main` y el conector no estaba agregado; con la compuerta una corrida vacía son 1–2 turnos.

## 2026-10-15 · Reporte de ventas: de tres corridas a DOS (22:00 y 23:30)

Pedido del dueño para gastar menos créditos (la corrida de las 00:00 había fallado con `USAGE_LIMIT_REACHED`). `trig_01XkT6T8HZstc4YDvVwZHyXP` queda en `CRON_TZ=America/Lima 0 22 * * *` (nombre «Asesor — reporte de ventas (22:00)») y se crea `trig_011ZpgQqhVKEnzhDG89RJqjq` en `CRON_TZ=America/Lima 30 23 * * *` («… 23:30, cierre»), sin conectores (el reporte no los usa), mismo prompt en las dos (decide por la hora). Cambios del prompt: ya no hay corrida de las 00:00 ni `--dias 2`; FECHA es siempre hoy; la de las 23:30 lee solo lo nuevo y se salta con «Sin novedad» si nadie escribió y el control del sistema ya está explicado; **CLAUDE.md, negocio.md y contexto.py se leen DESPUÉS de la compuerta**, así una corrida de las 23:30 sin novedad termina sin cargar nada de eso. Prompt vigente:

```
Trabajas en el repo jadsajsdlkdqwioqodkwl/claudetarot (rama main actualizada). Si no estás dentro de un clon: `GIT_TERMINAL_PROMPT=0 git clone --depth 1 https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot` y trabaja ahí (no uses gh ni add_repo). La clave del asesor está en la variable de entorno ASESOR_CLAVE (no la imprimas); si falta, termina y responde «Falta ASESOR_CLAVE en el entorno de la Routine». Si el Worker responde 401, termina y responde «La ASESOR_CLAVE del entorno no es la correcta». No hagas commits ni cambies código. Gasta pocos tokens: lee cada archivo una sola vez, no repitas búsquedas. NO leas docs/MAPA.md. NO leas CLAUDE.md ni docs hasta pasar la compuerta de los pasos 1 a 3.

Asesor — reporte de ventas de la noche (22:00 y 23:30). Las dos corridas se complementan: la de las 22:00 lee el día completo; la de las 23:30 lee SOLO lo que pasó desde la anterior y suma a lo ya reportado (cierre del día). El sistema guarda el estado del día (no lo guardes tú). FECHA (AAAA-MM-DD) es siempre HOY en Lima. Mira la hora de Lima: antes de las 23:00 es la corrida de las 22:00; después, la de las 23:30.
1) `python3 scripts/asesor/ventas_estado.py traer FECHA --salida /tmp/ventas` → te da `hay_estado` y `horas`.
2) Lee los chats: si `horas` es 0 (primera corrida del día): `python3 scripts/asesor/preparar.py api --dias 1 --salida /tmp/ventas` (día completo). Si `horas` > 0: `python3 scripts/asesor/preparar.py api --dias 1 --activos-horas HORAS --salida /tmp/ventas`: trae solo los chats con movimiento desde el corte anterior, con su día completo.
3) COMPUERTA (solo en la corrida de las 23:30 y solo si `hay_estado`): `python3 scripts/asesor/ventas_estado.py novedad FECHA --salida /tmp/ventas --chats N` (N = `chats_a_leer`); si dice SIN_NOVEDAD responde «Sin novedad» y TERMINA sin leer nada más. La de las 22:00 nunca se salta.
Recién ahora: lee CLAUDE.md y «Cómo hacer un buen reporte de ventas» al final de docs/negocio.md, y corre `contexto.py`.
4) Corre `python3 scripts/asesor/control_ventas.py FECHA --salida /tmp/ventas` (lo que el sistema sabe: compras del CRM, pedidos web y de catálogo, chats por número de WhatsApp). Si `lineas` muestra otro número con chats activos, léelos con `preparar.py api --dias 1 --linea N --salida /tmp/ventas_lN` y pon `lineas_revisadas: [N]`.
5) CAPTURAS: corre `python3 scripts/asesor/imagenes.py /tmp/ventas --max 20` y MIRA con Read cada imagen de /tmp/ventas/imagenes.md (en los chats aparecen como `[imagen#id]`). En una captura de Yape/Plin/banco confirma monto (adelanto S/20 o saldo), fecha y hora (que sea de FECHA), destinatario (Moises O.) y número de operación; una captura de otro día, de otro monto, de otro destinatario o editada NO confirma la venta: va a POR_CONFIRMAR con nota «🚨 revisar captura» y el motivo. Una captura de saldo (Shalom) va en `saldos` (regla 5 de CLAUDE.md). DNI, ubicación y direcciones en imagen úsalos para completar el pedido.
6) DEFINICIÓN DE VENTA: Lima = dio su dirección; provincia = mandó el adelanto; confirmación verbal sin eso = otra cosa o error de asesor. Escribe /tmp/ventas/salida.json con el formato de pedidos más `"tipo_reporte": "ventas"`, `"hora"`, `"fecha_objetivo": FECHA`, `"origen"`: en `pedidos` pon SOLO lo nuevo o lo que cambió desde la corrida anterior (enviar.py lo suma a lo ya reportado, por WhatsApp; no repitas lo anterior) con `vendedora`, `destino`, `estado`. Pon también lo nuevo en `incidencias`, `no_cuentan` [{whatsapp, motivo}] y `sin_marcar_compra`. CUADRE OBLIGATORIO: cada candidato de control.json (compras del CRM, pedidos web, de catálogo y `compra_otro_dia`) debe quedar en `pedidos` (aunque sea OTRO_DIA o POR_CONFIRMAR) o en `no_cuentan` con motivo concreto, ya sea de esta corrida o del estado previo (/tmp/ventas/previo.json); `enviar.py` NO envía si queda uno sin explicar: léelo, corrige y vuelve a mandar.
7) AVISO META: cada chat de preparar.py trae el campo `embudo` (las etiquetas del CRM); si es una venta según la definición y `embudo` NO contiene `purchase`, el asesor olvidó marcarla como COMPRA y Meta no se enteró: ponla en `sin_marcar_compra` [{whatsapp, vendedora, motivo}] (vendedora = la asesora del chat). A las 23:30 di qué cambió desde la corrida anterior. Registra con ventas.py las ventas de provincia nuevas. Manda con `python3 scripts/asesor/enviar.py /tmp/ventas/salida.json` (PDF con TODO el día; no uses --informe). En tu respuesta final di: qué asesor olvidó marcar y cuántas, qué cambió, cuántas capturas miraste y que el cuadre con el CRM dio OK. No propones mensajes a clientes.
```

## 2026-10-15 · URO — lista de llamadas: se escribe con update_values, no append

Segunda corrida real (19:08 UTC, SUCCEEDED, 1 fila nueva): `append_values` cayó en la fila 1001 porque la validación de casillas llega hasta la 1000; la sesión la movió a mano y gastó turnos de más. Cambio: `llamadas.py preparar` ahora deja en `plan.json` `siguiente_fila_llamadas` y `siguiente_fila_estado`, y el prompt escribe con `update_values` en esas filas exactas (nunca `append_values`). Se limpió a mano `Llamadas!A1001:G1001`. Cambios del prompt: pasos 3, 4 y 5 (el resto igual al vigente de arriba).

Aclaración sobre «fallos» que muestra claude.ai: `trig_01XkT6T8HZstc4YDvVwZHyXP` (ventas 22:00) conserva en su «última corrida» el FALLO del 00:05 Lima del 15/10 (`USAGE_LIMIT_REACHED`, del esquema viejo de tres corridas); no es una falla nueva y se reemplaza cuando corra a las 22:00. La primera corrida de URO (18:08 UTC) falló porque la rama aún no estaba en `main`; ya resuelto.

## 2026-10-15 · URO — lista de llamadas: actualizar clientes ya listados (barato)

Pedido del dueño: los clientes ya en la lista deben actualizarse cuando vuelven a escribir. `llamadas.py preparar` ahora muestra de esos chats SOLO lo posterior al último mensaje leído (+2 de contexto); la hoja suma la columna H «Novedad desde la última vez». Paso 4 del prompt, parte «actualizar»: reescribe SOLO `Llamadas!D{fila}:E{fila}` (Interés, Última actividad) y `Llamadas!H{fila}` (1 o 2 frases con lo nuevo: qué dijo o pidió, qué se le respondió, en qué quedó); NO toca A, F, G ni I, y no necesita leer el resumen anterior. El gate solo mira mensajes del CLIENTE de las últimas 3 h (una respuesta de la vendedora sola no dispara la corrida; entra cuando la Routine corre por otro motivo).
