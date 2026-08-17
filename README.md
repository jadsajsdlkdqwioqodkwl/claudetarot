# Kit de Tarot — landing COD → Google Sheets → WhatsApp

Página de producto con formulario de **pago contra entrega**. Cuando el cliente envía el modal,
el pedido se guarda en **Google Sheets** y recibe una **confirmación por WhatsApp** vía
**Evolution API**. Los upsells aceptados actualizan la misma fila.

Todo corre en **Cloudflare Pages**: la página es estática y la lógica vive en *Pages Functions*,
así que las credenciales nunca llegan al navegador.

```
index.html                      Tu página (diseño original, sin cambios de estilo)
functions/api/order.js          POST /api/order  — guarda el pedido y confirma por WhatsApp
functions/api/upsell.js         POST /api/upsell — suma el upsell a la fila del pedido
functions/_lib/pedido.js        Precios, variantes y utilidades compartidas
functions/_lib/google-sheets.js JWT RS256 con WebCrypto + Sheets API, sin dependencias
functions/_lib/evolution.js     Envío de WhatsApp y plantillas de mensaje
_headers                        Cabeceras de seguridad y caché
scripts/check.mjs               Chequeos sin red: `npm run check`
```

## Imágenes que faltan

La página las referencia y muestra un marcador punteado mientras no existan. Súbelas a la raíz
del repo con estos nombres exactos:

`1.png` (banner) · `2.png` · `3.png` · `logo.svg` · `garantia.webp` · `tienda-segura.webp` ·
`compra-segura.webp`

## Paso 1 — Google Sheets

Crea la hoja, nombra la pestaña **`Pedidos`** y pega estos encabezados en la fila 1:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Fecha | Pedido | Nombre | WhatsApp | Envío | Dirección | Agencia | Variante |

| I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|
| Cantidad | Subtotal | Upsells | Total | Estado | Origen | UTM | País |

> El orden importa: `/api/upsell` escribe en **K** y **L** buscando el pedido por la columna **B**.

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

## Paso 3 — Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git** y elige este repositorio.
2. Framework preset **None**, build command vacío, output directory **`/`**.
3. **Settings → Variables and Secrets**, en *Production* y *Preview*:

   | Variable | Tipo |
   |---|---|
   | `GOOGLE_SHEET_ID` | texto |
   | `GOOGLE_SHEET_NAME` | texto (`Pedidos`) |
   | `GOOGLE_CLIENT_EMAIL` | texto |
   | `GOOGLE_PRIVATE_KEY` | **secret** |
   | `EVO_API_URL` | texto |
   | `EVO_INSTANCE` | texto |
   | `EVO_API_KEY` | **secret** |
   | `EVO_NOTIFY_NUMBER` | texto (opcional) |

   `GOOGLE_PRIVATE_KEY` se pega tal cual viene en el JSON, con los `\n` incluidos.

4. Vuelve a desplegar: las variables no se aplican al build anterior.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # completa credenciales reales
npm run dev                      # http://localhost:8788
npm run check                    # chequeos sin red ni credenciales
```

## Cómo funciona el flujo

1. El cliente completa el modal y pulsa **REALIZAR PEDIDO**.
2. La pantalla de upsell aparece de inmediato; en paralelo viaja el `POST /api/order`.
   Así el pedido queda guardado aunque el cliente abandone en los upsells.
3. El servidor valida, **recalcula el precio con su propia tabla** (`functions/_lib/pedido.js`)
   e inserta la fila. Si Sheets falla, el cliente ve un aviso y el pedido no se da por hecho.
4. Se envía el WhatsApp de confirmación. Si Evolution está caído, el pedido igual quedó
   registrado y solo se pierde el mensaje automático.
5. Cada upsell aceptado dispara `POST /api/upsell`, que busca la fila por código de pedido
   y actualiza *Upsells* y *Total*. Si el cliente acepta antes de que responda `/api/order`,
   queda en cola y se envía apenas llega el código.

**Precios**: viven en `functions/_lib/pedido.js`. Si los cambias, actualiza también los textos
de `index.html` — `npm run check` avisa si dejan de coincidir.
