# Tarot Claude — product page con COD → Google Sheets → WhatsApp

Landing de un producto con formulario de **pago contra entrega (COD)**. Cuando alguien envía el
formulario, el pedido se guarda en **Google Sheets** y el cliente recibe una **confirmación por
WhatsApp** vía **Evolution API**.

Todo corre en **Cloudflare Pages**: el sitio es estático y la lógica vive en una *Pages Function*
(`/api/order`), así que las credenciales nunca llegan al navegador.

```
Navegador          Cloudflare Pages Function            Servicios
─────────          ─────────────────────────            ─────────
formulario  ──▶  POST /api/order
                   1. valida y normaliza     ──▶  Google Sheets (append fila)
                   2. confirma al cliente    ──▶  Evolution API (WhatsApp)
                   3. avisa al equipo (bg)   ──▶  Evolution API (número interno)
            ◀──  { ok, orderId, total }
```

## Estructura

```
index.html                  Página completa (hero, beneficios, FAQ, formulario COD)
assets/css/styles.css       Estilos, tema oscuro, responsive
assets/js/app.js            Validación en vivo, resumen dinámico, envío por fetch
assets/img/*.svg            Imágenes vectoriales (hero, features, iconos, OG)
functions/api/order.js      Endpoint POST /api/order
functions/_lib/google-sheets.js   JWT RS256 + Sheets API (sin dependencias)
functions/_lib/evolution.js       Envío de WhatsApp y plantillas de mensaje
scripts/check.mjs           Chequeos: assets, SVG y validación del backend
_headers                    Cabeceras de seguridad y caché
.dev.vars.example           Plantilla de variables de entorno
```

## Paso 1 — Google Sheets

1. Crea una hoja nueva. En la **fila 1** pega estos encabezados, en este orden exacto:

   | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
   | Fecha | Pedido | Nombre | Teléfono | Email | Departamento | Distrito | Dirección | Referencia | Cantidad | Total | Horario | Notas | Estado | Origen | UTM | País |

2. Renombra la pestaña a **`Pedidos`** (o define `GOOGLE_SHEET_NAME` con otro nombre).
3. El **ID de la hoja** está en su URL: `docs.google.com/spreadsheets/d/`**`<ID>`**`/edit`.

### Service account

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto.
2. **APIs y servicios → Biblioteca → Google Sheets API → Habilitar**.
3. **Credenciales → Crear credenciales → Cuenta de servicio** (ej. `pedidos-bot`).
4. En la cuenta creada: **Claves → Agregar clave → Crear nueva → JSON**. Se descarga un archivo.
5. Del JSON necesitas dos campos: `client_email` y `private_key`.
6. **Comparte la hoja de cálculo** con ese `client_email`, con permiso de **Editor**.
   Sin este paso la API responde 403.

## Paso 2 — Evolution API

Necesitas una instancia de Evolution API corriendo (self-hosted o proveedor) con WhatsApp
ya vinculado por QR.

- `EVO_API_URL` — URL base, sin barra final (ej. `https://evo.midominio.com`)
- `EVO_INSTANCE` — nombre de la instancia
- `EVO_API_KEY` — la apikey de esa instancia
- `EVO_NOTIFY_NUMBER` *(opcional)* — número interno que recibe un aviso por cada pedido

Prueba manual antes de conectar el sitio:

```bash
curl -X POST "$EVO_API_URL/message/sendText/$EVO_INSTANCE" \
  -H "apikey: $EVO_API_KEY" -H "Content-Type: application/json" \
  -d '{"number":"51987654321","text":"Prueba desde Tarot Claude"}'
```

## Paso 3 — Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git** y elige este repositorio.
2. Configuración de build:
   - Framework preset: **None**
   - Build command: *(vacío)*
   - Build output directory: **`/`**
3. **Settings → Variables and Secrets** y agrega (marcando **Encrypt** en las sensibles),
   tanto en *Production* como en *Preview*:

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

   > `GOOGLE_PRIVATE_KEY` se pega tal cual viene en el JSON, incluidas las secuencias `\n`
   > y las líneas `-----BEGIN/END PRIVATE KEY-----`. El código las convierte solo.

4. Vuelve a desplegar después de guardar las variables (las variables no se aplican
   retroactivamente al último build).
5. Dominio propio: **Custom domains → Set up a domain**. Si el dominio ya está en Cloudflare,
   el registro DNS se crea automáticamente.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # completa tus credenciales reales
npm run dev                      # http://localhost:8788
npm run check                    # chequeos de assets y validación
```

`npm run check` no necesita credenciales ni red: valida que los assets referenciados existan,
que los SVG estén bien formados y que la validación de pedidos acepte/rechace lo correcto.

## Detalles de implementación

**Orden de operaciones.** La fila en Sheets se escribe primero y es la fuente de verdad: si
falla, el endpoint responde 502 y el cliente ve un error. El WhatsApp va después; si Evolution
está caído el pedido **igual queda registrado** y la respuesta trae `whatsappSent: false`, con lo
que la página muestra "te escribimos en unos minutos" en lugar de un error.

**Teléfonos.** Se normalizan a E.164 (`987654321` → `51987654321`). En la hoja se guardan con
apóstrofo inicial para que Sheets no los convierta en número y pierda el cero o el formato.

**Anti-spam.** Campo honeypot invisible (`website`): si viene lleno, el endpoint responde 200 sin
guardar nada, para no darle señal al bot. El cuerpo se limita a 8 KB y todos los campos se
recortan y limpian de caracteres de control.

**Validación doble.** El navegador valida para dar feedback inmediato; el backend vuelve a validar
todo porque el cliente es manipulable. La cantidad fuera de rango cae a 1 y el total se recalcula
en el servidor: el precio nunca se toma del formulario.

**Seguridad.** `_headers` fija CSP sin `unsafe-inline`, `X-Frame-Options: DENY` y caché inmutable
para `/assets/*`. Las credenciales solo existen como variables de entorno del Worker.

## Personalizar

- **Precios**: `PRICES` en `assets/js/app.js` y en `functions/api/order.js` (deben coincidir).
- **Número de WhatsApp del botón final**: `WHATSAPP_BUSINESS` en `assets/js/app.js`.
- **Textos del mensaje**: `buildCustomerMessage` / `buildInternalMessage` en `functions/_lib/evolution.js`.
- **Imágenes**: reemplaza los SVG de `assets/img/` por fotos reales (JPG/WebP) manteniendo los
  nombres, o actualiza las rutas en `index.html`.
