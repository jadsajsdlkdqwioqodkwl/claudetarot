# Prompt · Agencias de Shalom: una sola búsqueda correcta en todos lados (Excel, revisión de envíos, recomendación)

> Para pegar en la sesión de Claude que se encarga de Shalom (la del «Excel de envío masivo», `scripts/asesor/shalom.py`).
> Lo armó la sesión de CRO el 13/11/2026 a pedido del dueño: «la automatización de Shalom no está atribuyendo bien la agencia».
> Versión 2 (13/11, noche): se agregó la página de revisión de envíos, las dos fallas encontradas en el Excel y la regla de «una
> sola función para todo».

---

Eres el Claude que mantiene el envío de provincia por Shalom de Tarot Store Perú (repo `claudetarot`, `scripts/asesor/shalom.py`,
estado en `docs/shalom.md`). Antes de tocar nada, lee `CLAUDE.md` y en `docs/MAPA.md` las entradas de Shalom del 8 y 9/11, la de
la revisión de envíos del 11/11 y la del 13/11 («venta sin teléfono» y el tipo de recomendación `dato_envio`). Reglas que no cambian:
- No tocar `llenar_plantilla()` (la copia byte a byte de la plantilla) sin volver a probar una subida real a Shalom Pro.
- Las claves de 4 dígitos nunca salen a Telegram ni al cliente.
- **Claude no le escribe a ningún cliente.** Todo lo que haya que preguntarle va como recomendación a la asesora, que lo manda ella.
- Prohibido tocar Meta Ads y Apps Script.

## El objetivo

Que la agencia sea la correcta **en todos lados**: en la página de revisión de envíos que Jennifer revisa en la noche (OK / nota por
pedido), en el Excel del «Formato Pro Masivo», en la referencia de CRM → Reportes y en las recomendaciones a la asesora. Hoy cada
lugar llama a `buscar()` por su cuenta y lo que corrige una persona en un lado no siempre llega al otro.

**Regla central: UNA sola función decide la agencia** (por ejemplo `elegir_agencia(pedido)` en `shalom.py`) y la usan
`masivo`, `buscar`, la página de revisión (`dinsides.py presentar` → `_bloque_shalom`), la referencia y `recomendar`. Devuelve
siempre lo mismo: agencia elegida (nombre exacto de la plantilla + código completo + dirección), confianza (segura / dudosa),
candidatas y el porqué.

## Fallas que ya encontré en el Excel (arreglar primero)

Revisé la plantilla oficial (`data/shalom-masivo-plantilla.xlsx`) y `data/shalom-agencias.json` (bajado el 09/11, versión 5184):

1. **La columna G (DESTINO) solo acepta los nombres de la lista de la plantilla.** Tiene validación contra la hoja oculta
   `Hoja2!C2:C490`, que son las 489 agencias que reciben envíos. El Excel identifica la agencia SOLO por ese nombre, no por la
   dirección: si el nombre no calza exacto, Shalom Pro puede rechazar la fila o tomar otra.
   - Hay 8 agencias cuyo nombre en la API trae **espacios de más al final** («HUANCARO », «OVALO PUENTE PIEDRA », «AV  BOLIVAR »,
     «PUNTA HERMOSA », «URB SANTA ELVIRA », «HUAYCAN AV HORACIO ZEVALLOS  », «AV MALECON  CHECA CDRA. 1 », «AV  NICOLAS DUEÑAS
     CDRA. 5 »). Hoy `masivo` escribe `cand[0]["agencia"]` tal cual, con el espacio, y no calza con la lista. Hay que recortarlo y
     escribir **exactamente** el texto de `Hoja2!C`.
   - Antes de escribir cada fila, comprobar que el destino está en `Hoja2!C`. Si no está, la fila no va al Excel y queda como
     «falta un dato» en la revisión con el motivo.
2. **El buscador no descarta las agencias que NO reciben envíos.** De las 566 agencias de la API, 77 tienen `destino = 0` (no
   reciben). Ejemplo: en Wanchaq (Cusco) hay 4 agencias: CUSCO PARQUE INDUSTRIAL, AV PACHACUTEC, VELASCO ASTETE y AV. HUAYRUROPATA.
   Esta última tiene `destino = 0`, pero `buscar()` puede elegirla igual. Filtrar siempre por `destino = 1`.

Sobre el caso del dueño («ayer salieron dos a Wanchaq, no sé si es la misma agencia»): saca de la referencia del 12/11 (CRM →
Reportes) qué nombre fue en la columna G de esos dos pedidos, qué escribió cada cliente y si la agencia era la que pidió. Explícale
el resultado al dueño en una línea por pedido. Si alguno fue a la agencia equivocada, dilo para que lo corrijan en Shalom Pro.

## Lo que hay que construir

### 1. Agencias al día, todos los días, para todo el sistema

- `shalom.py agencias --actualizar` ya baja las agencias de la API pública que usa shalom.com.pe/agencias
  (`newwebservices.shalomcontrol.com/api/v1/web/agencias`: `version` y `listar`). Cada agencia trae código, departamento,
  provincia, distrito, nombre, dirección (muchas con «REFERENCIA: …»), horario, `destino`, **latitud y longitud**.
- Que se actualice sola **una vez al día**. Si `version` no cambió, no se reescribe nada.
  - Como primer paso de **todo** lo que use agencias: la Routine de Shalom, el reporte de la noche y el `presentar` que arma la
    página de revisión. Si ya se actualizó hoy, no vuelve a bajar.
  - El dueño pidió «de preferencia todos los días».
  - Deja en `data/shalom-agencias.json` la fecha (`bajado`) y la versión, y anota en `docs/shalom.md` cuándo se actualizó por última vez.
- **Cruzar con la plantilla en cada actualización:**
  - agencias nuevas de la API (con `destino = 1`) que no están en `Hoja2!C`;
  - nombres de la plantilla que ya no existen en la API.

  Si aparece alguno, avisa por Telegram (`shalom.py telegram`) que hay que bajar la plantilla nueva de Shalom Pro. Mientras tanto,
  esas agencias no van al Excel (van a «falta un dato» con el motivo). No edites la lista de la plantilla a mano: rompe la copia
  byte a byte.
- Si la API cambia de forma o deja de responder:
  - Avisa por Telegram y sigue con el archivo que ya hay.
  - Como respaldo manual, la página pública es `https://www.shalom.com.pe/agencias`. Su buscador solo funciona escribiendo el nombre de la PROVINCIA.

### 2. Triangulación (dentro de `elegir_agencia`, y como comando `shalom.py triangular "<texto>" [--provincia X]` para probar)

Para cada pedido de provincia, en este orden, siempre entre agencias con `destino = 1`:

1. **Buscador actual** (`buscar`). Si devuelve `seguro` y además pasa los chequeos de abajo, listo.
2. **Acotar el lugar:** el departamento, provincia y distrito que nombra el cliente (o los de su DNI, ciudad o chat), y las
   agencias de ese lugar. Si hay UNA sola agencia en ese distrito, es esa (ya existe esa regla).
3. **Si quedan varias**, sacar del texto del cliente la **referencia**: mercado, plaza, avenida, colegio, hospital, paradero,
   «frente a», «al costado de», «cerca de».
   - Buscarla en **OpenStreetMap** con la API de Nominatim, acotada a esa ciudad: `q="<referencia>, <distrito>, <provincia>, Perú"`, `countrycodes=pe`.
   - Para mercados y plazas sirve también Overpass (`amenity=marketplace`, `place=square`) dentro del distrito.
   - Uso responsable: **una consulta por segundo como máximo**, un `User-Agent` propio y genérico (por ejemplo `tarot-store-envios/1.0`, sin correos), y **caché** en `data/osm-cache.json` para no repetir la misma búsqueda.
4. **Medir la distancia** (haversine) entre el punto de OSM y cada agencia candidata (lat/lng de la API de Shalom). Sumar también
   si la referencia del cliente aparece en el «REFERENCIA: …» o en la dirección de la agencia.
5. **Decidir la confianza:**
   - **Segura (≥ 99 %):** una agencia queda a menos de ~400 m de la referencia y la segunda a más del doble; o la referencia
     del cliente aparece literal en la dirección o referencia de UNA sola agencia; o es la única del distrito; o una persona ya
     la confirmó (punto 4).
   - **Dudosa:** dos o más agencias parecidas, OSM no encuentra la referencia, el cliente no dio referencia, o el distrito tiene
     varias agencias y el cliente solo nombró la ciudad.
6. **Guardar el porqué** de cada elección (referencia encontrada, distancias, agencias descartadas). No inventar: lo que no se
   sabe queda dudoso.

Cualquier agencia: la central («… CO») no tiene ningún trato especial. Si el cliente pidió una agencia de barrio y existe con
`destino = 1`, va esa.

### 3. La página de revisión de envíos (la que Jennifer revisa en la noche)

`dinsides.py presentar` arma la página `/r/envios-FECHA-…` y su sección SHALOM sale de `_bloque_shalom()`, que hoy llama a
`sh.buscar()` directo. Cambiarlo para que use `elegir_agencia()` y muestre por pedido:
- la agencia elegida con su **nombre exacto de la plantilla, dirección completa y referencia**, para que Jennifer la compare con lo
  que escribió el cliente sin abrir otra página;
- SEGURA o DUDOSA, el porqué (referencia de OSM y distancia) y, si es dudosa, las candidatas con su dirección;
- lo que escribió el cliente.

Las notas que deja Jennifer (`dinsides.py notas`):
- «OK» = la agencia mostrada queda confirmada para ese pedido.
- «agencia X» (o una dirección o referencia) = se pasa por `elegir_agencia()` para encontrar el nombre exacto de la plantilla.
  Si no calza con UNA sola agencia con `destino = 1`, no se adivina: queda «falta un dato» y se le dice por qué.
- Lo confirmado por Jennifer es lo que va al Excel (`masivo` lo lee de las notas, sin tener que armar `--agencias` a mano).

### 4. Memoria de lo confirmado

Cuando Jennifer confirma en la revisión o la asesora confirma en el chat, guardar la agencia confirmada por pedido (WhatsApp +
fecha de despacho). Puede ir en la referencia, en la hoja «Pedidos auto» o en `data/`. Las corridas siguientes (reporte, Excel,
revisión) usan esa sin volver a buscar.

### 5. Recomendación a la asesora cuando la agencia es dudosa

Por cada pedido dudoso, crear una recomendación de tipo **`dato_envio`** para el chat del cliente: `POST /api/asesor/sugerencias`
con `x-asesor-clave` y `{ origen: "shalom agencias", sugerencias: [{ tipo: "dato_envio", whatsapp, nombre, motivo, texto }] }`.
Lo mejor es un comando `shalom.py recomendar`. El Worker ya acepta ese tipo desde el 13/11: la recomendación sube a la bandeja,
aparece en el aviso del chat y no se cierra porque el cliente ya compró.

- **`motivo`** (lo lee la asesora, no el cliente). Ejemplo:
  > «Agencia dudosa: el cliente dijo "Shalom de Tumbes, al lado del mercado" y en Tumbes hay 3 agencias (TUMBES CO, AV. TUMBES NORTE 1200, MERCADO MODELO). Entra a https://www.shalom.com.pe/agencias, escribe la provincia TUMBES en el buscador (solo busca por provincia), toma captura de la lista y mándasela al cliente para que confirme cuál es.»
  - Siempre con: lo que dijo el cliente, las agencias candidatas (nombre y dirección) y el paso a paso de la captura.
- **`texto`** (lo que la asesora le manda al cliente, en la voz de las vendedoras; usa la skill `voz-tarot-store`, de usted, una
  sola pregunta). Ejemplo:
  > «Estimad@ ☺️ en Tumbes Shalom tiene varias agencias. Le comparto la lista para que me confirme cuál le queda mejor y así le enviamos su kit sin problema 📦 ¿Cuál sería?»
- Una sola recomendación pendiente por chat (si ya existe, el Worker la actualiza).
- Cuando la asesora confirme la agencia en el chat, la próxima corrida la toma como segura.

### 6. El Excel: todo correcto antes de subir

- Al Excel solo van filas con DNI válido, celular de 9 dígitos y agencia **segura o confirmada**, con destino en `Hoja2!C`.
- Origen siempre `CHORRILLOS CO`. Mercadería y cantidad según las reglas del 11/11 (2 o más kits = UN paquete XS, cantidad 1).
- Junto al Excel, la referencia lleva por fila: el nombre exacto de la agencia en G, su código completo y su dirección. Así una
  persona puede comparar fila por fila con lo que muestra Shalom Pro al subir.
- Antes de decir «listo», abre el Excel generado y compáralo celda por celda con la referencia: misma cantidad de filas, cada G
  en `Hoja2!C`, sin espacios de más, sin agencias con `destino = 0`.

## Cómo verificar antes de decir «listo»

- Prueba con casos reales de la hoja Ventas y de «Pedidos auto»:
  - los dos de Wanchaq del 12/11;
  - el de Mollendo (Av. Mariscal Castilla);
  - el de Sachaca → Variante Uchumayo;
  - uno con «al lado del mercado»;
  - uno de una ciudad con varias agencias;
  - uno que vaya a una agencia de barrio (no la central);
  - uno de las 8 agencias con espacios de más.
  - Muestra para cada uno la agencia elegida, su dirección, la distancia y el porqué, y que la página de revisión y el Excel
    dicen lo mismo.
- `npm run check` y `npm run check:gs` en verde. Agrega pruebas sin llamar a la red:
  - `elegir_agencia` con un caché de OSM de ejemplo;
  - que ninguna fila del Excel lleve un destino fuera de `Hoja2!C` ni con `destino = 0`;
  - que la revisión y el masivo devuelvan la misma agencia para el mismo pedido.
- La primera subida real con el cambio: confirma con quien sube a Shalom Pro que todas las filas entraron con la agencia esperada.
- Anota en `docs/MAPA.md` (solo agregar) y actualiza `docs/shalom.md`, `docs/dinsides.md` (la revisión) y, si cambia la Routine,
  `docs/routines.md`.
