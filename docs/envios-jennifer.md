# Registro de envíos (Dinsides y Shalom) — instrucciones para la operadora (Jennifer) y su Claude

> Este archivo es la FUENTE DE VERDAD de las instrucciones. La Routine o el Project de Jennifer solo lleva el «arranque» de abajo, que
> le dice a Claude que lea este archivo del repo recién clonado: así las mejoras llegan solas, sin tocar su prompt. Una copia legible
> vive en Google Docs («Registro de envíos — instrucciones (Dinsides y Shalom)», id `1nFZ1oTb2ItChRiC4-4ebhktAGK2vmIF6yuaJjNk1w1c`,
> compartido con el correo del dueño y el correo de la empresa (el que usa Jennifer)) y se regenera desde este archivo cuando cambia. Última revisión: 2026-11-08.

## Arranque (lo único que va en la Routine o el Project de Jennifer)

```
Trabajas para Tarot Store Perú en el repo jadsajsdlkdqwioqodkwl/claudetarot. Primero corre:
(cd /home/user/claudetarot 2>/dev/null && git fetch -q origin main && git checkout -q main && git reset -q --hard origin/main) || GIT_TERMINAL_PROMPT=0 git clone -q --depth 20 https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot
Luego lee SOLO el archivo /home/user/claudetarot/docs/envios-jennifer.md y sigue al pie de la letra la sección que te toque:
«A. Dinsides (Lima)» si te piden registrar los pedidos de Lima, «B. Shalom (provincia)» si te piden el Excel de Shalom, o las dos si
te piden «los envíos de hoy». No leas docs/MAPA.md ni CLAUDE.md. La clave del asesor está en la variable de entorno ASESOR_CLAVE
(no la imprimas); si falta o el Worker responde 401, dilo y termina. No hagas commits ni cambies código. No uses la API de Claude.
```

Cómo se dispara: Jennifer le escribe a su sesión «registra los pedidos de Lima», «arma el Excel de Shalom, la clave del día es NNNN» o
«los envíos de hoy». Las respuestas a las preguntas (dirección, distrito, agencia, confirmación, clave) se escriben en esa misma
sesión y Claude termina el trabajo con ellas.

## Reglas fijas (del dueño; no se negocian)
1. Nunca se escribe al cliente. Nunca se inventa una dirección, un distrito, una agencia, un DNI ni una clave.
2. Todo pedido se registra para el DÍA SIGUIENTE; el corte es a las 3:00 de la madrugada (hasta esa hora sigue siendo «la noche de
   ayer»). El sistema ya pone la fecha. Si el cliente pidió otro día, va con esa fecha. Los domingos no se registra nada.
3. Nadie registra a mano: lo dudoso se pregunta (a la operadora en la sesión y al dueño por Telegram) y se registra cuando lo confirman.
4. El distrito de Lima es el del MAPA DE COBERTURA de Dinsides (el polígono donde cae el pin o la dirección ubicada). El sistema lo
   resuelve; solo cuando la dirección no se puede ubicar se pregunta.
5. Las claves de seguridad de Shalom son sagradas: solo existe la clave del día que da el dueño. Nadie asigna otra. Nunca van en
   Telegram ni en respuestas: solo en el archivo de referencia.
6. Los extras (2 kits, collar o regalo prometido, mazo u oráculo, otro modelo) van en `empaque` y salen en el producto como
   «+ Extra: …». Precio de lista: 1 kit S/89, 2 kits S/149, 3 kits S/199. «Ya pagó» → NO COBRAR con S/0.
7. Herramientas: SOLO `python3 scripts/asesor/dinsides.py …` y `python3 scripts/asesor/shalom.py …` desde /home/user/claudetarot.
   Nada de curl ni D1. Cada chat se lee una sola vez.

## A. Dinsides (Lima)

PASO 0 — `rm -rf /tmp/dinsides && python3 scripts/asesor/dinsides.py preparar`
Imprime LISTOS (se registran solos), CON BLOQUEOS (con el motivo ⛔ y las direcciones que escribió el cliente), YA REGISTRADOS y
CANDIDATOS DEL CRM (chats de la noche con pin, dirección o compra marcada que el reporte no trae). Sin nada → «Sin pedidos de Lima
para registrar» y fin.
PASO 0b — `python3 scripts/asesor/dinsides.py estados`: marca en la hoja «Pedidos auto» y en los chats lo ENTREGADO, ANULADO y
RECHAZADO según Dinsides. Anota el resumen.

PASO 1 — Por cada bloqueado: `python3 scripts/asesor/dinsides.py chat <whatsapp> 60` y busca en lo que escribió EL CLIENTE («C:»).
- Dirección en texto → `direccion` completa con referencias, sin emojis. Solo pin → se pregunta (el bloqueo trae el link de Maps).
- Distrito: con pin manda el mapa (`python3 scripts/asesor/dinsides.py zona <lat,lng>`); sin pin, el nombre del desplegable si la
  dirección lo dice sin dudas; ambiguo («San Juan», «Lima», «Callao»), zona roja o punto de encuentro → se pregunta.
- POR_VERIFICAR o INTENCIÓN: si el cliente ya pasó su dirección, `estado: "CONFIRMADO"`; si no, se pregunta.
- Lo que la hoja «Pedidos auto» ya diga en la columna Dinsides («ok», «distrito: …», «no», «manual …») se respeta.

PASO 2 — Candidatos del CRM que no digan «parece PROVINCIA»: `chat <whatsapp> 60`. Si es Lima confirmado (dio dirección) y el
reporte no lo trae, se agrega a `pedidos` con whatsapp, nombre, direccion, distrito, kits/empaque, nota y `estado: "CONFIRMADO"`.

PASO 3 — /tmp/dinsides/salida.json con SOLO lo que se corrige o agrega:
`{"pedidos": [{"whatsapp": "51…", "distrito": "…", "direccion": "…", "coordenadas": "lat,lng", "nombre": "…", "nota": "…", "kits": 1,
"empaque": "…", "cobrar": 89, "estado": "CONFIRMADO", "fecha_entrega": "AAAA-MM-DD"}]}`.
Sin cambios: `{"pedidos": []}` registra todos los listos. OJO: si `pedidos` trae algo, solo se registran esos WhatsApp; para que los
listos también salgan, se incluyen con solo su whatsapp.

PASO 4 — `python3 scripts/asesor/dinsides.py registrar /tmp/dinsides/salida.json`
✅ Registrado #id · ↩️ Ya estaba (no insistir) · ⛔ No registrado con bloqueos (corregir una vez si el chat lo resuelve; si no, preguntar)
· ❓ No confirmado (reportar tal cual) · «dinsides_rechazo» (reportar, no reintentar más de una vez).

PASO 5 — `python3 scripts/asesor/dinsides.py telegram "<resumen>"`: registrados (nombre · distrito · S/ · fecha · #id); PENDIENTES con
la PREGUNTA exacta de cada uno («Judith 939984390: solo mandó el pin, ¿dirección en texto? [link]», «¿La Perla o Callao?», «¿ya
confirmó?»); qué marcó `estados`; candidatos agregados o descartados. Y la misma respuesta en la sesión (máximo 15 líneas).

PASO 6 — Cuando la operadora o el dueño respondan en la sesión con los datos de un pendiente: salida.json SOLO con esos WhatsApp y sus
correcciones (`estado: "CONFIRMADO"` si confirman) → `registrar` → responder qué se registró (#id) y qué sigue pendiente. «No va» →
`python3 scripts/asesor/dinsides.py marcar <whatsapp> "" "no va: <motivo>"`. Nunca registrar un pendiente sin que una persona dé el dato.

Otros comandos útiles: `dinsides.py anular <id>` (antes de la ruta), `dinsides.py editar <id> fecha_entrega=… distrito=… direccion=…`,
`dinsides.py listado` (historial de Dinsides), `dinsides.py quitar <whatsapp> [fecha]` (si el panel dice otra cosa que la memoria).

## B. Shalom (provincia): Excel de envío masivo

PASO 0 — `rm -rf /tmp/shalom && python3 scripts/asesor/shalom.py masivo --salida /tmp/shalom/masivo.xlsx`
Sin pedidos de provincia confirmados → «Sin pedidos de provincia para mañana» y fin. Leer las líneas ⚠️: «agencia dudosa» (con las
candidatas), «sin DNI», «DNI de N dígitos», «va por OLVA».

PASO 1 — Por cada «agencia dudosa»: `python3 scripts/asesor/dinsides.py chat <whatsapp> 60` (avenida, calle, local, distrito, ciudad
que escribió el cliente) y `python3 scripts/asesor/shalom.py buscar "<ese texto>"`. Si una candidata calza sin duda, se anota con su
NOMBRE DE AGENCIA (último tramo del código, p. ej. «AV PARRA 379») en /tmp/shalom/agencias.json: `{"51987654321": "AV PARRA 379"}`.
Si no, se pregunta (PASO 3). Un DNI que no es de 8 dígitos también se pregunta.

PASO 2 — `python3 scripts/asesor/shalom.py masivo --agencias /tmp/shalom/agencias.json --subir --salida /tmp/shalom/masivo.xlsx`
(agregar `--clave NNNN` SOLO si el dueño dio la clave del día en la sesión; quitar `--agencias …` si no hubo ajustes). Con clave, crea o
corrige las ventas de la hoja Ventas con esa clave; sin clave no toca la hoja Ventas. Sube el Excel y la referencia a CRM → Reportes y
muestra los dos links. Al Excel solo entran las filas con DNI y agencia resueltos.

PASO 3 — `python3 scripts/asesor/shalom.py telegram "<resumen>"`: cuántos envíos y para qué fecha; los dos links; si hay clave del día
decir «ventas con la clave del día: CLAVE MASIVA en Shalom Pro» (sin escribirla), si no, pedirla; pendientes con la pregunta exacta
(«Hermilio 942804951: ¿Av. 27 de Noviembre CO o Huaraz Independencia?»); recordatorio: «Shalom Pro → Registro de envíos masivos →
subir el Excel → Continuar → clave → Registrar envíos». Sin claves. Y la misma respuesta en la sesión.

PASO 4 — Respuestas en la sesión: clave del día (o corrección) → `python3 scripts/asesor/shalom.py clave NNNN /tmp/shalom/lote.json`;
agencia o DNI de un pendiente → agregar a /tmp/shalom/agencias.json o corregir y repetir el PASO 2 con `--subir` (y `--clave` si ya se
tiene); mandar los links nuevos.

## Lo que hace la persona después (Jennifer o el dueño)
- Dinsides: nada, salvo responder las preguntas. Lo registrado aparece en https://dinsidescourier.com/pedido/listado_cliente.
- Shalom: descargar el Excel del link, subirlo en Shalom Pro → Registro de envíos masivos → Continuar, revisar nombres y celulares que
  Shalom autocompleta por DNI, poner la clave (CLAVE MASIVA si es una sola) y «Registrar envíos». Imprimir boletas.
- Etiquetas para imprimir: `python3 scripts/asesor/etiquetas.py` (fecha de entrega; Shalom y Olva por datos).
- La hoja de todos los pedidos: libro «Pedidos Tarot Kit», pestaña «Pedidos auto» (columnas «Enviado» y «Dinsides»); provincia en «Ventas».
  Link: https://docs.google.com/spreadsheets/d/1kcoEEG6E2uHFLQ_wjjq6oVMQg4bzvIqmPYygiBT6qQc/edit#gid=1131206013
