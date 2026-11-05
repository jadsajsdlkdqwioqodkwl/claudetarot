# Landing de la Espada Voladora RC (`/espada/`)

Tienda de prueba aparte, con **su propio píxel**, pedida por el dueño el 2026-11-05: «clonar» el producto
*Flying Sword RC Glider* (planeador a control remoto con forma de espada) en una product page como las del
Cable y la Masilla, con la marca y el logo de **Puerto Secreto** y una paleta propia.

| Qué | Dónde |
|---|---|
| Página de venta | `public/espada/index.html` → `/espada/` y `/` del dominio largo |
| Gracias (resumen y botón de WhatsApp) | `public/espada/gracias.html` → `/espada/gracias` y `/gracias` del dominio largo |
| Fotos | `public/espada/img/` (logo y sellos copiados de `/masilla/img/`) |
| Pedido | `POST /api/order-espada` (`src/api/order-espada.js`) |
| Precios, píxel y dominio | `src/lib/pedido-espada.js` (`PACKS`, `PIXEL_ESPADA`, `HOST_ESPADA`) |
| Hoja | pestaña **Espada** del libro de Pedidos (`GOOGLE_SHEET_ID`), se crea sola con el primer pedido; mismas columnas que «Cable» (`COLUMNAS_CABLE`). `GOOGLE_ESPADA_SHEET_ID` / `GOOGLE_ESPADA_SHEET_NAME` la cambian |
| Aviso | Telegram, «Nuevo pedido: Espada Voladora RC» |
| Pruebas | `scripts/test-pedido-espada.mjs` (Google simulado) y el bloque `espada:` de `scripts/check.mjs`; las dos entran en `npm run check` |

## Píxel (lo más importante)

- **Solo** el píxel `1602561284224693` («MyWorldWeb1»), en la página y en gracias. No es el de Puerto Secreto
  (`1788156381816025`, Cable y Masilla) ni el de Tarot (`1598655637922566`). `npm run check` falla si aparece
  cualquier otro número de píxel en `public/espada/`, si `fbq('init')` usa un número escrito a mano o si la
  página y gracias no tienen el mismo ID que `PIXEL_ESPADA`.
- Eventos (todos desde el navegador; esta landing no usa la API de conversiones):
  - **PageView** al cargar la página y la gracias.
  - **ViewContent** al cargar la página (S/ 159, 1 espada).
  - **AddToCart** al elegir otro pack y al abrir el formulario.
  - **InitiateCheckout** al tocar el primer campo del formulario (una vez).
  - **Lead** y **Purchase** apenas el servidor confirma el pedido, con el mismo `eventID` (`ES-XXXXXX`, el
    mismo que queda en la hoja), el total que devuelve el servidor y los datos del cliente para la calidad de
    coincidencia (teléfono, nombre, ciudad, país; el píxel los hashea). La gracias **no** los repite.
- La página siempre manda a **`/espada/gracias`** (ruta absoluta). Por qué: en los dominios largos, `/gracias`
  sin su regla de Cloudflare la sirve la gracias de **Tarot**, con el píxel de Tarot (los archivos de `public/`
  se sirven antes que el Worker). Con la ruta absoluta eso no puede pasar.

## Dominio largo

> **Pendiente (2026-11-05):** el hostname y las dos reglas todavía NO están creados en Cloudflare (la sesión no
> tuvo permiso para cambiar dominios). Mientras tanto la landing funciona en
> `https://kit-tarot-para-principiantes.tarotperu.store/espada/`. Pedidos de prueba hechos ese día: filas 2 y 3 de la
> pestaña «Espada» («PRUEBA Claude NO ATENDER», `ES-363F82` y `ES-TZ4YMW`); se pueden borrar.

`https://puerto-secreto-espada-voladora-rc-planeador-a-control-remoto.tarotperu.store` (label de 60
caracteres, sin «tarot»): hostname de Workers → `claudetarot` y dos reglas de reescritura en la zona
`tarotperu.store` (Reglas → Transformar → Reescribir URL, `http_request_transform`), junto a las del Cable y la
Masilla, que no se tocan: `/` → `/espada/` y `/gracias` → `/espada/gracias`. El Worker también atiende ese host
(`HOST_ESPADA` en `src/index.js`) por si una regla falta.

## Lo que el dueño debe confirmar

- **Precios provisorios**: 1 espada S/ 159 (antes 318) · Pack Dúo S/ 279 (antes 636) · Pack Familia S/ 379
  (antes 954). Se cambian en `src/lib/pedido-espada.js` y en `PACKS` de `public/espada/index.html` a la vez.
- **Color**: dorado o cobre; se elige al confirmar por WhatsApp (columna Detalle: «Color por confirmar
  (WhatsApp)»), como el conector del Cable. Si se quiere elegir en el formulario, se agrega.
- **Qué incluye**: control tipo mando, batería recargable, cable USB y hélices de repuesto (lo que muestran
  las fotos del producto). Sin garantía prometida y sin datos de autonomía de vuelo ni edad.
- WhatsApp de atención: `51940028332` (Puerto Secreto).

## Fotos

Del producto real (las mismas del anuncio original; su CDN bloquea descargas, se tomaron de las fichas
públicas del mismo producto). Las infografías venían con textos en inglés: se recortaron para quitarlos.
Se descartaron las fotos que muestran una mochila y un control de muñeca, que vienen solo en otra versión.
