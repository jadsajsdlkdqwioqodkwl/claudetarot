# Kit de Tarot — landing COD → Google Sheets como CRM

Página de producto con formulario de **pago contra entrega**. El pedido se guarda en
**Google Sheets**, que hace de CRM: el vendedor filtra por día, cambia el estado de cada
pedido y ve los totales. El cliente confirma por WhatsApp desde la página de gracias.

Todo corre en un **Cloudflare Worker**: `public/` se sirve como archivos estáticos y el
Worker solo se ejecuta en `/api/*`, así que las credenciales nunca llegan al navegador.

```
wrangler.jsonc          Config del Worker: assets, límite por IP y variables
src/index.js            Router: /api/* al Worker, todo lo demás a los archivos
src/api/order.js        POST /api/order  — guarda el pedido, devuelve su nº de fila
src/api/upsell.js       POST /api/upsell — añade el order bump a esa fila
src/api/diag.js         GET  /api/diag   — diagnóstico de la cadena con Sheets
src/api/setup.js        POST /api/setup  — deja la hoja lista como CRM
src/lib/crm-setup.js    La rutina de preparación, compartida con el script
src/lib/pedido.js       Precios, variantes y utilidades compartidas
src/lib/hoja.js         Esquema de columnas y estados (A–O)
src/lib/google-sheets.js JWT RS256 con WebCrypto + Sheets API, sin dependencias
public/index.html       Tu página (diseño original, sin cambios de estilo)
public/gracias.html     /gracias — confirmación, CTA de WhatsApp y evento Lead
public/kittarotcod/     Imágenes del producto
public/_headers         Cabeceras de seguridad y caché
scripts/setup-sheet.mjs Deja la hoja lista como CRM: `npm run setup:sheet`
scripts/check.mjs       Chequeos sin red: `npm run check`
```

## Imágenes

Los banners ya están en `public/kittarotcod/` como **WebP** (`1.webp`, `2.webp`, `3.webp`).

Faltan cuatro y la página muestra un marcador punteado mientras no existan. Súbelas a
`public/kittarotcod/` con estos nombres exactos:

`logo.svg` · `garantia.webp` · `tienda-segura.webp` · `compra-segura.webp`

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
| `GOOGLE_CLIENT_EMAIL` | `wrangler.jsonc` → `vars` | texto |
| `GOOGLE_PRIVATE_KEY` | **Secret** (dashboard o CLI) | credencial |

> **Importante:** cada despliegue reemplaza las variables de **texto** del dashboard por las de
> `wrangler.jsonc`. Si las escribes solo en la consola, el siguiente build las borra. Los
> **secrets** no se tocan: se definen una vez y sobreviven a todos los despliegues.

### Los dos secrets

Por dashboard: **Workers & Pages → claudetarot → Settings → Variables and secrets →
Add → Type: Secret**.

O por CLI, que evita errores de copiado en la clave privada:

```bash
npx wrangler secret put GOOGLE_PRIVATE_KEY   # pega el private_key completo del JSON
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
| `AddToCart` | product page | order bump aceptado | 30 |
| `PageView` | `/gracias` | al cargar | — |
| `Lead` | `/gracias` | al cargar | total real, con el bump ya sumado |

`InitiateCheckout` va en el primer campo tocado, no al abrir el modal, para no
contar clics accidentales. `InitiateCheckout` y `Lead` se disparan una sola vez.

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

## Página de gracias

`public/gracias.html`, servida en **`/gracias`**. El embudo termina ahí: al cerrar el
order bump, `closeAll()` redirige con `?v=<total>`.

Es una confirmación tradicional: tilde verde, resumen del pedido (producto, extra,
entrega, dirección, y el total a pagar al recibir) y un botón grande de WhatsApp a
**+51 928 529 656**. **No muestra ningún código de pedido.**

El mensaje de WhatsApp llega con todos los datos ya escritos —nombre, teléfono en
formato internacional, producto, extra, entrega, dirección y total— para que el
vendedor no tenga que pedirlos.

> **Los datos del cliente viajan por `sessionStorage`, no por la URL.** El pixel de
> `/gracias` manda la URL de la página a Meta, así que un `?nombre=…&telefono=…` le
> entregaría los datos personales del comprador. En la URL solo va el total, que es lo
> que el pixel necesita como `value`.

Si `/api/order` falló, no redirige: el cliente ve el aviso de error y no se cuenta un
Lead de un pedido que no existe.

## Order bump

Uno solo, el set de velas. El carrusel de fotos es deslizable: añade tantos `.slide`
como quieras dentro de `#bumpCar` y los puntos se generan solos.

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
