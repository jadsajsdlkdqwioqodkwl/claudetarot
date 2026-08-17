# Kit de Tarot — landing COD → Google Sheets → WhatsApp

Página de producto con formulario de **pago contra entrega**. Cuando el cliente envía el modal,
el pedido se guarda en **Google Sheets** y recibe una **confirmación por WhatsApp** vía
**Evolution API**. Los upsells aceptados actualizan la misma fila.

Todo corre en un **Cloudflare Worker**: `public/` se sirve como archivos estáticos y el Worker
solo se ejecuta en `/api/*`, así que las credenciales nunca llegan al navegador.

```
wrangler.jsonc          Config del Worker: assets, rutas y variables de texto
src/index.js            Router: /api/* al Worker, todo lo demás a los archivos
src/api/order.js        POST /api/order  — guarda el pedido y confirma por WhatsApp
src/api/upsell.js       POST /api/upsell — suma el upsell a la fila del pedido
src/api/diag.js         GET  /api/diag   — diagnóstico de la cadena con Sheets
src/lib/pedido.js       Precios, variantes y utilidades compartidas
src/lib/hoja.js         Esquema de columnas de la hoja (A–U)
src/lib/google-sheets.js JWT RS256 con WebCrypto + Sheets API, sin dependencias
src/lib/evolution.js    Envío de WhatsApp y plantillas de mensaje
public/index.html       Tu página (diseño original, sin cambios de estilo)
public/gracias.html     /gracias — confirmación, CTA de WhatsApp y evento Lead
public/kittarotcod/     Imágenes del producto
public/_headers         Cabeceras de seguridad y caché
scripts/check.mjs       Chequeos sin red: `npm run check`
```

## Imágenes

Los banners ya están en `public/kittarotcod/` como **WebP** (`1.webp`, `2.webp`, `3.webp`).

Faltan cuatro y la página muestra un marcador punteado mientras no existan. Súbelas a
`public/kittarotcod/` con estos nombres exactos:

`logo.svg` · `garantia.webp` · `tienda-segura.webp` · `compra-segura.webp`

## Paso 1 — Google Sheets

Crea la hoja, nombra la pestaña **`Pedidos`** y pega estos encabezados en la fila 1:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Fecha | Pedido | Nombre | WhatsApp | Envío | Dirección | Agencia | Variante |

| I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|
| Cantidad | Subtotal | Upsells | Total | Estado | Origen | UTM | País |

| Q | R | S | T | U |
|---|---|---|---|---|
| FBP | FBC | Event ID Lead | User Agent | IP |

`npm run setup:sheet` las escribe solas. **Q–U** son para la Conversions API:
sin `FBP`/`FBC` Meta no puede casar el pedido con el clic del anuncio, y sin
`User Agent`/`IP` baja mucho la calidad de coincidencia. El `Event ID Lead`
es el mismo que dispara el pixel en `/gracias`, así que Meta deduplica.

> El orden importa: `/api/upsell` escribe en **K** y **L** buscando el pedido por la columna **B**.
> El esquema vive en `src/lib/hoja.js` y `npm run check` verifica que la fila
> que arma `order.js` siga encajando con los encabezados.

El **ID de la hoja** está en su URL: `docs.google.com/spreadsheets/d/`**`<ID>`**`/edit`.

### Habilitar la API y crear la service account

1. [console.cloud.google.com](https://console.cloud.google.com/) → crea un proyecto.
2. **APIs y servicios → Biblioteca** → busca *Google Sheets API* → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
   Nómbrala `pedidos-bot` y crea. No necesita rol de IAM.
4. Entra a la cuenta creada → pestaña **Claves** → **Agregar clave → Crear nueva → JSON**.
   Se descarga un archivo; de ahí salen `client_email` y `private_key`.
5. **Comparte la hoja** con ese `client_email` como **Editor**. Sin esto la API responde 403.

## Paso 2 — Evolution API

Instancia con WhatsApp vinculado por QR. Pruébala antes de conectar el sitio:

```bash
curl -X POST "$EVO_API_URL/message/sendText/$EVO_INSTANCE" \
  -H "apikey: $EVO_API_KEY" -H "Content-Type: application/json" \
  -d '{"number":"51987654321","text":"Prueba"}'
```

## Paso 3 — Variables en Cloudflare

Hay **dos sitios distintos** y usar el equivocado hace perder el valor:

| Variable | Dónde va | Por qué |
|---|---|---|
| `GOOGLE_SHEET_ID` | `wrangler.jsonc` → `vars` | texto, no es secreto |
| `GOOGLE_SHEET_NAME` | `wrangler.jsonc` → `vars` | texto |
| `GOOGLE_CLIENT_EMAIL` | `wrangler.jsonc` → `vars` | texto |
| `EVO_API_URL` | `wrangler.jsonc` → `vars` | texto |
| `EVO_INSTANCE` | `wrangler.jsonc` → `vars` | texto |
| `EVO_NOTIFY_NUMBER` | `wrangler.jsonc` → `vars` | texto, opcional |
| `GOOGLE_PRIVATE_KEY` | **Secret** (dashboard o CLI) | credencial |
| `EVO_API_KEY` | **Secret** (dashboard o CLI) | credencial |

> **Importante:** cada despliegue reemplaza las variables de **texto** del dashboard por las de
> `wrangler.jsonc`. Si las escribes solo en la consola, el siguiente build las borra. Los
> **secrets** no se tocan: se definen una vez y sobreviven a todos los despliegues.

### Los dos secrets

Por dashboard: **Workers & Pages → claudetarot → Settings → Variables and secrets →
Add → Type: Secret**.

O por CLI, que evita errores de copiado en la clave privada:

```bash
npx wrangler secret put GOOGLE_PRIVATE_KEY   # pega el private_key completo del JSON
npx wrangler secret put EVO_API_KEY
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
| `Lead` | `/gracias` | al cargar, con código de pedido | total real |

`InitiateCheckout` va en el primer campo tocado, no al abrir el modal, para no
contar clics accidentales. `InitiateCheckout` y `Lead` se disparan una sola vez.

**El `Lead` vive en `/gracias`**, no en la respuesta de `/api/order`: así solo
cuenta a quien de verdad terminó el embudo. Su `eventID` es `<pedido>-lead`, el
mismo valor que queda guardado en la columna **S** de la hoja.

**`Purchase` no se dispara en el navegador.** Sale desde la hoja por Conversions
API, usando el código de pedido como `event_id`.

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

`public/gracias.html`, servida en **`/gracias`**. El embudo termina ahí: al
cerrar los upsells, `closeAll()` redirige con `?p=<pedido>&v=<total>`.

Muestra el código de pedido, el total a pagar al recibir y un botón grande de
WhatsApp a **+51 928 529 656** con el mensaje ya escrito. Lleva `noindex`.

Si `/api/order` falló, no redirige: el cliente ve el aviso de error y no se
cuenta un Lead que no existe.

## Cómo funciona el flujo

1. El cliente completa el modal y pulsa **REALIZAR PEDIDO**.
2. La pantalla de upsell aparece de inmediato; en paralelo viaja el `POST /api/order`.
   Así el pedido queda guardado aunque el cliente abandone en los upsells.
3. El servidor valida, **recalcula el precio con su propia tabla** (`src/lib/pedido.js`)
   e inserta la fila. Si Sheets falla, el cliente ve un aviso y el pedido no se da por hecho.
4. Se envía el WhatsApp de confirmación. Si Evolution está caído, el pedido igual quedó
   registrado y solo se pierde el mensaje automático.
5. Cada upsell aceptado dispara `POST /api/upsell`, que busca la fila por código de pedido
   y actualiza *Upsells* y *Total*. Si el cliente acepta antes de que responda `/api/order`,
   queda en cola y se envía apenas llega el código.

**Precios**: viven en `src/lib/pedido.js`. Si los cambias, actualiza también los textos
de `public/index.html` — `npm run check` avisa si dejan de coincidir.
