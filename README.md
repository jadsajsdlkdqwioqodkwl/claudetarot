# Kit de Tarot — landing COD → Google Sheets como CRM

Página de producto con formulario de **pago contra entrega**. El pedido se guarda en
**Google Sheets**, que hace de CRM: el vendedor filtra por día, cambia el estado de cada
pedido y ve los totales. El cliente confirma por WhatsApp desde la página de gracias.

El mismo libro lleva un **segundo negocio**: la pestaña `Ventas`, donde se reportan a mano
las ventas de las campañas manuales —escribiendo el DNI y el celular, y poco más—, y de la
que cuelga una **página de seguimiento de envíos** para el cliente.
Ver *[CRM de ventas manuales](#crm-de-ventas-manuales-y-seguimiento-de-envíos)*.

Todo corre en un **Cloudflare Worker**: `public/` se sirve como archivos estáticos y el
Worker solo se ejecuta en `/api/*`, así que las credenciales nunca llegan al navegador.

```
wrangler.jsonc          Config del Worker: assets, límite por IP y variables
src/index.js            Router: /api/* al Worker, todo lo demás a los archivos
src/api/order.js        POST /api/order  — guarda el pedido, devuelve su nº de fila
src/api/upsell.js       POST /api/upsell — añade el order bump a esa fila
src/api/diag.js         GET  /api/diag   — diagnóstico de la cadena con Sheets
src/api/setup.js        POST /api/setup  — deja la hoja lista como CRM
src/api/seguimiento.js  GET  /api/seguimiento — datos públicos de un envío
src/api/voucher.js      GET  /v/<código> — la foto del voucher, desde tu Drive
src/lib/crm-setup.js    La rutina de preparación, compartida con el script
src/lib/ventas.js       Esquema de la pestaña Ventas: columnas, estados, códigos
src/lib/ventas-hoja.js  Lectura de esa pestaña desde el Worker
src/lib/pedido.js       Precios, variantes y utilidades compartidas
src/lib/hoja.js         Esquema de columnas y estados (A–O)
src/lib/google-sheets.js JWT RS256 con WebCrypto + Sheets API, sin dependencias
src/lib/telegram.js     Aviso de pedidos nuevos por Telegram, en segundo plano
public/index.html       Tu página (diseño original, sin cambios de estilo)
public/gracias.html     /gracias — confirmación, CTA de WhatsApp y evento Lead
public/seguimiento.html /TS-XXXXXXX — seguimiento del envío, sin login
public/kittarotcod/     Imágenes del producto
public/_headers         Cabeceras de seguridad y caché
scripts/setup-sheet.mjs Deja la hoja lista como CRM: `npm run setup:sheet`
scripts/check.mjs       Chequeos sin red: `npm run check`
```

## Imágenes y video

Todo lo que se despliega vive en `public/kittarotcod/`:

| Archivo | Uso |
|---|---|
| `1.webp` | Banner principal (es el LCP: lleva `fetchpriority="high"`) |
| `2.mp4` | El video del cuerpo. Se carga y arranca al acercarte a él |
| `galeria/g1..g6.webp` | Las seis fotos del visor (1000×1000) |
| `galeria/g1..g6-mini.webp` | Las miniaturas de la tira (400×400) |
| `kit-variante.webp` | La foto dentro de las tarjetas de 1 kit y 2 kits |
| `logo.webp` · `badges.webp` | Logo del modal y sellos de confianza |
| `orderbumpvideo1.mp4` | Video del carrusel del order bump, primer slide |
| `foto2orderbumb.webp` · `fotobump3.png` | Las dos fotos del carrusel del order bump, después del video |
| `resenas/r1..r3.webp` | Fotos de las tarjetas del carrusel de reseñas |

Los originales pesados y los banners retirados están en `imagenes-fuente/`, **fuera de
`public/`**, para no viajar en cada despliegue. `npm run check` falla si una imagen pasa de
1 MB o el video de 6 MB.

### El video

Se sirve como MP4 (H.264), que reproducen todos los navegadores.

**No se descarga al abrir la página.** El elemento entra sin `src` y con
`preload="none"`; el JS le pone la fuente cuando faltan ~300 px para llegar y lo arranca
cuando está a punto de entrar en pantalla. Al alejarse se pausa. Quien no baja hasta ahí no
gasta un solo byte.

Van dos mecanismos a propósito: `IntersectionObserver` (el eficiente, no ejecuta nada
mientras no pasa nada) y un listener de `scroll` limitado por tiempo como red de seguridad.
Si el observador falla, el video no se cargaría nunca y el cliente vería un cuadro muerto,
así que no depende de uno solo. El limitador **no** usa `requestAnimationFrame`: en una
pestaña en segundo plano no se ejecuta y dejaría el mecanismo bloqueado.

Si el navegador bloquea el play (iOS en bajo consumo, por ejemplo), la página le pone
controles sola para que el cliente pueda darle play.

El actual pesa **1,8 MB** (720×1280, 15 s): re-exportado sin audio (el video va `muted`,
así que la pista de sonido solo pesaba sin sonar nunca). La versión original de 4,6 MB
quedó guardada en `imagenes-fuente/2-pesado-4.6MB.mp4` por si hiciera falta.

### Carga de la página

Medido con el registro del servidor, no a ojo: **10 peticiones y 537 KB** al abrir,
sin un solo 404.

- El banner principal es el LCP y va con `fetchpriority="high"`.
- Las fotos de los dos modales (logo, sellos, foto del kit y las del order bump) llevan
  `data-src` y solo se piden **cuando el modal se abre**: son ~145 KB que no le sirven a
  quien nunca pulsa el botón.
- El favicon es el logo de la tienda (`favicon.ico` + PNG en 32/180px), cacheado igual
  que el resto de `kittarotcod/*`.
- `preconnect` a los dominios de Meta, para que el pixel salga antes.
- `public/_headers` cachea `/kittarotcod/*` un año como `immutable` y revalida siempre el
  HTML, para que nadie se quede con precios viejos.

### Las fotos de la galería

Las seis salen de la foto del kit que subiste: la primera es el conjunto completo y las
otras cinco son detalles (mazo, collar y bolsa, caja, manual, tapete). Para poner fotos
propias, reemplaza `galeria/gN.webp` (1000×1000) y `galeria/gN-mini.webp` (400×400) con los
mismos nombres. La lista `FOTOS` de `public/index.html` es la única fuente: la tira, el
carrusel y los puntos se arman desde ahí, y `MOSAICOS` decide cuántas miniaturas se ven
antes del contador azul.

### Estado de los archivos

Ya no falta ninguno: `npm run check` los verifica y avisa al final si alguno desaparece.

Las fotos de reseña se sirven como `<picture>`: primero el `.webp` y, si el navegador no lo
entendiera, un `.jpg` con el mismo nombre. Con el `.webp` basta.

El carrusel del order bump muestra primero el video del mazo Rider Waite
(`orderbumpvideo1.mp4`, mudo, en bucle y sin controles) y después sus dos fotos
(`foto2orderbumb.webp`, `fotobump3.png`). Si las cambias, mantén el video como primer
slide y ajusta los textos alternativos de las fotos en `public/index.html`.

## Paso 1 — Google Sheets

Crea la hoja y nombra la pestaña **`Pedidos`**. Después, `npm run setup:sheet` escribe los
encabezados y deja todo formateado; no hay que tocar nada a mano.

| | A | B | C | D | E |
|---|---|---|---|---|---|
| | Fecha | Nombre | WhatsApp | Envío | Dirección / Agencia |

| | F | G | H | I | J |
|---|---|---|---|---|---|
| | Producto | Subtotal | Order bump | Total | **Estado** |

| | K | L | M | N | O |
|---|---|---|---|---|---|
| | FBP | FBC | Event ID | User Agent | IP |

**A–J es el CRM del vendedor. K–O son para la Conversions API** y quedan ocultas: el
Apps Script las lee igual estando ocultas.

Decisiones que explican la forma de la tabla:

- **No hay columna de código de pedido.** Enseñarle un código al cliente en una compra
  contra entrega genera desconfianza, y no hacía falta: `/api/order` devuelve el número
  de fila que Sheets le asigna, y `/api/upsell` actualiza esa fila directamente.
- **`Dirección / Agencia` es una sola columna.** Un pedido es a domicilio o a agencia,
  nunca las dos, así que dos columnas dejaban siempre una vacía.
- **`Producto` sustituye a Variante + Cantidad**, porque el nombre ya dice cuántos kits son.
- **`Fecha` se escribe como fecha-hora de Lima**, no como ISO con `T` y `Z`. Sheets parsea
  ese formato como fecha real, que es lo que permite filtrar y sumar por día. Un ISO se
  queda como texto y rompe los totales del panel.

### El CRM

Dos formas de dejar la hoja lista, ambas idempotentes:

```bash
# a) desde el Worker, que ya tiene la clave como secret (no necesitas nada local)
curl -X POST "https://TU-DOMINIO/api/setup?token=TU_DIAG_TOKEN"

# b) desde tu máquina, si tienes las credenciales en .dev.vars
npm run setup:sheet
```

La opción (a) existe para no tener que llevar la clave privada a ninguna parte:
el Worker la tiene, así que prepara la hoja él mismo. Es la misma rutina
(`src/lib/crm-setup.js`) en los dos casos, y va protegida con el mismo
`DIAG_TOKEN` que `/api/diag`. Es POST y no GET a propósito: modifica la hoja,
y un GET lo dispararía cualquier precarga del navegador.

Cualquiera de las dos deja la hoja así:

- **`Estado` es un desplegable** con Pendiente · Contactado · Enviado · Pagado · Cancelado.
  Los pedidos se colorean solos según su estado.
- **Filtro en la cabecera** para filtrar por día, por estado o por lo que haga falta.
- Fila de encabezados fija, importes en soles, columnas de la CAPI ocultas.
- Pestaña **`Panel`** con el resumen por día: leads, cerrados, ingresos cerrados,
  ingresos potenciales y cuántos quedan por contactar. Se alimenta sola con fórmulas,
  no hay que refrescar nada.

"Cerrados" cuenta los estados `Enviado` y `Pagado`. Si cambias esa regla, cámbiala en
`ESTADOS_VENDIDOS` de `src/lib/hoja.js` y vuelve a correr `npm run setup:sheet`: las
fórmulas del panel se generan desde ahí.

El **ID de la hoja** está en su URL: `docs.google.com/spreadsheets/d/`**`<ID>`**`/edit`.

### Habilitar la API y crear la service account

1. [console.cloud.google.com](https://console.cloud.google.com/) → crea un proyecto.
2. **APIs y servicios → Biblioteca** → busca *Google Sheets API* → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
   Nómbrala `pedidos-bot` y crea. No necesita rol de IAM.
4. Entra a la cuenta creada → pestaña **Claves** → **Agregar clave → Crear nueva → JSON**.
   Se descarga un archivo; de ahí salen `client_email` y `private_key`.
5. **Comparte la hoja** con ese `client_email` como **Editor**. Sin esto la API responde 403.

## Paso 2 — Variables en Cloudflare

Hay **dos sitios distintos** y usar el equivocado hace perder el valor:

| Variable | Dónde va | Por qué |
|---|---|---|
| `GOOGLE_SHEET_ID` | `wrangler.jsonc` → `vars` | texto, no es secreto |
| `GOOGLE_SHEET_NAME` | `wrangler.jsonc` → `vars` | texto |
| `GOOGLE_VENTAS_NAME` | `wrangler.jsonc` → `vars` | texto — la pestaña del CRM de ventas |
| `GOOGLE_CLIENT_EMAIL` | `wrangler.jsonc` → `vars` | texto |
| `GOOGLE_PRIVATE_KEY` | **Secret** (dashboard o CLI) | credencial |
| `TELEGRAM_BOT_TOKEN` | **Secret** (dashboard o CLI) | credencial |
| `TELEGRAM_CHAT_ID` | **Secret** (dashboard o CLI) | identifica a quién avisar |

> **Importante:** cada despliegue reemplaza las variables de **texto** del dashboard por las de
> `wrangler.jsonc`. Si las escribes solo en la consola, el siguiente build las borra. Los
> **secrets** no se tocan: se definen una vez y sobreviven a todos los despliegues.

### Los dos secrets

Por dashboard: **Workers & Pages → claudetarot → Settings → Variables and secrets →
Add → Type: Secret**.

O por CLI, que evita errores de copiado en la clave privada:

```bash
npx wrangler secret put GOOGLE_PRIVATE_KEY   # pega el private_key completo del JSON
npx wrangler secret put TELEGRAM_BOT_TOKEN   # el token que te da @BotFather
npx wrangler secret put TELEGRAM_CHAT_ID     # a quién avisar (ver más abajo)
```

`GOOGLE_PRIVATE_KEY` se pega tal cual viene en el JSON, desde `-----BEGIN PRIVATE KEY-----`
hasta `-----END PRIVATE KEY-----\n`, con los `\n` literales incluidos y sin las comillas
que lo envuelven en el archivo.

### Build en Cloudflare

En **Settings → Build**, con el repo ya conectado:

- **Root directory**: `/` (vacío)
- **Build command**: vacío
- **Deploy command**: `npx wrangler deploy`

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # completa credenciales reales
npm run dev                      # http://localhost:8788
npm run check                    # chequeos sin red ni credenciales
```

## Meta Pixel

Pixel `1598655637922566`, instalado en `public/index.html`. El embudo:

| Evento | Dónde | Cuándo | Valor |
|---|---|---|---|
| `PageView` | product page | al cargar | — |
| `ViewContent` | product page | al cargar | 79 |
| `AddToCart` | product page | clic en el CTA | 79 |
| `AddToCart` | product page | si sube a 2 kits | 139 |
| `InitiateCheckout` | product page | primer campo que toca | según variante |
| `AddToCart` | product page | order bump aceptado | 49 |
| `PageView` | `/gracias` | al cargar | — |
| `Lead` | `/gracias` | al cargar | total real, con el bump ya sumado |
| `Contact` | `/gracias` | clic en el botón de WhatsApp | total real |

`InitiateCheckout` va en el primer campo tocado, no al abrir el modal, para no
contar clics accidentales. `InitiateCheckout` y `Lead` se disparan una sola vez.
`Contact` se dispara al pulsar el botón de WhatsApp de la confirmación, no al cargar.

**El `Lead` vive en `/gracias`**, no en la respuesta de `/api/order`: así solo cuenta a
quien de verdad terminó el embudo, y su `value` ya incluye el order bump.

**`Purchase` no se dispara en el navegador.** Sale desde la hoja por Conversions API,
usando la columna **`Event ID`** (M) como `event_id`.

### Lo que se captura para la Conversions API

`public/index.html` lee las cookies `_fbp` y `_fbc` y las manda con el pedido.
`_fbc` solo existe si el visitante llegó con `?fbclid=…`, y el pixel puede
tardar o estar bloqueado, así que la página la construye y la guarda ella misma
con el formato de Meta: `fb.1.<timestamp>.<fbclid>`, con 90 días de vida.

El Worker añade el `User-Agent` y la IP real del cliente (`CF-Connecting-IP`),
que son los del navegador y no los del Worker.

> Los precios del pixel viven en el HTML y los reales en `src/lib/pedido.js`.
> `npm run check` falla si dejan de coincidir.

Si el pixel no registra nada, revisa la CSP en `public/_headers`: necesita
`connect.facebook.net` en `script-src` y `www.facebook.com` en `img-src` y
`connect-src`, o el navegador lo bloquea entero.

## Diagnóstico — `/api/diag`

Cuando el formulario responde *"No pudimos registrar tu pedido"*, el Worker
devolvió un **502**: llegó a Google Sheets y Google lo rechazó. El 502 no dice
por qué, así que hay un endpoint que recorre la cadena eslabón por eslabón.

Está **apagado por defecto**. Para encenderlo:

```bash
npx wrangler secret put DIAG_TOKEN     # inventa una cadena larga
```

Luego, en el navegador:

```
https://tu-dominio/api/diag?token=TU_TOKEN            # solo lectura
https://tu-dominio/api/diag?token=TU_TOKEN&write=1    # además escribe una fila de prueba
```

Comprueba, en orden: las variables, la **forma** de la clave privada, que
WebCrypto la acepte, el OAuth con Google, el acceso a la hoja, que exista la
pestaña, y que los encabezados sean los correctos. Se detiene en el primer
eslabón roto y devuelve un veredicto accionable.

Nunca devuelve credenciales: de la clave privada solo informa su largo, si
tiene los delimitadores `BEGIN`/`END`, si los saltos de línea son reales o
`\n` literales, y **si viene envuelta en comillas** — que es la causa más
frecuente del 502, porque al copiarla del JSON se arrastran las comillas.

Los fallos más comunes y su arreglo:

| Veredicto | Arreglo |
|---|---|
| La clave privada está corrupta | Vuelve a pegarla: de `-----BEGIN` a `-----END`, sin comillas |
| Google rechazó la firma del JWT | La clave no corresponde a ese `client_email` |
| La Sheets API no está habilitada | Habilítala en Google Cloud → APIs y servicios |
| La cuenta de servicio no tiene acceso | Comparte la hoja con ella como **Editor** |
| No existe una hoja con ese ID | Revisa `GOOGLE_SHEET_ID` |
| No hay ninguna pestaña "Pedidos" | Renombra la pestaña o cambia `GOOGLE_SHEET_NAME` |
| Puede leer pero no escribir | La compartiste como Lector, no como Editor |

> Los logs del Worker (**Workers & Pages → claudetarot → Observability**) traen
> el error crudo de Google en la línea `Sheets: …`, por si necesitas más.

Apágalo cuando termines: borra el secret `DIAG_TOKEN` y vuelve a desplegar.

## Aviso por Telegram

`/api/order` manda un mensaje a Telegram apenas el pedido queda guardado en
Sheets, con nombre, WhatsApp, producto, total y la dirección o agencia. Va con
`waitUntil`, en segundo plano: no atrasa la respuesta al cliente, y si
Telegram falla (token vencido, sin red) el pedido igual queda guardado —
Sheets sigue siendo la fuente de verdad, Telegram es solo el aviso.

**Por qué vive aquí y no en Apps Script:** los pedidos entran directo por la
API de Google Sheets (`src/lib/google-sheets.js`), no por un webhook de Apps
Script. Los triggers `onEdit`/`onChange` de Apps Script no disparan de forma
confiable con cambios hechos por la API, así que el único lugar donde avisar
al instante es el propio Worker, en el momento en que se guarda el pedido.

### Crear el bot y conseguir las credenciales

1. En Telegram, habla con **[@BotFather](https://t.me/BotFather)** → `/newbot`
   → sigue los pasos. Te da un **token** con forma `123456789:AA...`.
2. Escríbele algo a tu bot nuevo (o añádelo al grupo/canal donde quieras
   recibir los avisos) para que tenga con quién hablar.
3. Consigue el **chat ID**:
   - Persona o grupo: habla con **[@userinfobot](https://t.me/userinfobot)**
     (o añádelo al grupo) y te devuelve el ID. En un grupo suele ser negativo
     (ej. `-100123456789`).
   - O visita `https://api.telegram.org/bot<TU_TOKEN>/getUpdates` después de
     mandarle un mensaje al bot: el ID aparece en `"chat":{"id":...}`.
4. Guarda ambos como secrets (ver arriba). Sin ellos, `/api/order` sigue
   guardando pedidos con normalidad; simplemente no manda el aviso.

Prueba rápida sin desplegar nada: pégalos en `.dev.vars`, corre `npm run dev`
y completa un pedido de prueba desde `http://localhost:8788`.

## Página de gracias

`public/gracias.html`, servida en **`/gracias`**. El embudo termina ahí: al cerrar el
order bump, `closeAll()` redirige con `?v=<total>`.

Es una confirmación tradicional: tilde verde, resumen del pedido (producto, extra,
entrega, dirección, y el total a pagar al recibir) y un botón grande de WhatsApp a
**+51 928 529 656**. **No muestra ningún código de pedido.**

Lleva un contador regresivo de 10 minutos ("Tienes 10:00 minutos para asegurar tu
orden") para meter urgencia a que escriba por WhatsApp, y un aviso verde con lo
**ahorrado** en el pedido (variante + order bump, no solo el total a pagar), al estilo
Temu. El ahorro viaja en el mismo `pedido` de `sessionStorage` que ya usaba el total.

El mensaje de WhatsApp llega con todos los datos ya escritos —nombre, teléfono en
formato internacional, producto, extra, entrega, dirección y total— para que el
vendedor no tenga que pedirlos.

Al pulsar el botón de WhatsApp se dispara `Contact` (una sola vez): así el pixel
distingue a quien de verdad escribe para confirmar, no solo a quien llega a la página.

> **Los datos del cliente viajan por `sessionStorage`, no por la URL.** El pixel de
> `/gracias` manda la URL de la página a Meta, así que un `?nombre=…&telefono=…` le
> entregaría los datos personales del comprador. En la URL solo va el total, que es lo
> que el pixel necesita como `value`.

Si `/api/order` falló, no redirige: el cliente ve el aviso de error y no se cuenta un
Lead de un pedido que no existe.

## Order bump

Uno solo, el mazo **The Classic Tarot Rider Waite** (antes S/ 60, ahora S/ 49). El
carrusel es deslizable: el primer `.slide` es un video (mudo, en bucle, arranca solo al
abrir el modal) y los siguientes son fotos. Añade tantos `.slide` como quieras dentro de
`#bumpCar` y los puntos se generan solos.

Los botones **Sí, añadir** y **No, gracias** van juntos en un bloque `sticky` al pie del
modal, para que en móvil se vean los dos sin desplazarse.

**El pedido se guarda antes de mostrar el bump**, no después: `/api/order` sale en cuanto
el cliente confirma, y el bump solo actualiza esa fila. Así no se pierde ningún lead por
abandonar en la pantalla del bump. Si lo acepta antes de que el servidor responda, queda
en cola y se manda con el número de fila apenas llega.

## Tope por IP

`/api/order` acepta **5 pedidos por minuto y por IP** (binding `ORDER_LIMIT` en
`wrangler.jsonc`), suficiente para probar el formulario varias veces seguidas y bastante
para frenar el spam. Al pasarse responde 429 con un aviso claro.

Si el binding no está disponible, el límite se salta en vez de fallar: nunca queremos
perder un lead por el rate limiter.

## CRM de ventas manuales y seguimiento de envíos

Lo de arriba es el embudo de leads: la landing escribe en la pestaña `Pedidos` y el
vendedor la trabaja. Esto es otra cosa, en el mismo libro y sin tocar aquello.

Las campañas manuales no generan leads en la web: las ventas se cierran por WhatsApp y se
anotan a mano. Esas viven en la pestaña **`Ventas`**, que además le da a cada venta una
**página pública de seguimiento** para el cliente.

```
https://kit-tarot-para-principiantes.tarotperu.store/TS-K3M582R
```

### Escribir poco y no abrir nada

La hoja tiene 10 columnas a la vista y **solo se escriben 6**; dos de esas son un
desplegable. Fecha, código, alerta de recojo y los dos botones de la fila se rellenan solos.
Registrar una venta es **escribir el DNI y el celular en una celda**.

| | Columna | Quién la llena |
|---|---|---|
| A | Fecha | sola · con calendario |
| B | DNI / WSP | ✍️ |
| C | Envío | ▾ Lima · Shalom · Dinsides |
| D | Adelanto | ✍️ |
| E | Saldo | ✍️ |
| F | Clave Shalom / Notas | ✍️ |
| G · H · I | Alerta · Avisar · Voucher | solas |
| J | Estado | ▾ Pendiente · En camino · En destino · Pagado · Cancelado |

Más tres columnas ocultas al final: `Código`, `En destino desde` y `Drive ID`.

Los botones viven **en la propia fila**, como fórmulas `HYPERLINK`: un clic y ya, sin
diálogo que esperar ni venta que elegir de una lista. `Avisar` abre WhatsApp con el mensaje
ya escrito según el estado; `Voucher` abre el panel del celular centrado en esa venta.

**Nada es obligatorio.** Una venta con solo un celular ya funciona; lo que falte, faltará
en la página del cliente y nada más.

### Dos celdas que llevan dos cosas

**`DNI / WSP`** es una sola celda porque en la práctica se anotan juntos. El celular se
reconoce solo: en Perú son nueve dígitos que empiezan en 9 y un DNI son ocho, así que
`45781234 / 987654321`, `987654321` y `+51 987 654 321` se leen igual de bien. Ese mismo
patrón vive en tres sitios —el Worker, el panel y la fórmula de la hoja— y `npm run check`
los **ejecuta** contra los mismos casos en vez de compararlos como texto: comparar cadenas
escapadas es justo el chequeo que sigue pasando cuando el comportamiento ya cambió.

**`Clave Shalom / Notas`** lleva la clave primero y tus notas después de la barra. De esa
celda **solo sale la clave** hacia la página del cliente, y solo si lo que va antes de la
barra parece una clave: corta, sin espacios y sin signos. Si escribes solo notas, no se
publica nada — ante la duda prefiere callarse, porque la alternativa es publicar lo que
escribes de tus clientes en una página sin login.

### Una sola columna de estado

`Estado` es lo único que se actualiza conforme avanza el envío, y **`Pagado` es su último
paso**: recoger y cobrar son el mismo momento, y una casilla aparte obligaba a acordarse de
tocar dos cosas para cerrar una venta.

La hoja además te dice qué llenar sin que tengas que acordarte: en una fila de **Lima** la
celda de la clave se ve gris; al poner **Shalom** se enciende. El saldo va rojo mientras el
estado no sea `Pagado`, y verde tachado en cuanto lo marcas.

El esquema completo, las macros y la migración están en
[`apps-script/README.md`](apps-script/README.md).

### Una tabla, no tres paneles

La hoja anterior tenía un bloque para Dinsides, otro para Shalom y otro para los
separados. Tres bloques lado a lado no se filtran, no se suman y no se pueden conectar a
una página web. Ahora es **una fila por venta** con una columna `Envío` de tres opciones.

Esa columna decide todo lo demás: qué celdas te pide la hoja, qué pasos ve el cliente en su
línea de tiempo y si el envío entra o no en las alertas de recojo. Un pedido que se entrega
en Lima no pasa por ningún mostrador, así que no tiene clave, ni DNI que llevar, ni un
reloj corriendo en contra.

### La página de seguimiento

`public/seguimiento.html`, servida bajo **`/TS-XXXXXXX`**. El código va en la raíz y no
bajo `/seguimiento/…` porque es un link que viaja por WhatsApp: cuanto más corto, mejor.

Muestra una línea de tiempo, el destino, la **clave de recojo** con botón de copiar, la
foto del comprobante y unas instrucciones que **cambian con el estado**:

| Estado | Qué le dice al cliente |
|---|---|
| Pendiente | Estamos preparando tu pedido. No tienes que hacer nada. |
| En camino | Ya salió. **Todavía no vayas a la agencia**, acá te avisamos. |
| En destino (agencia) | Ya puedes recogerlo: **DNI físico**, la clave, el plazo antes de que lo devuelvan, y **el aviso de escribirnos antes de ir** para que le cubramos el flete. |
| En destino (domicilio) | Tu pedido ya llegó. Sin clave ni DNI: no hay mostrador de por medio. |
| Pagado | Gracias. Si algo llegó mal, escríbenos hoy. |

Cuando el paquete está en la agencia, el botón de WhatsApp deja de ser una consulta y pasa
a ser **«Avisar que voy a recoger»**, con el mensaje que pide cubrir la garantía de envío
ya escrito. Es lo único de esa página que le pide al cliente una acción con plazo, así que
va en su propia caja y no como un punto más de la lista: perdido entre los otros, se lee
como un consejo y no se cumple.

A los pocos días de espera aparece además un aviso rojo para que se apure — solo en los
envíos por agencia, que son los únicos que se pueden devolver.

**El código es la única llave de la página**, así que:

- Es **aleatorio, no correlativo** (`TS-` + letra, dígito, letra, tres dígitos, letra).
  Correlativo, cualquiera sumaría uno y vería el envío del vecino.
- No usa `I`, `O`, `0` ni `1`: el cliente lo va a dictar por teléfono.
- **La página no lleva el pixel de Meta.** El pixel manda a Meta la URL de la página, y
  acá la URL *es* la llave: instalarlo sería entregársela. `npm run check` lo vigila.
- Va con `noindex` en la página, en la API y en la foto.
- La respuesta de `/api/seguimiento` lleva solo lo que el cliente puede ver de su propio
  envío. **Nunca** su WhatsApp, su DNI, tus notas internas ni el id de Drive. El DNI está
  en la hoja porque lo pide Shalom al registrar el envío, no para enseñárselo a nadie, y
  comparte celda con el celular igual que la clave comparte celda con las notas: de cada
  una de esas dos celdas sale hacia fuera exactamente un dato, nunca la celda entera.
- Un código mal formado y uno que no existe dan el **mismo 404**: cualquier diferencia le
  diría a un curioso cuándo va por buen camino.
- Tope propio de 40 consultas por minuto y por IP (`TRACK_LIMIT`), aparte del de pedidos.
  Compartiendo el de `/api/order`, un cliente impaciente se quedaba sin poder pedir.

Una ruta como `/TS-loquesea` **también** devuelve la página, que dirá que ese envío no
existe. Quien escribe mal una letra al copiar el link merece eso y no el 404 pelado de
Cloudflare.

### La foto del voucher

Se sube desde el panel del celular —al que se llega con el botón 📷 de la fila— a una
carpeta de **tu propio Drive**, y el Worker la sirve en `/v/<código>`.

**La service account no puede subirla.** Las cuentas de servicio tienen **0 bytes** de
cuota en Drive: toda subida suya muere con `storageQuotaExceeded`. Apps Script, en cambio,
corre con tu cuenta de Google y usa tus 15 GB. Por eso la foto entra por ahí y no por el
Worker, y por eso esto no cuesta nada ni necesita un bucket.

El Worker hace de intermediario en vez de mandar al cliente a Drive:

- La URL queda en tu dominio y no delata dónde guardas nada.
- La CSP de `public/_headers` sigue con `img-src 'self'`, sin abrirle la puerta a
  `googleusercontent`.
- **El id de Drive nunca llega al navegador**, así que nadie puede recorrer tu carpeta a
  partir de una foto.

Prueba tres URLs de Google en orden hasta que una devuelva de verdad una imagen: Drive a
veces contesta la primera con un HTML de "no se puede previsualizar", y servir eso tal cual
le dejaría al cliente un cuadro roto sin que nadie se entere.

### Avisos de recojo

Un paquete que se queda en la agencia vuelve al remitente en un mes. La hoja avisa a los
**2, 6, 15 y 25 días** de haber llegado, por dos vías a la vez: la columna `Alerta` y el
panel están siempre al día por fórmula, y un disparador diario manda correo **solo el día
que una venta cruza un escalón**. Un correo diario repitiendo lo mismo se vuelve ruido, y
en dos semanas dejas de abrirlo — que es justo cuando importaba.

### Quién escribe qué

**El Worker solo lee la pestaña `Ventas`.** Quien escribe es el vendedor, desde el Sheets o
desde el panel del celular. Si el Worker también escribiera ahí habría dos dueños del mismo
dato y ganaría el último que guarde. `npm run check` lo vigila.

Las lecturas se guardan 20 s en la memoria del isolate: Sheets cobra por llamada y releer
la pestaña entera en cada visita sería tirar cuota. El precio es que un cambio de estado
recién hecho puede tardar hasta 20 s en verse en la página del cliente.

## Cómo funciona el flujo

1. El cliente completa el modal y pulsa **REALIZAR PEDIDO**.
2. La pantalla del order bump aparece de inmediato; en paralelo viaja el `POST /api/order`.
   Así el pedido queda guardado aunque el cliente abandone en el bump.
3. El servidor valida, **recalcula el precio con su propia tabla** (`src/lib/pedido.js`),
   inserta la fila y devuelve su número. Si Sheets falla, el cliente ve un aviso y el
   pedido no se da por hecho.
4. Si acepta el bump, `POST /api/upsell` escribe el extra en esa fila y recalcula el
   total leyendo el subtotal de la hoja, no del navegador.
5. El cliente aterriza en `/gracias`, se dispara el `Lead` y se le ofrece el WhatsApp con
   todos sus datos ya escritos.
6. El vendedor trabaja la hoja: filtra por día, contacta a quien no escribió por WhatsApp
   y va moviendo el **Estado**. El `Panel` le da los totales del día.

**Precios**: viven en `src/lib/pedido.js`. Si los cambias, actualiza también los textos
de `public/index.html` — `npm run check` avisa si dejan de coincidir.

---

# Diplomado en Importación (Conde School) → GHL como CRM

Segundo sitio que vive en el mismo Worker, sin relación con el kit de tarot: la landing del
**Diplomado en Importación para Emprendedores** de Conde School. No guarda nada en Google
Sheets — el formulario crea o actualiza el contacto directo en **GoHighLevel (GHL)** vía su
API, con un tag fijo para que la automatización de retargeting ya armada en GHL lo recoja.

```
public/temario-diplomado.html   La landing: hecha a mano, sin dependencias externas
src/api/lead-diplomado.js       POST /api/temario-lead — valida y crea el contacto en GHL
src/api/temario-diag.js         GET  /api/temario-diag  — diagnóstico de la conexión con GHL
src/lib/ghl.js                  Cliente mínimo de la API de GHL (upsert de contacto + tag)
src/lib/lead.js                 Validación del formulario (nombre + WhatsApp)
```

La ruta pública es **`/temario-diplomado`, sin `.html`** — es la URL que se va a pautar y
compartir, así que se sirve explícita desde `src/index.js` (`paginaDelDiplomado`) en vez de
confiar en cómo resuelva Cloudflare las rutas "limpias" por defecto.

## Por qué GHL y no Sheets

Conde School ya tiene su cuenta de GHL con una automatización de retargeting armada sobre
tags de contacto. Meter esos leads en Sheets primero (como el tarot) obligaría a sincronizar
dos sistemas a mano. Aquí el Worker llama directo a la API de GHL — GHL ES el CRM, no hay
una segunda fuente de verdad que mantener sincronizada.

Se usa el endpoint de **upsert** (`POST /contacts/upsert`): si el WhatsApp ya existe como
contacto en esa location, lo actualiza y le suma el tag en vez de duplicarlo. No se crea
ninguna Opportunity ni se toca ningún Pipeline — no hacía falta para el retargeting, y cada
pieza de más es una pieza más que puede romperse en silencio.

## El formulario

Solo dos campos: **nombre y WhatsApp**. Es a propósito la fricción mínima — el patrón que
mejor convierte para captación por WhatsApp en LatAm, y es lo único que la automatización de
retargeting necesita para arrancar. No se pide precio en la página: es una landing de
captación ("quiero información"), no de venta directa — el precio y las fechas de la
próxima cohorte se dan por WhatsApp, ya con el contacto tibio.

Lleva honeypot (`website`, campo oculto) y un límite de 8 solicitudes por minuto y por IP
(`TEMARIO_LEAD_LIMIT` en `wrangler.jsonc`), igual de criterio que `/api/order`: sin el
binding de rate limit, nunca se pierde un lead por eso.

## Variables de entorno

```
GHL_API_KEY       secret — Private Integration Token de GHL (scope: contactos)
GHL_LOCATION_ID   texto  — el location de esa cuenta de GHL
GHL_LEAD_TAG      texto  — tag que se le pone al contacto (por defecto "lead-diplomado-importacion")
DIAG_TOKEN        secret — enciende /api/diag y /api/temario-diag (comparten el mismo)
```

`GHL_API_KEY` se saca de GHL en **Configuración → Integraciones → Private Integrations**,
con permiso de lectura/escritura de contactos. `GHL_LOCATION_ID` sale de la URL del panel de
esa location (`.../location/<ID>/...`). En producción:

```
npx wrangler secret put GHL_API_KEY
npx wrangler secret put DIAG_TOKEN
```

`GHL_LOCATION_ID` y `GHL_LEAD_TAG` van como texto plano en `wrangler.jsonc` (no son
secretos) — cámbialos ahí, no en el dashboard, por la misma razón que `TELEGRAM_CHAT_ID`:
un despliegue borra lo que solo esté en la consola.

## Diagnóstico

`GET /api/temario-diag?token=…` recorre la cadena igual que `/api/diag`, pero para GHL: si
faltan las variables, y si el token tiene acceso a esa location (con un `GET /locations/:id`
que no crea ni cambia nada). Apagado por defecto sin `DIAG_TOKEN`.

## Pendiente antes de pasar a producción

- **Fotos reales de Conde School**: las 7 en uso viven en `public/img/`, subidas directo al
  repo (no pegadas en el chat, que no deja un binario que se pueda leer) y reescaladas al
  tamaño real que ocupan en la página. Orden en que aparecen: `hero-diplomado.jpg` (héroe),
  `nuestrotrabajo.png`, `beneficios-mockup.jpg` y `bono-shopify.jpg` son las tres
  secciones-cuerpo después del temario — puro título corto + foto grande, sin texto de más.
  `log0.jpg` es el logo (header y footer), `wspicon.png` el ícono de todos los botones de
  WhatsApp y `barquito.png` el adorno de "Así trabajamos".
- **Sin la lista de beneficios**: la sección de texto con los 10 ítems se sacó entera — la
  info ya está en la imagen de `beneficios-mockup.jpg`. El temario pasó a ser la segunda
  sección de la página, antes de las fotos.
- **CTA más directo**: todos los botones dicen "Quiero inscribirme" en vez de "Quiero
  información", a propósito — filtra visitas curiosas de gente con intención real de
  inscribirse. El backend no cambia: sigue siendo un lead (nombre + WhatsApp) hacia GHL, no
  una matrícula real; el texto de al lado del botón deja eso claro.
- **Paleta**: violeta `#6b45fc` → celeste `#0d94ff`, muestreados con Pillow directo sobre
  `hero-diplomado.jpg`, y el botón verde `#0ba239` real de Conde School — ya no son a ojo.
  La página en sí es blanca y simple (un registro, no una landing de gradientes); el color
  queda como acento en el header, la sección de temario y el botón de WhatsApp.
- **Redes sociales del footer**: los íconos de Facebook/Instagram/TikTok/YouTube apuntan a
  `#` — reemplaza los `href` por las cuentas reales de Conde School.
- **Credenciales de GHL**: sin `GHL_API_KEY` y `GHL_LOCATION_ID` reales, el formulario
  responde `502` (el lead nunca se pierde en silencio: el cliente ve un error y puede
  reintentar). Corre `/api/temario-diag` después de cargar las credenciales para confirmar
  la cadena completa.

## Pegar la landing directo en GoHighLevel

`public/temario-diplomado.html` funciona tal cual en este dominio, pero las rutas relativas
a `public/img/*` no resuelven si el HTML se pega en un bloque de código de GHL — la página
pasa a vivir en otro dominio. Para eso:

```
npm run build:ghl
```

Genera `dist/temario-diplomado-ghl.html`: el mismo archivo, con las 7 fotos embebidas como
`data:` URI (así no depende de ningún otro host) y `API_BASE` apuntando a un placeholder
(`https://REEMPLAZA-CON-TU-DOMINIO.workers.dev`) en vez de la ruta relativa `/api/temario-lead`
— sin eso, el formulario intentaría llamar al dominio de GHL, que no tiene ese endpoint.
Antes de pegarlo:

1. Despliega el Worker (`npm run deploy`) y anota su URL (`*.workers.dev` o tu dominio).
2. Abre `dist/temario-diplomado-ghl.html` y reemplaza el placeholder de `API_BASE` por esa URL.
3. Pega el HTML completo en el bloque de código de GHL.

`/api/temario-lead` ya responde con CORS abierto (`Access-Control-Allow-Origin: *`) para
esto — el endpoint no usa cookies ni nada por sesión, solo nombre y WhatsApp, así que abrir
el origen no expone nada que un `curl` no pudiera ver igual. `dist/` no se versiona
(`.gitignore`): es un artefacto que se regenera, no algo para mantener a mano.
