# Dinsides (Lima) — registro automático de pedidos: cómo funciona HOY

> Estado ACTUAL. Se reescribe cuando cambia algo; la historia está en `docs/MAPA.md` y el prompt de la Routine en
> `docs/routines.md`. Creado el 2026-11-08 (pedido del dueño: «la solución final se parece a lo de las boletas: yo digo
> corre y corre»). La propuesta previa (ficha, Excel, Cowork) está en `docs/registro-pedidos.md`.

## Qué reemplaza
Hasta hoy la asesora copiaba cada chat, lo pegaba en un Project de Claude (prompt en `docs/registro-pedidos.md` → «Project de
Claude») y pegaba en la consola del navegador (F12) un script que llenaba el formulario de https://dinsidescourier.com/pedido/nuevo;
luego hacía a mano «Agregar pedido al listado», elegía el traslado («Recoger en mi domicilio»), aceptaba los términos y guardaba
(la página caduca a los 10 minutos). Lo que más fallaba: la **dirección de entrega** (clientes que solo mandan el pin) y el
**distrito** (ambiguos, o fuera de la cobertura de Dinsides).

## Cómo es ahora (una sola Routine, una sola sesión)
1. **El sistema ya sabe casi todo.** El reporte «Pedidos y ventas» (21:45 · 22:30 · 23:45) deja por pedido nombre, WhatsApp,
   dirección, kits, empaque, pago, nota y fecha de entrega en `pedidos-estado/FECHA.json` y en la hoja «Pedidos auto». El chat del
   CRM guarda el pin de ubicación que mandó el cliente (`messages.type = location`, cuerpo `lat|lng|nombre|dirección`).
2. **El Worker arma la ficha de Dinsides** (`GET /api/asesor/dinsides?fecha=ENTREGA`, `src/api/asesor-dinsides.js` +
   `src/lib/dinsides.js`): teléfono de 9 dígitos, nombre, dirección normalizada (Av, Jr, Mz, Lt, sin emojis ni links), coordenadas
   (pin del chat o link de Maps), distrito (lo que dice la dirección, o el polígono del **mapa de cobertura de Dinsides** donde cae el
   pin), producto («Kit Tarot de aprendizaje», «x2», «+ Extra: …»), monto (89/149/199 o lo que diga el chat), tipo de pago (YAPE,
   PLIN, EFECTIVO, POS, NO COBRAR si ya pagó), tipo de pedido (CONTRAENTREGA / SOLO-ENTREGA-NO-COBRAR), observación y **fecha de
   entrega** (regla del dueño: lo de esta noche sale mañana aunque se registre a la 1 a. m.; si el cliente pidió otro día, ese).
   Cada ficha sale como **LISTA** o **CON BLOQUEOS**:
   - Bloqueos (no se registra sola; lo resuelve la Routine leyendo el chat o una persona): solo pin sin dirección en texto; distrito que
     no se deduce, ambiguo («San Juan», «Lima», «Callao»), o distinto entre el texto y el pin; pin en **zona roja** o en **punto de
     encuentro** del mapa de Dinsides; teléfono inválido; estado POR_VERIFICAR / INTENCION; provincia; la hoja dice «no».
   - Alertas (se registra igual, se avisa): extras y 2+ kits, pago distinto de Yape, monto distinto de lista, nota con 🚨, otro día,
     dirección corta, distrito deducido solo del pin, pin fuera del mapa.
3. **La Routine «Dinsides — registro de pedidos de Lima»** (Sonnet, sesión fija, manual «Run now» + cron 23:55 Lima, después del
   último reporte) corre `scripts/asesor/dinsides.py`: `preparar` → lee los chats de los bloqueados y de los **candidatos del CRM**
   (chats de la noche con pin, dirección en texto o compra marcada que el reporte no trae: la «cuarta corrida» para que nadie quede
   fuera) → escribe `salida.json` solo con lo que corrige o agrega → `registrar` → `telegram` al dueño. Prompt en `docs/routines.md`.
4. **El Worker registra en Dinsides** (`POST /api/asesor/dinsides {accion:"registrar"}`, `src/lib/dinsides-cliente.js`): entra con
   los secretos `DINSIDES_TLF` y `DINSIDES_CLAVE` (`POST login/validar`), lee el formulario real (`GET pedido/nuevo`: id del negocio,
   opción de traslado, turnos, y compara el desplegable de distritos con la tabla del repo) y manda **un solo listado** a
   `POST pedido/registro` con los mismos arreglos que el botón «Guardar» (`nombres[]`, `tlfs[]`, `id_distritos[]`, `fechas_entrega[]`,
   `revisar[]`…). Dinsides responde `1` = registrado. Luego: memoria en R2 (`dinsides/FECHA.json`, `dinsides/indice.json`), columna
   **«Dinsides»** y «Enviado» de la hoja «Pedidos auto», etiqueta `dinsides_registrado` en el chat. Nunca registra dos veces el mismo
   WhatsApp (3 días) ni dos veces el mismo teléfono en un listado (Dinsides tampoco lo acepta).
5. **Sin credenciales** (hoy): el mismo `registrar` responde `sin_credenciales` y deja el **script de consola** de los listos en
   `/tmp/dinsides/consola.js` (el camino de siempre, pero ya armado); la Routine avisa que faltan los secretos.

## El factor humano (dirección y distrito)
- La Routine primero intenta resolverlo sola **leyendo el chat** (`dinsides.py chat`), sin inventar nada.
- Lo que no se resuelve va al dueño por Telegram con lo que falta y el link de Maps del pin. La persona responde **en la hoja
  «Pedidos auto», columna P «Dinsides»**: `ok` (confirmado, regístralo), `distrito: Comas`, `dirección: Av X 123, ref…`,
  `coord: -12.1,-77.0`, `manual 1234` (lo registró a mano) o `no` (no va por Dinsides). También puede corregir la columna
  «Dirección / Agencia». Al volver a correr la Routine («Run now»), el Worker lee eso y registra.
- Pedidos para otro día: salen con su fecha (`fecha_entrega` del reporte). Si conviene juntarlos para la cuota diaria de Dinsides,
  la persona escribe `no` en «Dinsides» esa noche y `ok` la noche que toque; quedan en la agenda pendiente del reporte hasta entonces.

## Mapa de cobertura
`src/lib/dinsides-cobertura.js` viene del Google My Maps de Dinsides «MAPA ZONA DE COBERTURA GENERAL» (147 polígonos: distritos,
zonas rojas / sin entregas / «no llegamos», puntos de encuentro; 182 puntos). Se regenera con `python3 scripts/dinsides-cobertura.py`
(baja el KML y reescribe el módulo). `zonaDe(lat, lng)` dice dónde cae un pin; `dinsides.py zona <lat,lng>` lo consulta.

## Tabla de distritos
`DISTRITOS` y `ALIAS` en `src/lib/dinsides.js` son el desplegable de Dinsides (código y tarifa) tal como lo tenía el Project
(snapshot 2026-11-08). `dinsides.py probar` entra a Dinsides y lista las **diferencias** (nuevos, quitados, tarifas) para actualizar
la tabla; al registrar, el Worker usa la tarifa real del formulario y rechaza un código que ya no exista.

## Lo que falta del dueño para que registre solo
1. Poner los secretos del Worker (nunca en el repo ni en el chat): `wrangler secret put DINSIDES_TLF` (el celular con el que entra a
   Dinsides) y `wrangler secret put DINSIDES_CLAVE`. Opcional: `DINSIDES_RECOJO_ID` / `DINSIDES_RECOJO` / `DINSIDES_TURNO` si `probar`
   no elige bien el traslado («Recoger en mi domicilio») o el turno.
2. Correr `python3 scripts/asesor/dinsides.py probar` y luego `registrar --simular` (pedido de prueba: arma todo y no crea nada).
3. Mirar el primer registro real en https://dinsidescourier.com/pedido/listado_cliente y comparar con el Telegram de la Routine.

## Routine
Routine **`trig_01Xwa3awazBmncnXCiQXFgec`** («Dinsides — registro de pedidos de Lima (23:55 · Run now)», `CRON_TZ=America/Lima 55 23 * * *`, sin conectores) → sesión fija **`session_017wTF8ckoBNtwk4nSxvvFzk`** («Dinsides — registro de pedidos de Lima (historial de la Routine)», `claude-sonnet-5-5`, clon de `main`).
El dueño también puede darle «Run now» en claude.ai: va a la misma sesión, con su historial. Prompt v1 en `docs/routines.md`.

## Dónde ver las cosas
- `python3 scripts/asesor/dinsides.py preparar [FECHA]` → fichas, bloqueos, ya registrados y candidatos; `/tmp/dinsides/fichas.json`.
- Hoja «Pedidos auto» (libro «Pedidos Tarot Kit» `1kcoEEG6E2uHFLQ_wjjq6oVMQg4bzvIqmPYygiBT6qQc`): columna P «Dinsides» y O «Enviado».
- Pruebas: `node --no-warnings scripts/test-dinsides.mjs` (librería) y `scripts/test-dinsides-api.mjs` (endpoint con un Dinsides
  simulado: login, formulario, listado, memoria, idempotencia, sin credenciales). Las dos corren en `npm run check`.
- Shalom (provincia) queda para después: misma idea (ficha desde el reporte + carga masiva de Shalom Pro), ver `docs/registro-pedidos.md`.
