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

1. El formulario manda nombre, WhatsApp, envío (Lima o provincia), distrito/ciudad, dirección o agencia y pack.
2. El servidor valida, **recalcula el total con su tabla** y escribe una fila en la pestaña **«Masilla»** del
   libro de Pedidos (`GOOGLE_SHEET_ID`), que **se crea sola** con el primer pedido. La columna «Detalle» dice
   cuántos sobres lleva el pedido (20 por kit). Para otro libro o nombre: `GOOGLE_MASILLA_SHEET_ID` /
   `GOOGLE_MASILLA_SHEET_NAME` en `wrangler.jsonc` → `vars` (compartir el libro como Editor con `GOOGLE_CLIENT_EMAIL`).
3. Aviso por Telegram al dueño. Event ID con prefijo `MS-`.
4. Redirige a `/masilla/gracias` (los datos viajan por `sessionStorage`, nunca por la URL).

No dispara el WhatsApp automático de Tarot ni toca `pedidos_web`.

## Fotos y videos

- Fotos (720×720): sacadas de cuadros de los videos que subió el dueño, recortadas para no incluir los
  subtítulos: `principal` (sobres SOPAMI SEALANTCLAY), `kit` (los 20 sobres), `hueco`, `tuberia`, `manos`; `pack` es la
  miniatura de los packs. `logo` y `badges` son los del Cable (Puerto Secreto).
- Videos: recortados al 70 % superior (donde no hay subtítulos en inglés) en 4:5, 480×600, **sin audio**, de 18 a 24 s.
  Los originales traen la voz doblada al español, pero **nombran precios en dólares y «50 % de descuento»** que no
  son los de esta oferta; por eso van mudos. Si se quiere voz, hay que re-grabarla o editar el audio.
- Si se cambia el contenido de un archivo hay que **renombrarlo** (`_headers` los cachea un año).
- Los videos y las fotos muestran la marca del proveedor (SOPAMI) en los sobres.

## Antes de lanzar (lo que el dueño debe confirmar)

- **Precios provisorios**: 1 kit S/ 49 (antes 99) · Pack Dúo 2 kits S/ 79 (antes 198) · Pack Hogar 3 kits S/ 99 (antes 297).
  Se cambian en `src/lib/pedido-masilla.js` **y** en `PACKS` de `index.html` (el chequeo avisa si difieren).
- **20 sobres por kit**: sale de los videos del proveedor; confirmar con el proveedor cuántos sobres trae el pedido real.
- **Sin garantía prometida** (la del Cable era de 90 días con cambio). Decidir si se ofrece alguna.
- Afirmaciones que están en los videos y se repiten en la página: «endurece firme e impermeable», «se puede lijar y pintar»,
  «ayuda a bloquear malos olores e insectos». Confirmar con el proveedor antes de anunciarlas.
- Píxel (`1788156381816025`, Puerto Secreto) y WhatsApp (`51930575181`) son los del Cable; eventos hasta InitiateCheckout (sin Lead ni Purchase).
- Entrega «24 a 48 horas» en Lima y «2 a 3 días» en provincia (como el Cable).
- Falta la regla de reescritura de dominio propio (si se quiere un dominio largo como el del Cable): hoy se comparte
  `/masilla/` o la ruta larga `RUTA_LARGA_MASILLA`.
- Reseñas: no hay; la página no trae reseñas inventadas.
