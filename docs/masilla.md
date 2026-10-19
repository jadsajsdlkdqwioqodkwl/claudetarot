# Masilla Selladora — landing `/masilla/` (Lima y provincia, pago contra entrega)

Producto aparte del Kit de Tarot, de URO y del Cable. Se hizo el 2026-10-18 copiando la landing del
Cable (`docs/cable.md`): mismo mecanismo de pedido (Worker + cuenta de servicio de Google, sin Apps Script).

## Dónde vive cada cosa

| Qué | Archivo |
|---|---|
| Página de venta | `public/masilla/index.html` → `https://<dominio>/masilla/` |
| Gracias | `public/masilla/gracias.html` → `/masilla/gracias` |
| Fotos y videos | `public/masilla/img/*.webp`, `public/masilla/video/en-accion-N.mp4` (+ `.webp` de portada) |
| Endpoint del formulario | `src/api/order-masilla.js` → `POST /api/order-masilla` (ruta en `src/index.js`) |
| Precios y ruta larga | `src/lib/pedido-masilla.js` (el servidor manda; el navegador solo dice qué pack) |
| Columnas de la hoja | las del Cable (`COLUMNAS_CABLE` en `src/lib/pedido-cable.js`) |
| Pruebas | `scripts/test-pedido-masilla.mjs` (Google simulado) y el bloque `masilla:` de `scripts/check.mjs` |
| Videos originales | `imagenes-fuente/masilla/video-es-*.mp4` (con la voz en español y subtítulos en inglés) |

## Qué hace cada pedido

1. El formulario (el mismo COD del Cable y del advertorial `/sellador`) manda nombre, WhatsApp, envío (Lima o provincia), distrito/ciudad, dirección o agencia y oferta.
2. El servidor valida, **recalcula el total con su tabla** y escribe una fila en la pestaña **«Masilla»** del
   libro de Pedidos (`GOOGLE_SHEET_ID`), que **se crea sola** con el primer pedido. La columna «Detalle» dice
   cuántos sachets lleva el pedido. Para otro libro o nombre: `GOOGLE_MASILLA_SHEET_ID` /
   `GOOGLE_MASILLA_SHEET_NAME` en `wrangler.jsonc` → `vars` (compartir el libro como Editor con `GOOGLE_CLIENT_EMAIL`).
3. Aviso por Telegram al dueño. Event ID con prefijo `MS-`.
4. Redirige a `/masilla/gracias` (los datos viajan por `sessionStorage`, nunca por la URL).

No dispara el WhatsApp automático de Tarot ni toca `pedidos_web`.

## Ofertas (pedido del dueño, 2026-10-18)

Oferta 1 = 10 sachets · Oferta 2 = 20 sachets · Oferta 3 = 40 sachets. Cada oferta es un solo pedido (`cantidad` 1) y
la hoja guarda «N sachets» en Detalle. **Precios confirmados por el dueño (2026-10-18): S/ 69 (antes 99) · S/ 99 (antes 159) · S/ 129 (antes 259). CAMBIARON el 2026-10-19: Oferta 1 S/ 89 (antes 99) · Oferta 2 S/ 129 (antes 159) · Oferta 3 S/ 199 (antes 259).**

## Fotos y videos

- Fotos: `principal` (foto de catálogo de la web, sachets SOPAMI y bloque de masilla, de un listado de Walmart/Amazon),
  `real` (cuadro de los videos del dueño), `hueco`, `tuberia` y `plagas` (las del advertorial `/sellador`, que salen de la
  página del proveedor); `pack` es la miniatura de las ofertas. `logo` y `badges` son los del Cable (Puerto Secreto).
  Las fotos de la web son de listados de terceros: si se quiere evitar reclamos, reemplazar por fotos propias con el mismo nombre.
- Videos: recortados al 70 % superior (donde no hay subtítulos en inglés) en 4:5, 480×600, **sin audio**, de 18 a 24 s.
  Los originales traen la voz doblada al español, pero **nombran precios en dólares y «50 % de descuento»** que no
  son los de esta oferta; por eso van mudos. Si se quiere voz, hay que re-grabarla o editar el audio.
- Si se cambia el contenido de un archivo hay que **renombrarlo** (`_headers` los cachea un año).
- Los videos y las fotos muestran la marca del proveedor (SOPAMI) en los sachets.

## Antes de lanzar (lo que el dueño debe confirmar)

- Precios: ya confirmados (arriba). Se cambian en `src/lib/pedido-masilla.js` **y** en `PACKS` de `index.html` (el chequeo avisa si difieren).
- **Un solo producto, dos páginas**: `/sellador` (advertorial, rama `claude/dreamy-carson-pmtqbe`, aún sin merge a `main`) y `/masilla/` (ficha como la del Cable) escriben en pestañas distintas («Sellador» y «Masilla»). Decidir si se queda una o las dos.
- **Sin garantía prometida** (la del Cable era de 90 días con cambio). Decidir si se ofrece alguna.
- Afirmaciones que están en los videos y se repiten en la página: «endurece firme e impermeable», «se puede lijar y pintar»,
  «ayuda a bloquear malos olores e insectos». Confirmar con el proveedor antes de anunciarlas.
- Píxel (`1788156381816025`, Puerto Secreto) y WhatsApp (`51940028332`, corregido el 2026-10-19; antes `51930575181`, descartado) son los del Cable; eventos hasta InitiateCheckout en la página de venta; Lead y Purchase salen desde `/gracias` (corregido el 2026-10-19; antes decía «sin Lead ni Purchase»).
- Entrega «24 a 48 horas» en Lima y «2 a 3 días» en provincia (como el Cable).
- Falta la regla de reescritura de dominio propio (si se quiere un dominio largo como el del Cable): hoy se comparte
  `/masilla/` o la ruta larga `RUTA_LARGA_MASILLA`.
- Reseñas: no hay; la página no trae reseñas inventadas.

## Versión 2 (2026-10-18): hero en video

`public/masilla-v2/` es una copia de `public/masilla/` (misma página, mismo endpoint, mismos precios; las fotos y videos de la v1 se siguen sirviendo desde `/masilla/…`). La primera imagen de la galería es un video largo (17 s, 576×720, 4:5) hecho desde el original `imagenes-fuente/masilla/video-es-ES-1.mp4` (parte superior, sin subtítulos en inglés; mudo), `video/hero-masilla.mp4` con su portada `.webp`, en mejor calidad que el GIF de la primera entrega, que se descartó. La galería es 4:5 para no recortar. Si se cambia un video hay que renombrarlo (`_headers` lo cachea un año). Si se cambia un precio o un texto común, hacerlo en las dos versiones.
