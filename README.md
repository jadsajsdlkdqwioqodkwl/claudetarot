# Kit de Tarot — landing COD + CRM en Google Sheets

Página de producto con formulario de pago contra entrega. Cada lead cae en una
hoja de Google que funciona como CRM del vendedor: estado editable, filtros por
día y totales diarios. La confirmación al cliente se hace por WhatsApp desde la
página de gracias (enlace `wa.me`), sin ninguna API de mensajería de por medio.

```
functions/api/order.js          POST /api/order — registra el lead (antes del order bump)
functions/api/bump.js           POST /api/bump  — suma el bump a la MISMA fila
functions/api/click.js          POST /api/click — marca que abrió WhatsApp
functions/_lib/pedido.js        Precios, productos, bump y utilidades
functions/_lib/google-sheets.js JWT RS256 con WebCrypto + Sheets API, sin dependencias
functions/_lib/rate-limit.js    Máximo de leads por IP (requiere KV)
scripts/check.mjs               Chequeos sin red: `npm run check`
scripts/setup-sheet.mjs         Escribe los encabezados de la hoja
```

## La hoja

Pestaña **`Pedidos`**, columnas A..M en este orden exacto:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Fecha y hora | Día | Nombre | WhatsApp | Envío | Dirección / Agencia | Producto |

| H | I | J | K | L | M |
|---|---|---|---|---|---|
| Order bump | Total | Estado | Clic WhatsApp | Notas del vendedor | Event ID |

- **Estado** es un desplegable: `Pendiente` · `Enviado` · `Pagado` · `Anulado`.
  La fila entera se colorea según el valor.
- **Clic WhatsApp** se marca con `Sí` desde `/api/click`. Filtrando por vacío
  sale la lista de a quién hay que perseguir.
- **Event ID** es el identificador interno del lead: localiza su fila al añadir
  el bump y sirve de `event_id` para deduplicar en la Conversions API de Meta.
  Nunca se le muestra al cliente.

Pestaña **`Resumen`**: KPIs de hoy y una tabla por día (leads, pagados,
enviados, pendientes, monto pagado, monto potencial y % de cierre).

## Contrato del formulario

`POST /api/order` espera:

```json
{
  "nombre": "María Fernández",
  "telefono": "987654321",
  "envio": "casa",
  "direccion": "Av. Larco 1234",
  "agencia": "",
  "producto": "1kit",
  "website": ""
}
```

`envio` es `"casa"` o `"agencia"`; se usa `direccion` o `agencia` según
corresponda y ambas caen en la misma columna. `producto` es `"1kit"` o `"2kit"`.
`website` es el honeypot: si viene lleno, la respuesta es 200 pero no se guarda.

Responde `{ ok, eventId, total }`. Guarda el `eventId` en memoria:

- `POST /api/bump`  → `{ eventId, item: "velas" }` responde `{ ok, total }` con
  el total ya actualizado, para mostrarlo en gracias.html.
- `POST /api/click` → `{ eventId }` cuando el cliente pulsa el botón de WhatsApp.

El precio nunca se toma del navegador: se recalcula con la tabla de
`functions/_lib/pedido.js`.

## Variables en Cloudflare Pages

| Variable | Tipo |
|---|---|
| `GOOGLE_SHEET_ID` | texto |
| `GOOGLE_SHEET_NAME` | texto (`Pedidos`) |
| `GOOGLE_CLIENT_EMAIL` | texto |
| `GOOGLE_PRIVATE_KEY` | **secret** |

Comparte la hoja con el `GOOGLE_CLIENT_EMAIL` como Editor o la API responde 403.

### Límite de leads por IP (opcional)

Sin configurar nada, **no hay límite**: puedes probar el formulario las veces
que quieras. Para activar el tope de 5 leads por IP cada 24 h, crea un KV
namespace en el dashboard y enlázalo al proyecto con el nombre **`LEADS_KV`**
(Settings → Bindings → KV namespace). Si el binding no existe, el código lo
avisa por consola y deja pasar todo: nunca se pierde una venta por eso.

## Detalles que costaron sangre

- El `append` apunta a `Pedidos!A:A` y usa **OVERWRITE**, no `INSERT_ROWS`.
  Insertar filas desplaza las referencias de las fórmulas del Resumen y hace
  que la fila nueva herede el formato del encabezado en vez del de fecha.
- Las lecturas usan **UNFORMATTED_VALUE**: con formato de moneda, un total
  vuelve como `"S/ 139"` y cualquier suma posterior da `NaN`.
- Las fechas se escriben como `2026-08-17 21:35:00` en hora de Lima, formato que
  Sheets interpreta como fecha real. Un ISO con `T` y `Z` se guarda como texto y
  rompe los filtros y las sumas por día.
- Nunca pongas casillas de verificación en una columna entera: rellenan `FALSE`
  en las mil filas y el `append` empieza a escribir debajo de todas ellas.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # completa credenciales reales
npm run dev                      # http://localhost:8788
npm run check                    # chequeos sin red
npm run setup:sheet              # reescribe los encabezados
```
