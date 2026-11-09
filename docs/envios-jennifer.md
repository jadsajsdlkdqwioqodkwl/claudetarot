# Registro de envíos (Dinsides y Shalom): ciclo completo para la cuenta de la operadora (Jennifer) y su Claude

> FUENTE DE VERDAD de las instrucciones. La Routine o el Project de Jennifer lleva solo el «arranque» de abajo; Claude clona el
> repo y lee este archivo, así las mejoras entran solas sin tocar su prompt. Copia legible en Google Docs
> («Registro de envíos — instrucciones (Dinsides y Shalom)», id `1nFZ1oTb2ItChRiC4-4ebhktAGK2vmIF6yuaJjNk1w1c`, compartido con el
> correo del dueño y el de la empresa); si el Doc y este archivo difieren, manda este archivo. Última revisión: 2026-11-09 (noche: fichas completas en A4).

## Arranque (lo único que va en la Routine o el Project de Jennifer)

```
Trabajas para Tarot Store Perú en el repo jadsajsdlkdqwioqodkwl/claudetarot. Primero corre:
(cd /home/user/claudetarot 2>/dev/null && git fetch -q origin main && git checkout -q main && git reset -q --hard origin/main) || GIT_TERMINAL_PROMPT=0 git clone -q --depth 20 https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot
Luego lee SOLO /home/user/claudetarot/docs/envios-jennifer.md y haz lo que dice. Si el mensaje que te llegó no dice qué hacer
(solo trae un link, «INICIA», «Run now» o está vacío), haz el CICLO COMPLETO de ese archivo (Dinsides y luego Shalom): nunca
termines sin hacer nada. Si dice «solo Lima» o «solo Shalom», haz esa parte. La clave del asesor está en la variable de entorno
ASESOR_CLAVE (no la imprimas); si falta o el Worker responde 401, dilo y termina. No hagas commits ni cambies código. No uses la
API de Claude. Trabaja solo con python3 scripts/asesor/dinsides.py y python3 scripts/asesor/shalom.py desde /home/user/claudetarot.
```

Cómo se usa: Jennifer (o el dueño) manda «INICIA» a su sesión (o la Routine manual hace «Run now»). Claude hace todo el ciclo
solo, se detiene UNA vez por courier para presentar lo que va a registrar, y sigue cuando una persona responde en esa misma
sesión («OK», correcciones, la clave del día). Las respuestas a los pendientes se escriben ahí y Claude termina el trabajo con ellas.

## Reglas fijas (del dueño; no se negocian)
1. **Presentar antes de registrar.** NUNCA se registra un pedido en Dinsides ni se sube el Excel de Shalom sin haber presentado
   antes la lista completa (paso A4 / B2) y sin que una persona haya respondido «OK» en la sesión. Sin OK, nada sale.
2. Nunca se escribe al cliente. Nunca se inventa una dirección, un distrito, una agencia, un DNI, un monto ni una clave.
3. Todo pedido se registra para el DÍA SIGUIENTE; el corte es a las 3:00 de la madrugada (hasta esa hora sigue siendo «la noche de
   ayer»). El sistema ya pone la fecha. Si el cliente pidió otro día, va con esa fecha. Los domingos no se registra nada.
4. El distrito de Lima es el del MAPA DE COBERTURA de Dinsides (el polígono donde cae el pin o la dirección ubicada). El sistema lo
   resuelve; solo cuando la dirección no se puede ubicar se pregunta.
5. Las claves de seguridad de Shalom son sagradas: solo existe la clave del día que da el dueño en la sesión. Nadie asigna otra.
   Nunca van en Telegram ni en respuestas: solo en el archivo de referencia.
6. **Notas completas.** Todo lo que no sea «1 kit normal a S/89» se ve en la presentación y en la nota que llega al courier:
   2 o más kits, mazo u oráculo extra, otro modelo (Gold, Rider en español…), pedido del catálogo, collar o regalo prometido, lo que
   NO lleva (`kits: 0`), descuento o precio negociado, adelanto y saldo, «ya pagó», horario, piso, portero, discreción. El reporte
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
- Dirección en texto → `direccion` completa con referencias, sin emojis. Solo pin → pendiente (el bloqueo trae el link de Maps).
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

A4 — PRESENTAR (obligatorio): `python3 scripts/asesor/dinsides.py registrar /tmp/dinsides/salida.json --simular`
Hace todo menos registrar e imprime «FICHAS COMPLETAS»: EXACTAMENTE lo que se mandaría a Dinsides, campo por campo (Tipo de
pedido · Nombre · Teléfono · Fecha de entrega · Distrito · Dirección · Coordenadas · Producto · Cobrar S/ · Tipo de pago ·
Observación). Preséntalas TAL CUAL en la sesión, una ficha por pedido, sin resumir ni cambiar nada (el dueño quiere ver
exactamente lo que va a quedar en Dinsides), y debajo de cada una las alertas (·) del sistema. Los nombres del producto ya salen
como los escribe el equipo: «Kit Tarot de aprendizaje», «2 Kits Tarot de aprendizaje», «Tarot de aprendizaje» (solo el mazo),
«Tarot Gold Rider Waite», y «+ Extra: …» para lo extra; no los reescribas. Después de las fichas, los pendientes: una línea por
pedido con «PENDIENTE: <pregunta exacta>»
(«solo mandó el pin, ¿dirección en texto? [link]», «¿La Perla o Callao?», «¿ya confirmó?», «MONTO: no es kit, ¿cuánto se cobra?»).
Debajo: lo que marcó `estados`; los YA REGISTRADOS en UNA sola línea compacta («Ya en Dinsides, no se tocan: Dante #…, July #…»;
el dueño no quiere verlos como fichas), y los candidatos descartados con su motivo en una línea cada uno. Termina con:
«Responde OK para registrar los LISTOS, o corrige (ej.: “Judith: Av. X 123, Comas” / “Pedro: cobrar 69” / “María no va”).»
Manda la misma tabla al dueño: `python3 scripts/asesor/dinsides.py telegram "<tabla en texto, máximo 25 líneas>"`.
Y DETENTE: no registres nada hasta que una persona conteste en la sesión.

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

### B. Shalom (provincia): Excel de envío masivo

B1 — `rm -rf /tmp/shalom && python3 scripts/asesor/shalom.py masivo --salida /tmp/shalom/masivo.xlsx` (sin `--subir`: no sube nada).
Sin pedidos de provincia confirmados → «Sin pedidos de provincia para mañana» y fin del ciclo. Lee las líneas ⚠️: «agencia dudosa»
(con las candidatas), «sin DNI», «DNI de N dígitos», «MONTO: …», «va por OLVA», «ATRASADO: previsto para FECHA y sin boleta» (pedidos
pendientes de la hoja que no salieron en su día, p. ej. por DNI incompleto: entran al Excel si ya tienen DNI y agencia; en la
presentación se dicen aparte, con su fecha original).
Por cada «agencia dudosa»: `python3 scripts/asesor/dinsides.py chat <whatsapp> 60` (avenida, local, distrito, ciudad que escribió el
cliente) y `python3 scripts/asesor/shalom.py buscar "<ese texto>"`. Si una candidata calza sin duda, anótala con su NOMBRE DE AGENCIA
(último tramo del código, p. ej. «AV PARRA 379») en /tmp/shalom/agencias.json: `{"51987654321": "AV PARRA 379"}` y vuelve a correr
B1 con `--agencias /tmp/shalom/agencias.json`. Si no calza, queda pendiente.

B2 — PRESENTAR (obligatorio): UNA tabla en la sesión, una fila por envío:
`Cliente · DNI · Agencia (código Shalom) · Bultos · Qué lleva (kits + extras) · Adelanto · Saldo · Nota · Estado`
(«LISTO» o «PENDIENTE: ¿Av. 27 de Noviembre CO o Huaraz Independencia?» / «sin DNI» / «MONTO: …»). Debajo, cuántos entran al Excel
y para qué fecha. Termina con: «Responde OK para subir el Excel. Si tienes la clave del día, escríbela: “OK clave NNNN”; sin clave,
el Excel sube igual y las ventas de la hoja quedan sin clave hasta que la des.» Manda lo mismo al dueño con
`python3 scripts/asesor/shalom.py telegram "<tabla en texto>"` (sin claves). Y DETENTE hasta que una persona conteste.

B3 — Con la respuesta:
- «OK» → `python3 scripts/asesor/shalom.py masivo --subir --salida /tmp/shalom/masivo.xlsx` (agrega `--agencias /tmp/shalom/agencias.json`
  si hubo ajustes y `--clave NNNN` SOLO si la persona escribió la clave del día). Sube Excel + referencia a CRM → Reportes y muestra
  los dos links. Al Excel solo entran las filas con DNI y agencia resueltos.
- Clave que llega después (o corrección) → `python3 scripts/asesor/shalom.py clave NNNN /tmp/shalom/lote.json`.
- Agencia o DNI de un pendiente → agrégalo a agencias.json o corrige y repite B1→B2 solo con lo cambiado; con el OK, B3.
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
