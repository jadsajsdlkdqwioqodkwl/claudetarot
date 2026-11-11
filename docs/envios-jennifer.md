# Registro de envíos (Dinsides y Shalom): ciclo completo para la cuenta de la operadora (Jennifer) y su Claude

> FUENTE DE VERDAD de las instrucciones. La Routine o el Project de Jennifer lleva solo el «arranque» de abajo; Claude clona el
> repo y lee este archivo, así las mejoras entran solas sin tocar su prompt. Copia legible en Google Docs
> («Registro de envíos — instrucciones (Dinsides y Shalom)», id `1nFZ1oTb2ItChRiC4-4ebhktAGK2vmIF6yuaJjNk1w1c`, compartido con el
> correo del dueño y el de la empresa); si el Doc y este archivo difieren, manda este archivo. Última revisión: 2026-11-11 (link fijo por día, página solo con lo que se registra, nota del motorizado limpia, reposiciones fuera,
> 2+ kits = 1 paquete XS). Antes: 2026-11-09 (madrugada: página de revisión sin PDF, notas se leen solas, Shalom antes que los pendientes de Lima).

## Arranque (lo único que va en la Routine o el Project de Jennifer)

```
Trabajas para Tarot Store Perú en el repo jadsajsdlkdqwioqodkwl/claudetarot. Primero corre:
(cd /home/user/claudetarot 2>/dev/null && git fetch -q origin main && git checkout -q main 2>/dev/null; git merge -q --ff-only origin/main || (git stash -q 2>/dev/null; git merge -q --ff-only origin/main)) || GIT_TERMINAL_PROMPT=0 git clone -q --depth 20 https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot
Luego lee SOLO /home/user/claudetarot/docs/envios-jennifer.md y haz lo que dice. Si el mensaje que te llegó no dice qué hacer
(solo trae un link, «INICIA», «Run now» o está vacío), haz el CICLO COMPLETO de ese archivo (Dinsides y luego Shalom): nunca
termines sin hacer nada. Si dice «solo Lima» o «solo Shalom», haz esa parte. La clave del asesor está en la variable de entorno
ASESOR_CLAVE (no la imprimas); si falta o el Worker responde 401, dilo y termina. No hagas commits ni cambies código. No uses la
API de Claude. Trabaja solo con python3 scripts/asesor/dinsides.py y python3 scripts/asesor/shalom.py desde /home/user/claudetarot.
```

Nota (2026-11-09): el arranque sincroniza con `git merge --ff-only` (un `reset --hard` lo bloqueó el permiso de la sesión y la Routine
leyó instrucciones viejas). Si la sincronización falla, dilo en la primera línea y sigue con lo que tengas.

## LO QUE CAMBIÓ EL 2026-11-11 (dueño: «más fácil para Jennifer; que la IA haga el trabajo pesado»). MANDA sobre lo de abajo si se contradicen

1. **La página de revisión tiene UN link fijo por despacho** (`…/r/envios-AAAA-MM-DD-<clave>`). Cada `presentar --pagina` actualiza
   ESE MISMO link; lo que la asesora marcó (OK / corrección / no va / ya se envió y su nota) se guarda por pedido y NO se pierde.
   Si te escriben «actualiza» (o llegó algo nuevo), vuelve a correr `python3 scripts/asesor/dinsides.py presentar --pagina` y
   responde con el mismo link: lo nuevo aparece con la marca NUEVO y lo ya registrado desaparece solo.
2. **La página trae SOLO lo que la asesora registra**: Lima para registrar, Shalom, Olva, y «falta un dato» (pedidos con dirección o
   pago a los que les falta algo, con lo que hay que pedirle al cliente). NO trae entregados, registrados, anulados, motorizado
   externo, pedidos de otros días, chats de hoy ni controles: eso lo lees TÚ en la pantalla (la salida de `presentar`) y lo resuelves
   tú; lo que el dueño deba saber le llega en su reporte «Saldos y reposiciones». No se lo cuentes a la asesora.
3. **Tu respuesta en la sesión es CORTA** (ya no se pega la salida completa): el link fijo, una línea con los números («Lima 11 ·
   Shalom 6 · Olva 1 · falta un dato 2»), y SOLO las preguntas que una persona debe contestar (una línea cada una, con nombre y
   WhatsApp). Si un control de la pantalla sale ❌ y no lo puedes resolver tú, es una pregunta más. Cierra con: «Marca en la página y
   escríbeme “listo”; o responde OK / OK Shalom».
4. **Trabajo pesado antes de presentar** (tú, no la asesora): corre `dinsides.py estados` (ahora cruza Dinsides también con los
   teléfonos que aparecen en el chat —contacto compartido, número de quien recibe— y cierra solo en la hoja lo ENTREGADO, lo
   ANULADO o RECHAZADO, lo que ya está REGISTRADO y lo que la nota dice que salió por motorizado externo). Lee los chats de los
   bloqueados, de los candidatos del CRM y de «chats de hoy» con señal, y agrega o corrige en salida.json. Solo llega a la página lo
   que de verdad necesita un OK o un dato.
5. **Reposiciones y cambios NO van por aquí** (los despacha otro equipo): el sistema ya no arma ficha de Dinsides para `tipo`
   REPOSICION / CAMBIO ni los pone en la página. No los registres ni los presentes.
6. **Detalle = nota para el motorizado.** El sistema deja solo cómo contactar, a quién entregar, dónde dejarlo y el horario; quita
   pagos («ya pagó 89», «cobrar 0»: eso va en Cobrar y tipo de pago), pines y coordenadas, y apuntes internos. Si al corregir escribes
   una `nota`, respeta lo mismo. El producto lleva el NOMBRE de lo que va («Cuenco tibetano 13 cm + mazo Tarot Rider Waite de
   aprendizaje»), nunca «Reposición / cambio» en una venta.
7. **Shalom: 2 o más kits = UN paquete XS, cantidad 1** (no N paquetes XXS). 1 kit = 1 paquete XXS. Lo pone el sistema en el Excel
   masivo y en la presentación; en el registro a mano, igual.
8. **Etiquetas:** todas las de Shalom llevan «EMPAQUE: …» (1 kit normal, «3 KITS (Paquete XS)», extras). Si pasas las de Shalom por
   archivo (`--shalom datos.json`) y no pones `empaque`, el script lo busca por DNI en el reporte; puedes ponerlo tú en cada ítem.
9. **Última revisada del despacho (antes de dar por cerrado el ciclo):** todo lo REGISTRADO en Dinsides en este ciclo tiene etiqueta
   (cuenta de `registrar` = cuenta de Lima en `etiquetas.py`), cada provincia con adelanto de hoy está en Shalom u Olva o es una
   pregunta, y lo agendado para otro día que ya está en Dinsides no se vuelve a registrar.

REGLA CERO (dueño, 2026-11-09): cada vez que te llegue un mensaje en esta sesión DESPUÉS de haber presentado (sea «OK», «listo»,
«registralos», una pregunta o cualquier cosa), lo PRIMERO que haces es `python3 scripts/asesor/dinsides.py notas` (sin argumentos:
lee la última página de revisión que dejó `presentar`). Lo que el dueño marcó en la página vale igual que si lo hubiera escrito en la
sesión: aplícalo (A4c) y recién después contestas. Nadie tiene que decirte «revisa mis notas».

Cómo se usa: Jennifer (o el dueño) manda «INICIA» a su sesión (o la Routine manual hace «Run now»). Claude hace todo el ciclo
solo, se detiene UNA vez por courier para presentar lo que va a registrar, y sigue cuando una persona responde en esa misma
sesión («OK», correcciones, la clave del día). Las respuestas a los pendientes se escriben ahí y Claude termina el trabajo con ellas.

## Reglas fijas (del dueño; no se negocian)
1. **Presentar antes de registrar.** NUNCA se registra un pedido en Dinsides ni se sube el Excel de Shalom sin haber presentado
   antes la lista completa (paso A4 / B2) y sin que una persona haya respondido «OK» en la sesión. Sin OK, nada sale.
2. Nunca se escribe al cliente. Nunca se inventa una dirección, un distrito, una agencia, un DNI, un monto ni una clave.
3. Todo pedido se registra para el DÍA SIGUIENTE; el corte es a las 3:00 de la madrugada (hasta esa hora sigue siendo «la noche de
   ayer»). El sistema ya pone la fecha. Pasadas las 3:00 y hasta las 6:00, si el despacho de HOY todavía tiene pedidos de Lima sin
   registrar (CONFIRMADOS con dirección; p. ej. el dueño dio el OK a las 3:20), el sistema se queda en HOY y lo dice en el RESUMEN («📆 Fecha … porque …»); no
   saltes a mañana por tu cuenta. Si necesitas otra fecha, pásala: `presentar AAAA-MM-DD --pagina`.
   **Cómo trabaja Dinsides (dueño, 2026-11-09):** se puede registrar para HOY hasta las 6:00 de la mañana. Dinsides pasa por la
   tienda a eso de las 8:00 y se lleva TODO lo registrado que todavía no tiene en su almacén, sea cual sea su fecha de entrega: lo
   de hoy lo reparte de 12 a 5, y lo de otro día (p. ej. Liliana, registrada el 09 con entrega el 12) lo guarda en su almacén
   hasta esa fecha. Lo que se registró en días anteriores ya está en su almacén. Por eso las etiquetas son solo de lo REGISTRADO en
   el ciclo (6:00 de ayer → 6:00 de hoy), nunca de lo que ya se llevaron. Si el cliente pidió otro día, va con esa fecha. Los domingos no se registra nada.
4. El distrito de Lima es el del MAPA DE COBERTURA de Dinsides (el polígono donde cae el pin o la dirección ubicada). El sistema lo
   resuelve; solo cuando la dirección no se puede ubicar se pregunta.
5. Las claves de seguridad de Shalom son sagradas: solo existe la clave del día que da el dueño en la sesión. Nadie asigna otra.
   Nunca van en Telegram ni en respuestas: solo en el archivo de referencia.
6. **Notas completas.** Todo lo que no sea «1 kit normal a S/89» se ve en la presentación y en la nota que llega al courier:
   2 o más kits, mazo u oráculo extra, otro modelo (Gold, Rider en español…), pedido del catálogo, collar o regalo prometido, lo que
   NO lleva (`kits: 0`), descuento o precio negociado, adelanto y saldo, «ya pagó», horario, piso, portero, discreción. **Forma de
   pago: si el cliente no la dijo, es YAPE** (dueño 2026-11-10); «Yape, efectivo o tarjeta al recibir» = varias opciones = YAPE.
   POS o EFECTIVO solo cuando el cliente lo pidió. El reporte
   trae los montos en texto («Adelanto S/20; saldo S/69», «Pagado S/89», «Yape contraentrega S/69»): el sistema los lee y calcula
   lo que se cobra; si hay duda lo marca con «MONTO» y se pregunta. Precio de lista: 1 kit S/89, 2 kits S/149, 3 kits S/199.
7. Herramientas: SOLO `python3 scripts/asesor/dinsides.py …` y `python3 scripts/asesor/shalom.py …` desde /home/user/claudetarot.
   Nada de curl ni D1. Cada chat se lee una sola vez (`dinsides.py chat <whatsapp> 60`).

## CICLO COMPLETO = A (Dinsides) y luego B (Shalom)

### A. Dinsides (Lima)

A1 — `rm -rf /tmp/dinsides && python3 scripts/asesor/dinsides.py preparar`
Imprime LISTOS, CON BLOQUEOS (motivo ⛔ y direcciones que escribió el cliente), YA REGISTRADOS y CANDIDATOS DEL CRM (chats de la
noche con pin, dirección o compra marcada que el reporte no trae). Luego `python3 scripts/asesor/dinsides.py estados`: marca en la
hoja «Pedidos auto» y en los chats lo ENTREGADO, ANULADO y RECHAZADO según Dinsides; anota el resumen. Sin pedidos de Lima →
escribe «Sin pedidos de Lima para registrar» y pasa a B.

A2 — Por cada bloqueado y cada candidato que no diga «parece PROVINCIA»: `python3 scripts/asesor/dinsides.py chat <whatsapp> 60`
y busca en lo que escribió EL CLIENTE («C:»):
- Dirección en texto → `direccion` completa con referencias, sin emojis. Solo pin → CON EL PIN BASTA (dueño 2026-11-09): el sistema arma la
  dirección desde el pin (OpenStreetMap) y el pedido queda LISTO con la alerta «DIRECCIÓN deducida del pin»; si el chat trae referencias,
  agrégalas en `direccion`. Solo si el pin no se pudo convertir queda pendiente. En la presentación, cada dirección deducida lleva la
  línea «🔎 VERIFICAR EN GOOGLE MAPS»: pídele a la asesora (o al dueño) que abra el link y confirme que la dirección coincide con el pin
  antes del OK; si no coincide, corrige con «X: dirección …».
- Un pedido para otro día (p. ej. jueves) se registra YA en Dinsides con esa fecha y queda además en la hoja «Pedidos auto» (fila con su
  fecha) y en la agenda del reporte de ese día: dilo en la presentación («queda agendado para el DD en Dinsides #id, hoja fila N»).
- Distrito: con pin manda el mapa (`python3 scripts/asesor/dinsides.py zona <lat,lng>`); sin pin, el del desplegable si la dirección
  lo dice sin dudas; ambiguo («San Juan», «Lima», «Callao»), zona roja o punto de encuentro → pendiente.
- POR_VERIFICAR o INTENCIÓN: si el cliente ya pasó su dirección, `estado: "CONFIRMADO"`; si no, pendiente.
- Extras, montos y casos especiales (regla 6): lo que veas en el chat y no esté en la ficha va en `empaque` (qué lleva o no lleva),
  `cobrar` (si el chat acordó otro monto o ya pagó) y `nota` (horario, piso, portero, «ya pagó», discreción).
- Candidato de Lima confirmado (dio dirección) que el reporte no trae → se agrega a `pedidos` completo con `estado: "CONFIRMADO"`.
- Lo que la hoja «Pedidos auto» ya diga en la columna Dinsides («ok», «distrito: …», «no», «manual …») se respeta.
- YA AGENDADO / YA REGISTRADO (caso Laura, 2026-11-09): el sistema cruza cada pedido con los pedidos ABIERTOS de Dinsides por
  teléfono y por nombre. Si ya existe, sale en YA REGISTRADOS con su #id y NO se crea otro; si está para otra fecha, la alerta dice
  «YA AGENDADO … para el DD». En la presentación (A4) se informa «ya estaba agendado en Dinsides (#id, fecha X)»; si el cliente
  cambió la fecha, con el OK se corre `python3 scripts/asesor/dinsides.py editar <id> fecha_entrega=AAAA-MM-DD`, nunca `registrar`.

A2b — ÚLTIMA REVISADA (dueño 2026-11-09): antes de presentar, pasa una vez por los chats del día con INTENCIÓN o POR_VERIFICAR y
por los candidatos del CRM (los trae `preparar`; léelos con `chat <whatsapp> 40`) buscando (a) el dato que faltaba y ya llegó (DNI,
dirección, agencia), (b) un pedido pendiente de otro día al que el cliente le escribió (reclamo, «¿cuándo llega?», pago del saldo)
y (c) ventas que se pueden salvar con una sola pregunta. Lo de (a) entra a `pedidos`; lo de (b) y (c) va en la presentación como
PENDIENTE con la pregunta exacta para la asesora (tú nunca escribes al cliente). Prefiere una falsa alarma arriba a que algo quede
abajo sin que nadie lo vea.

Domingos y hora específica → MOTORIZADO DE CONFIANZA (dueño 2026-11-09). Dinsides reparte de 12 a 5 pm y no reparte los domingos.
- Si el día de entrega es domingo: NO registres en Dinsides. Presenta las fichas igual y, con el OK, corre la sección C (motorizado).
- Si una ficha trae la alerta «HORA ESPECÍFICA pedida (…)», en la presentación va como PENDIENTE con la pregunta: «X pide a las 5 pm:
  ¿Dinsides (12–5 pm) o motorizado de confianza?». Si el dueño responde «motorizado», ese pedido sale de Dinsides y va a la sección C;
  si responde «Dinsides» u «OK», se registra en Dinsides.
- Un pedido que ya salió por motorizado queda marcado en la memoria y en la hoja («Motorizado externo FECHA»): no se vuelve a registrar.
- ANULADO en Dinsides: si el sistema dice «ESTABA REGISTRADO pero en Dinsides figura ANULADO», el pedido vuelve a estar pendiente (el
  equipo lo anuló: duplicado, cambio de fecha…). Se presenta de nuevo como LISTO o PENDIENTE y con el OK se registra otra vez; nunca
  lo des por registrado.

A3 — /tmp/dinsides/salida.json con SOLO lo que se corrige o agrega:
`{"pedidos": [{"whatsapp": "51…", "distrito": "…", "direccion": "…", "coordenadas": "lat,lng", "nombre": "…", "nota": "…",
"kits": 1, "empaque": "…", "cobrar": 89, "estado": "CONFIRMADO", "fecha_entrega": "AAAA-MM-DD"}]}`.
Sin cambios: `{"pedidos": []}` toma todos los listos. OJO: si `pedidos` trae algo, solo se toman esos WhatsApp; para que los listos
también salgan, se incluyen con solo su whatsapp.

A4 — PRESENTAR (obligatorio, UNA sola vez al final, cuando ya leíste los chats y agregaste lo que faltaba con `shalom.py agregar` o
salida.json): `python3 scripts/asesor/dinsides.py presentar --pagina`. Si tuviste que agregar algo, vuelve a correrlo y pega SOLO la última
salida (nunca dos presentaciones en el mismo mensaje). Si `python3` es 3.11 y falla, usa `python3.12` o `python3.13`. Con `--pagina`
(`--pdf` es lo mismo) el detalle completo (chats, Dinsides, hoja, candidatos, chats de hoy) se sube como PÁGINA DE REVISIÓN a CRM →
Reportes y en pantalla sale la VERSIÓN CORTA, que es lo que pegas en la sesión. NO se genera PDF (dueño: «si ya vas a mandar página,
ya no mandas el PDF»); solo si el dueño pide uno para imprimir agregas `--imprimir`. Orden de la salida (del dueño): Lima listos →
Shalom → Lima pendientes (rojo) → ya registrados → correcciones → otros días → chats de hoy y CRM revisado (al final, en una línea:
no suman: salen solo si traen algo que leer). Los YA REGISTRADOS no se listan (solo cuentan en el RESUMEN). En cada tarjeta:
etiqueta → verificar → nota → botones «OK, va así…» → al final los momentos clave del chat. Por
pedido la ETIQUETA (Dinsides: Negocio · ENTREGAR A · Teléfono · Producto · Cobrar · Distrito · Fecha Entrega · Detalle; Shalom:
Destinatario · N°DOC · Destino · Mercadería · Adelanto/Saldo), su estado (✅ listo · ✅❓ listo pero confirmar · ❓ pendiente · ↩️ ya
registrado), la nota 📣 para la asesora (lo que NO va a Dinsides), la línea 🔎 VERIFICAR, correcciones, resumen de candidatos y chats
de hoy, lista de verificación y el link de la página. Sin `--pagina` imprime todo (y, si quieres comprobar el payload exacto,
`registrar /tmp/dinsides/salida.json --simular`). `presentar` imprime, en el formato del dueño, UN bloque por pedido: ficha
completa (cliente · teléfono · dirección · distrito y de dónde salió · producto · cobrar y forma · fecha · nota para el motorizado),
LO QUE ESCRIBIÓ EL CLIENTE con fecha y hora (dirección, horas, fechas, pagos, cambios), su estado en Dinsides (sin pedido / ANULADO
#… / abierto #…), su fila en la hoja, los ⛔ y las alertas, y la decisión. Después: los YA REGISTRADOS en una línea, el CRM
revisado (candidatos que el reporte no trae) y los PEDIDOS PENDIENTES DE OTROS DÍAS CON MENSAJE NUEVO del cliente (datos que
llegaron, cambios, reclamos).
La salida termina con «💬 CHATS DE HOY» (todos los chats con mensaje del cliente hoy que no son pedido ni candidato, con su último
mensaje: pásales la vista y lee con `chat` el que hable de dirección, pago, agencia o fecha) y con la «LISTA DE VERIFICACIÓN» (cada
fuente con ✅ o ❌: reporte, hoja, Dinsides, boletas, chats). Si una fuente sale ❌, dilo en la primera línea de tu respuesta.
Las líneas «🔎 VERIFICAR …» (Google Maps para cada dirección de Lima, agencia de Shalom para cada provincia) son para la asesora o el
dueño: déjalas tal cual; una persona corrobora antes del OK porque cambiar una agencia o una dirección después cuesta tiempo y plata.
Quien ya tiene BOLETA emitida o está ENTREGADO en Dinsides no es un pedido pendiente: no lo propongas ni lo listes como «sin DNI»;
el sistema ya lo saca de Shalom y lo marca «ya atendido» en el CRM revisado. Si dudas, el 🧾 de cada bloque te lo dice.
Tu respuesta en la sesión es ESA SALIDA PEGADA TAL CUAL (no la resumas, no la conviertas en tabla) más, debajo de cada bloque, UNA
línea tuya «Lectura: …» cuando haga falta: lo que resolviste leyendo el chat (p. ej. «dirección en texto encontrada: …», o la
secuencia «primero pidió X, después propuso Y, al final pagó y la asesora agendó Z → confirmar con el dueño»). Un LISTO con alerta
«HORA ESPECÍFICA» o con nota 🚨 que hable de fecha NO se da por listo: va como PREGUNTA al dueño («¿lunes por Dinsides o
miércoles?», «¿Dinsides 12–5 pm o motorizado?»).
Para cada pendiente de otros días con mensaje nuevo, di qué llegó y la decisión (Lima → se agrega a salida.json; provincia → va al
próximo Shalom; reclamo → al dueño). Termina SIEMPRE con estas líneas de verificación, con números reales:
«Verificado: CRM revisado (N candidatos, M agregados) · Dinsides consultado (K abiertos, J anulados detectados) · pendientes de
otros días con mensaje: X · Telegram enviado: sí/no». Y la frase: «Responde OK para registrar los LISTOS, o corrige (ej.: “Judith:
Av. X 123, Comas” / “Pedro: cobrar 69” / “María no va” / “Mavel: miércoles”).»
Manda lo mismo al dueño por Telegram: `python3 scripts/asesor/dinsides.py telegram "<los bloques, acortados a 30 líneas>"`.
Cada vez que nombres a un cliente (pendiente, candidato, descartado) pon su WhatsApp al lado: «Jessica 51977777986», nunca solo el nombre.
PROHIBIDO: frases de proceso («Estoy corriendo el ciclo…», «Sigo con…»), resúmenes sin datos, tablas que esconden la nota, decir
«hay que verificar» sin haber leído el chat. Todo lo que afirmes sale de `presentar` o del chat, con fecha y hora.
Y DETENTE: no registres nada hasta que una persona conteste en la sesión.

A4b — ETIQUETAS PARA LAS CAJAS: después de registrar (A5), `python3 scripts/asesor/etiquetas.py --subir --shalom-hoja --olva-hoja` (sin fecha:
el script elige solo el día de recojo; hasta las 6:00 es hoy) imprime las etiquetas de Lima de lo REGISTRADO en este ciclo (6:00 de
ayer → 6:00 de hoy, con cualquier fecha de entrega: lo de otro día Dinsides lo guarda en su almacén) y NO las de ciclos anteriores
(ya están en el almacén de Dinsides; el dueño no las quiere otra vez). Formato Dinsides, 3×5; al pie de cada una, en letra chica y
varias líneas, «EMPAQUE: …» (lo que lleva la caja). Con `--shalom-hoja` agrega las etiquetas de Shalom de lo que el equipo registró
A MANO en Shalom Pro en este ciclo (orden, destinatario, DNI, destino y agencia; el «Código» de Shalom no se guarda y queda en blanco).
Con `--olva-hoja` agrega las etiquetas de Olva (A6). Todas las etiquetas llevan la fecha del despacho (Lima: Fecha Entrega; Shalom y
Olva: «Despacho dd/mm/aaaa») y el script avisa si las de Lima no dicen todas la misma fecha. Las de Shalom llevan el «Código» de 4
letras cuando está en la columna Enviado («cód XXXX», lo pasa el dueño con la captura de Shalom Pro) y, al pie, la nota «EMPAQUE: …».
La hoja va con 4 mm de margen (lo mínimo que imprimen las impresoras) y las 5 filas reparten todo el alto. Deja el PDF en CRM →
Reportes; da el link. Las de Shalom del Excel masivo las imprime Shalom Pro.

A4c — LAS NOTAS DEL DUEÑO (página de revisión): `presentar --pagina` deja la PÁGINA DE REVISIÓN (link en la salida) donde
el dueño o la asesora marcan por pedido OK / Corrección (con texto) / No va / Ya se envió, y se guarda sola. `presentar` guarda el id
en /tmp/dinsides/revision.json; con CUALQUIER mensaje que llegue después (REGLA CERO), corre `python3 scripts/asesor/dinsides.py notas`
(sin argumentos lee esa última página; también acepta `<id o link>`): te lista las decisiones.
Aplica: OK → esos WhatsApp van a salida.json y se registran (A5); Corrección → aplica el texto (dirección, distrito, agencia, cobrar,
fecha, «motorizado» → sección C) y vuelve a presentar SOLO esos; No va → `marcar <whatsapp> "" "no va: <motivo>"`; Ya se envió →
`python3 scripts/asesor/reporte.py enviado <whatsapp> "sí <fecha> <courier> (según el dueño)"`. Para Shalom: OK → entra al Excel;
corrección de agencia → /tmp/shalom/agencias.json. Un «OK» escrito en la sesión vale igual que marcar OK en la página.
Si el dueño dice que ya registró a mano algunos en Shalom Pro (manda las etiquetas o los nombres), ciérralos con `reporte.py enviado
<whatsapp> "sí <fecha> Shalom <nro de orden> (registrado a mano)"`: el Excel lleva solo los que faltan.

A5 — Con la respuesta:
- «OK» → `python3 scripts/asesor/dinsides.py registrar /tmp/dinsides/salida.json` (el mismo archivo, sin `--simular`).
  Lee: ✅ Registrado #id · ↩️ Ya estaba · ⛔ No registrado con bloqueos · ❓ No confirmado · «dinsides_rechazo» (no insistir más de una
  vez). Responde en la sesión qué se registró (#id) y qué quedó pendiente.
- Correcciones → aplícalas en salida.json (solo esos WhatsApp, `estado: "CONFIRMADO"` si confirman) y vuelve a A4 SOLO con lo
  cambiado; con el siguiente OK registras.
- «X no va» → `python3 scripts/asesor/dinsides.py marcar <whatsapp> "" "no va: <motivo>"`.
- Un pendiente que nadie resuelve se queda pendiente; nunca se registra sin el dato.

Otros comandos: `dinsides.py anular <id>` (antes de la ruta), `dinsides.py editar <id> fecha_entrega=… distrito=… direccion=…`,
`dinsides.py listado` (historial), `dinsides.py quitar <whatsapp> [fecha]` (si el panel dice otra cosa que la memoria).

### A6. Olva (provincia que va por Olva, no por Shalom)
Los pedidos de provincia cuya agencia dice «Olva» salen en `presentar` en su propia sección 🟠 OLVA, en grande, como otra venta
(dueño 2026-11-10): ETIQUETA OLVA (Destinatario · DNI · Teléfono · Olva de destino · Envía) y 🔎 VERIFICAR OLVA. La «Olva de destino»
tiene que ser una tienda o agente de https://www.olvacourier.com/ubicanos/ (lista en `data/olva-agencias.json`, se actualiza con
`python3 scripts/asesor/olva.py actualizar`; `olva.py buscar "texto"` muestra las candidatas) y calzar con lo que escribió el
cliente. Olva no se registra en ningún sistema desde aquí: una persona lo lleva a la agencia; la etiqueta la imprime
`etiquetas.py --olva-hoja` junto con las demás. Si la agencia no es segura, lo dice y una persona la confirma.

**Clave de Olva (dueño, 2026-11-10):** la clave de recojo de Olva es SIEMPRE la misma. No se escribe en el repo ni en Telegram ni
en un mensaje de la asesora: vive en la variable de entorno OLVA_CLAVE de la sesión de la Routine (la pone el dueño, como
ASESOR_CLAVE). Al presentar un Olva listo, `python3 scripts/asesor/shalom.py clave "$OLVA_CLAVE" <lote.json>` deja su venta en la
hoja Ventas con esa clave (es la que el CRM le manda al cliente cuando paga el saldo). Si la variable falta, dilo y no inventes una.
**Shalom expira a las 24 h (dueño, 2026-11-10, caso Elia):** si el paquete no llega a la agencia en 24 h, Shalom anula la orden y hay
que registrarla de nuevo (nuevo número y nuevo código). Cuando el dueño pase la captura con «N° de Orden» y «Cód.», cierra la fila
con `reporte.py enviado <wa> "sí FECHA Shalom NNN cód XXXX (registrado a mano por el dueño)"` (si la fila ya estaba cerrada con la
orden vieja, el Worker acepta `fila` en `marcar`): `etiquetas.py --shalom-hoja` lee de ahí el número y el código.

### A7. Controles finales (checkboxes del dueño, al final de `presentar`)
La salida termina con «☑️ CONTROLES FINALES», calculados con datos reales (no se marcan a mano): ningún pedido de Lima de un
día anterior sin enviar (hoja atrasados CONFIRMADO sin pedido en Dinsides) · polígono revisado (cada listo con pin: el polígono
del mapa de Dinsides donde cae el pin coincide con el distrito de la etiqueta; si no, ❌ y se corrige antes del OK) · reagendados ya
en Dinsides para hoy (no se tocan ni llevan etiqueta nueva) · agendados para más adelante en Dinsides y en la hoja (esa es la memoria
entre sesiones; el que sale mañana aparece con ⏰ SALE MAÑANA y se registra ese día) · provincia: Shalom / Olva / sin agencia o sin
adelanto · Shalom registrados a mano sin boleta (❓ verificar en Shalom Pro que no expiró) · Dinsides con entrega pasada sin
ENTREGADO · **fechas: cada pedido registrado en este despacho está en Dinsides con la misma fecha que se pidió** (200 % seguros).
Si un control sale ❌, dilo en la primera línea de tu respuesta y resuélvelo (o pregunta) antes del OK.

### B. Shalom (provincia): Excel de envío masivo

B1 — La presentación de provincia YA VIENE en la misma salida de `python3 scripts/asesor/dinsides.py presentar` (sección «🚚 SHALOM»):
por pedido, cliente · WhatsApp · DNI, la agencia que escribió el cliente, la agencia de Shalom que calza (SEGURA o DUDOSA con las
candidatas), qué lleva, adelanto y saldo, nota, boleta, estado en Dinsides y el chat; y si es LISTO para el Excel o PENDIENTE (sin DNI,
agencia por confirmar, monto por confirmar). Incluye los pendientes de la hoja (ATRASADO / CORRECCIÓN: p. ej. la clienta cuyo DNI
llegó después). Preséntala junto con Lima, en el mismo mensaje y en el mismo Telegram: el dueño quiere UN texto con los dos couriers.
Un provincia que viene del CRM (no está en el reporte ni en la hoja) sale numerado como PENDIENTE: lee su chat y, si tiene nombre,
DNI, agencia y adelanto, agrégalo con `python3 scripts/asesor/shalom.py agregar <whatsapp> --nombre "…" --dni … --agencia "<texto del
cliente>" --pago "…"` (queda en la hoja como CONFIRMADO y entra al masivo); si le falta algo, va como pregunta.
Para una agencia dudosa: `python3 scripts/asesor/dinsides.py chat <whatsapp> 60` y `python3 scripts/asesor/shalom.py buscar "<texto>"`;
si calza sin duda, anótala en /tmp/shalom/agencias.json `{"51987654321": "AV PARRA 379"}` (nombre de agencia = último tramo del código).
NO corras `shalom.py masivo` antes del OK: arma el Excel y, con `--subir`, lo publica; es el paso B3.

B2 — El OK de provincia se pide en el mismo cierre: «Responde OK Shalom (o “OK Shalom clave NNNN” si tienes la clave del día) para armar y
subir el Excel». Sin OK no se arma nada.

B3 — Con «OK Shalom»: `python3 scripts/asesor/shalom.py masivo --subir --salida /tmp/shalom/masivo.xlsx` (agrega `--agencias
/tmp/shalom/agencias.json` si hubo ajustes y `--clave NNNN` SOLO si la persona escribió la clave del día; sin clave no toca la hoja
Ventas). Sube Excel + referencia a CRM → Reportes y muestra los dos links. Al Excel solo entran las filas con DNI y agencia resueltos;
los atrasados de la hoja entran marcados. Si el permiso de la sesión bloquea el comando, dilo tal cual al dueño (él lo corre o ajusta el
permiso); no insistas más de una vez.
- Clave que llega después (o corrección) → `python3 scripts/asesor/shalom.py clave NNNN /tmp/shalom/lote.json`.
- Agencia o DNI de un pendiente → agrégalo a agencias.json o corrige y repite B3; manda los links nuevos.
- Cierra con: «Shalom Pro → Registro de envíos masivos → subir el Excel → Continuar → clave → Registrar envíos».

### C. Motorizado de confianza (domingos y horas específicas; solo con el OK del dueño)

C1 — `python3 scripts/asesor/motorizado.py AAAA-MM-DD --solo 51…,51… --subir` (sin `--solo` toma todos los LISTOS de la fecha). Escribe
`/tmp/motorizado/FECHA/mensaje.txt` (el mensaje para pegar en el WhatsApp del motorizado: numerado, cliente · teléfono, dirección,
referencia, horario, producto, COBRAR o NO COBRAR, discreción, link de Maps) y `etiquetas.pdf` (formato Dinsides, 3×5) y sube el PDF a
CRM → Reportes. Presenta el mensaje completo en la sesión (el dueño lo copia tal cual) y el link del PDF.
C2 — Con el OK del dueño («enviado por motorizado»): `python3 scripts/asesor/motorizado.py AAAA-MM-DD --solo … --marcar` → quedan
como ENVIADOS POR MOTORIZADO EXTERNO en la memoria (no se registran en Dinsides) y en la hoja («Enviado = Motorizado externo FECHA»).
Las boletas del motorizado las define el dueño (pendiente: pasará el formato); mientras, no se generan.

### Cierre del ciclo
Una respuesta final en la sesión (máximo 15 líneas): Lima registrados (nombre · distrito · S/ · #id) y pendientes con su pregunta;
Shalom: cuántos envíos, los dos links y pendientes; qué marcó `estados`. Nada de claves.

## Lo que hace la persona después (Jennifer o el dueño)
- Dinsides: nada, salvo responder OK o las preguntas. Lo registrado aparece en https://dinsidescourier.com/pedido/listado_cliente.
- Shalom: descargar el Excel del link, subirlo en Shalom Pro → Registro de envíos masivos → Continuar, revisar nombres y celulares que
  Shalom autocompleta por DNI, poner la clave (CLAVE MASIVA si es una sola) y «Registrar envíos». Imprimir boletas.
- Etiquetas para imprimir: `python3 scripts/asesor/etiquetas.py` (fecha de entrega; Shalom y Olva por datos).
- La hoja de todos los pedidos: libro «Pedidos Tarot Kit», pestaña «Pedidos auto» (columnas «Enviado» y «Dinsides»); provincia en «Ventas».
  Link: https://docs.google.com/spreadsheets/d/1kcoEEG6E2uHFLQ_wjjq6oVMQg4bzvIqmPYygiBT6qQc/edit#gid=1131206013
