# Prompt · Agencias de Shalom: actualización diaria, triangulación con OpenStreetMap y recomendación a la asesora

> Para pegar en la sesión de Claude que se encarga de Shalom (la del «Excel de envío masivo», `scripts/asesor/shalom.py`).
> Lo armó la sesión de CRO el 13/11/2026 a pedido del dueño: «la automatización de Shalom no está atribuyendo bien la agencia».

---

Eres el Claude que mantiene el envío de provincia por Shalom de Tarot Store Perú (repo `claudetarot`, `scripts/asesor/shalom.py`,
estado en `docs/shalom.md`). Antes de tocar nada, lee `CLAUDE.md` y en `docs/MAPA.md` las entradas de Shalom del 8 y 9/11 y la del
13/11 («venta sin teléfono» y el tipo de recomendación `dato_envio`). Reglas que no cambian:
- No tocar `llenar_plantilla()` sin volver a probar una subida real.
- Las claves de 4 dígitos nunca salen a Telegram ni al cliente.
- **Claude no le escribe a ningún cliente.** Todo lo que haya que preguntarle va como recomendación a la asesora, que lo manda ella.
- Prohibido tocar Meta Ads y Apps Script.

## El problema

La agencia que elige `shalom.py buscar` / `masivo` a veces no es la que el cliente quiso. El cliente escribe cosas como «la agencia
que está al lado del mercado X», «la de la avenida Y», «Shalom de Tumbes» (y en Tumbes hay varias), y el buscador solo compara
palabras contra el código, el nombre y la dirección de las agencias.

## Lo que hay que construir

### 1. Agencias al día, todos los días

- `shalom.py agencias --actualizar` ya baja las 566 agencias de la API pública que usa shalom.com.pe/agencias
  (`newwebservices.shalomcontrol.com/api/v1/web/agencias`: `version` y `listar`). Cada agencia trae código, departamento,
  provincia, distrito, nombre, dirección (muchas con «REFERENCIA: …»), horario, **latitud y longitud**.
- Que se actualice sola una vez al día. Si `version` no cambió, no se reescribe nada.
  - Puede ser el primer paso de la Routine de Shalom, o un paso al inicio del reporte de la noche.
  - El dueño pidió «de preferencia todos los días».
  - Deja en `data/shalom-agencias.json` la fecha (`bajado`) y la versión, y anota en `docs/shalom.md` cuándo se actualizó por última vez.
- Si la API cambia de forma o deja de responder:
  - Avisa por Telegram (`shalom.py telegram`) y sigue con el archivo que ya hay.
  - Como respaldo manual, la página pública es `https://www.shalom.com.pe/agencias`. Su buscador solo funciona escribiendo el nombre de la PROVINCIA.

### 2. Triangulación: `shalom.py triangular "<texto del cliente>" [--provincia X]`

Para cada pedido de provincia, en este orden:

1. **Buscador actual** (`buscar`). Si devuelve `seguro`, listo.
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
     del cliente aparece literal en la dirección o referencia de UNA sola agencia; o es la única del distrito.
   - **Dudosa:** dos o más agencias parecidas, OSM no encuentra la referencia, el cliente no dio referencia, o el distrito tiene
     varias agencias y el cliente solo nombró la ciudad.
6. **Guardar el porqué** de cada elección (referencia encontrada, distancias, agencias descartadas) en la nota operativa del pedido,
   para que se vea en la revisión de envíos. No inventar: lo que no se sabe queda dudoso.

Que `masivo` use `triangular` para cada pedido y que el Excel lleve la agencia solo cuando es **segura**. Las dudosas no van al
Excel hasta que la asesora confirme (punto 3), salvo que el dueño fije la agencia con `--agencias ajustes.json`.

### 3. Recomendación a la asesora cuando la agencia es dudosa

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

## Cómo verificar antes de decir «listo»

- Prueba con casos reales de la hoja Ventas y de «Pedidos auto»:
  - el de Mollendo (Av. Mariscal Castilla);
  - el de Sachaca → Variante Uchumayo;
  - uno con «al lado del mercado»;
  - uno de una ciudad con varias agencias.
  - Muestra para cada uno la agencia elegida, la distancia y el porqué.
- `npm run check` y `npm run check:gs` en verde. Agrega una prueba de `triangular` con un caché de OSM de ejemplo, sin llamar a la red.
- Anota en `docs/MAPA.md` (solo agregar) y actualiza `docs/shalom.md` y, si cambia la Routine, `docs/routines.md`.
