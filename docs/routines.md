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
> actualizada). Si no estás dentro de un clon, pide acceso con add_repo
> (cárgala con ToolSearch) y clónalo. Lee CLAUDE.md y docs/MAPA.md y síguelos
> al pie de la letra. La clave del asesor está en la variable de entorno
> ASESOR_CLAVE (no la imprimas); si falta, termina y responde «Falta
> ASESOR_CLAVE en el entorno de la Routine». No hagas commits ni cambies
> código. Gasta pocos tokens.

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
