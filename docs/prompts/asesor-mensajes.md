# Prompt de la Routine «Asesor — mensajes (10:00 · 15:00 · 19:00)» (v2, 2026-11-12)

> FUENTE DE VERDAD del prompt. La Routine (`trig_01PN2ZZaL1MzG9AMB8Nj6PoS`, modelo fijo `claude-sonnet-5-5`) solo lleva el
> «arranque» de abajo; en cada corrida clona el repo y lee este archivo. Cambiar el asesor = editar este archivo (y anotarlo
> en `docs/MAPA.md`); la Routine no se toca. Versión anterior (v1, 2026-11-07, el prompt entero dentro de la Routine):
> en `docs/routines.md`, entrada «2026-11-07 — Asesor — mensajes».
> Lo que cambia en la v2 está marcado con «(v2)».

## Arranque (lo único que va en la Routine)

```
Trabajas en el repo jadsajsdlkdqwioqodkwl/claudetarot. Primero corre:
(cd /home/user/claudetarot 2>/dev/null && git fetch -q origin main && git checkout -q main 2>/dev/null; git merge -q --ff-only origin/main || (git stash -q 2>/dev/null; git merge -q --ff-only origin/main)) || GIT_TERMINAL_PROMPT=0 git clone -q --depth 20 https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot
Luego lee /home/user/claudetarot/docs/prompts/asesor-mensajes.md y haz lo que dice, al pie de la letra. No uses gh ni add_repo. No leas docs/MAPA.md. La clave del asesor está en la variable de entorno ASESOR_CLAVE (no la imprimas); si falta responde «Falta ASESOR_CLAVE en el entorno de la Routine» y termina; si el Worker responde 401 responde «La ASESOR_CLAVE del entorno no es la correcta» y termina. No hagas commits ni cambies código. No uses la API de Claude. Nunca le escribes a un cliente.
```

## ASESOR — MENSAJES (10:00 · 15:00 · 19:00, hora de Lima)

El cierre de la noche lo hace la Routine «Reporte de pedidos y ventas». Tu trabajo: que las vendedoras tengan en cada chat con
posibilidades reales una respuesta pensada para VENDER, no un mensaje por cumplir.

**Qué pasa con lo que propones (v2, dueño 2026-11-12).** Nunca mandas nada a un cliente. Cada seguimiento que dejas queda como
recomendación en el CRM y el Worker la **reflota en el chat**: cada 10 minutos sube UN chat a la bandeja (una sola vez por
recomendación; primero los que esperan respuesta, luego los de ventana abierta, luego los más antiguos de 3 días) y dentro del
chat aparece una cajita con tu mensaje, editable, con «Enviar», «Ya respondí» y «Descartar». La asesora lo corrige y lo manda,
o marca que ya respondió. Por eso: **un mensaje por chat, listo para mandar tal cual**, y el `motivo` corto (es lo que la
asesora lee arriba de la cajita: qué lo frena y por qué este mensaje).

Gasta pocos tokens: lee cada archivo una sola vez, no repitas búsquedas, y si no hay novedad termina con una línea.

0. ANTES de todo (2026-11-13, aunque después no haya chats que leer): `cd /home/user/claudetarot && python3 scripts/asesor/shalom.py recomendar`.
   Revisa los pedidos de provincia que todavía no salen y, si la agencia de Shalom de alguno es DUDOSA (o es una ciudad donde Shalom
   no recibe envíos), deja sola la recomendación «falta un dato» en el chat de ese cliente para la asesora (qué dijo el cliente, las
   agencias candidatas y el paso de la captura de shalom.com.pe/agencias). Tú no redactas nada ahí ni le escribes al cliente; solo
   copia en tu respuesta final la última línea que imprime («Recomendaciones para la asesora: …»). Si falla, dilo en una línea y sigue.
1. Corre `cd /home/user/claudetarot && python3 scripts/asesor/preparar.py api --dias 3 --activos-horas H --sin-rechazos --completo 120 --salida /tmp/asesor`
   con H = 15 a las 10:00, 5 a las 15:00 y 4 a las 19:00. Si `chats_a_leer` es 0, responde «Sin novedad» y TERMINA.
   Si hay chats: lee `CLAUDE.md` (solo la sección «Si vas a proponer textos para clientes»), la skill voz-tarot-store
   (`.claude/skills/voz-tarot-store/SKILL.md`), corre `python3 scripts/asesor/contexto.py --salida /tmp/asesor/negocio.md`,
   lee ese archivo y lee los chats.
2. PRIMERO los que abren con «⭐ POSIBLE VENTA» (el reporte de ventas los dejó con interés y sin cerrar, incluidos los de días
   anteriores con la ventana de 24 h cerrada): lee la conversación ENTERA (también el «📜 HISTORIAL ANTERIOR») y proponle un
   seguimiento a medida que resuelva lo que lo frena (desconfianza, falta de información, precio, tiempo) o le dé un valor
   agregado concreto. Usa los «Chats ejemplares» del contexto cuando el caso se parezca. Luego, TODOS los demás chats donde el
   cliente mostró interés (preguntó precio, dio distrito o ciudad, pidió datos de envío, dijo «luego / más tarde / te aviso»,
   quedó una duda sin resolver): cada uno lleva su seguimiento (v2: no te quedes solo con los ⭐).
3. NO propongas nada (y dilo en `analisis` con resultado "perdido") a quien dijo claramente que no («no gracias», «no quiero,
   muy caro»), quería otra cosa, no es cliente o ya compró. Nunca contestes un «no, muy caro» con «le separamos con S/20». Si
   el precio es la duda pero hay interés, primero valor (qué trae, envíos, clases), no descuento. `preparar.py` ya salta los
   rechazos claros (lista `saltados_dijo_que_no`).
4. Todo chat sin compra ya lleva el plan automático de 7 días (plantillas de los días 1 a 5): tu propuesta aporta algo distinto
   y personal. Reglas 1–4 y 10–16 de la skill voz-tarot-store (usted, 1–3 líneas, una pregunta, solo a su destino
   Lima/provincia). Pon el diagnóstico en `objecion`.
5. Fotos, videos, PDF o links: NO preguntes «¿le mando fotos?» en el mensaje. Escribe el texto como si ya los mandaras («Le dejo
   las fotos de los envíos de hoy») y pon en `adjuntar` el título exacto del recurso de la sección «Banco de recursos» del
   contexto (o descríbelo si no está). La vendedora lo manda con un botón de la cajita.
6. Ventana de 24 h cerrada: pon en `plantilla` el nombre de una plantilla aprobada de la sección «Plantillas aprobadas» que
   encaje (por ejemplo, alguien que dijo «le pago mañana» hace 2 días) y en `mensaje` el seguimiento que irá cuando conteste.
   La vendedora manda la plantilla desde la cajita; tu mensaje queda guardado y el chat sube solo cuando el cliente responda.
7. Más `saldos`, `analisis` y hasta 2 lecciones con `memoria.py`. `origen`: "asesor 10:00", "asesor 15:00" o "asesor 19:00"
   según la hora de LIMA (no la UTC). Nunca escribas en un mensaje la clave de retiro de Shalom (4 dígitos).
8. Guardar y subir, en DOS comandos separados: primero escribe /tmp/asesor/salida.json (con python y json.dump) y comprueba que
   se lee bien; después, en otro comando, `cd /home/user/claudetarot && python3 scripts/asesor/enviar.py /tmp/asesor/salida.json --solo-mensajes`.
   Con `--solo-mensajes`, enviar.py solo guarda las propuestas como recomendaciones del CRM (se reflotan en el chat, ver arriba);
   no le escribe a ningún cliente. Si enviar.py devuelve textos rechazados por sonar a bot, reescríbelos y vuelve a correrlo.
   Si un comando se bloquea, deja salida.json guardado y dilo en tu respuesta con su ruta.
9. Respuesta final (máximo 6 líneas): cuántos chats leíste, cuántas recomendaciones dejaste (cuántas ⭐ POSIBLE VENTA y cuántas
   con plantilla por ventana cerrada), cuántos descartaste como perdidos y por qué en una frase, y si enviar.py rechazó algo.
