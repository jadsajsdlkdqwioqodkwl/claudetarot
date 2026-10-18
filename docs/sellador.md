# Landing «Masilla selladora multiusos» (`/sellador`)

Advertorial para Lima, con el mismo formulario COD de Tarot Store. Las fotos y la
idea de los 7 motivos salen de la página del proveedor; los textos están
reescritos para Lima (silicona/espuma, cucarachas, olor a desagüe, Yape, Shalom…)
y **sin testimonios inventados** (los de la página original eran de EE. UU. y no
se copian).

## Cómo funciona
- Página: `/sellador/` → modal COD → `POST /api/order-sellador` → fila en la
  pestaña **Sellador** del libro de Pedidos (la crea sola el primer pedido; no hace
  falta Apps Script, el Worker escribe con la cuenta de servicio) → Telegram →
  `/sellador/gracias.html` (dispara `Lead`).
- Columnas (`src/lib/sellador.js`): Fecha, Nombre, WhatsApp, Envío, Dirección /
  Agencia, Producto, Sachets, Total, Estado, Campaña (`utm_campaign`), FBP, FBC,
  Event ID, User Agent, IP.
- No usa `pedidos_web` de D1: eso dispararía la plantilla de WhatsApp «recibimos su
  pedido» por el número de Tarot.

## Lo que el dueño debe completar antes de abrir anuncios
1. **Precios** (hoy provisionales: x2 S/39, x5 S/69, x10 S/109): `src/lib/sellador.js`
   y `FB` en `public/sellador/index.html` (+ las tarjetas de la página). `npm run check`
   avisa si no coinciden.
2. **`PIXEL_ID`** del producto, en `index.html` y en `gracias.html` (vacío = sin píxel).
3. **`WA_NUMERO`** (51XXXXXXXXX) en `index.html`: activa el botón de WhatsApp en
   `/gracias` y la salida de rescate si falla la red.
4. Reseñas **reales** (`RESENAS` en `index.html`); vacío = la sección no aparece.
5. Garantía, tiempos de entrega y términos del producto (hoy: pago al recibir y
   entrega en Lima al día siguiente, igual que Tarot).
6. Deploy (`npm run deploy`). No hay migraciones.
