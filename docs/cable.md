# Cable con Soporte 2 en 1 — landing `/cable/` (Lima, pago contra entrega)

Producto aparte del Kit de Tarot y de URO. Página de venta COD solo para Lima y Callao,
con el mismo mecanismo de pedido que la del Kit (Worker de Cloudflare + cuenta de servicio
de Google, **sin Apps Script**). Nació el 2026-10-18 a partir de la ficha de
beverlygoods.com, rehecha para Perú.

## Dónde vive cada cosa

| Qué | Archivo |
|---|---|
| Página de venta | `public/cable/index.html` → `https://<dominio>/cable/` |
| Gracias (evento Lead, resumen, WhatsApp) | `public/cable/gracias.html` → `/cable/gracias` |
| Fotos y videos | `public/cable/img/*.webp`, `public/cable/video/en-accion-N.mp4` (+ `.webp` de portada) |
| Endpoint del formulario | `src/api/order-cable.js` → `POST /api/order-cable` (ruta en `src/index.js`) |
| Precios, conectores, colores, columnas | `src/lib/pedido-cable.js` (el servidor manda; el navegador solo dice qué pack) |
| Pruebas | `scripts/test-pedido-cable.mjs` (Google simulado) y el bloque `cable:` de `scripts/check.mjs` |

## Qué hace cada pedido

1. El formulario manda nombre, WhatsApp, distrito, dirección, referencia (opcional), pack y,
   por cada cable del pack, conector (USB-C / Lightning) y color (Naranja / Negro).
2. El servidor valida, **recalcula el total con su propia tabla** y escribe una fila en la
   pestaña **«Cable»** del mismo libro de Pedidos (`GOOGLE_SHEET_ID`). La pestaña **se crea
   sola** con el primer pedido (encabezados, filtro, Estado con desplegable, FBP/FBC/Event ID/UA/IP
   ocultas). Si ya existe, no se toca.
3. Aviso por Telegram al dueño (el mismo bot de los pedidos del Kit).
4. Redirige a `/cable/gracias` (los datos viajan por `sessionStorage`, nunca por la URL).

**No** dispara el WhatsApp automático de «pedido recibido» (`pedido_web_recibido` es de Tarot
Store) ni toca la tabla `pedidos_web` del CRM: el pedido vive solo en la hoja y en Telegram.

Para usar **otro libro** de Google Sheets: poner `GOOGLE_CABLE_SHEET_ID` (y, si se quiere,
`GOOGLE_CABLE_SHEET_NAME`) en `wrangler.jsonc` → `vars`, y compartir ese libro como Editor con
`GOOGLE_CLIENT_EMAIL` (la cuenta de servicio de `wrangler.jsonc`).

## Columnas de la pestaña «Cable»

A Fecha · B Nombre · C WhatsApp · D Distrito · E Dirección · F Referencia · G Pack · H Detalle
(`1) USB-C Naranja · 2) Lightning Negro`) · I Cantidad · J Total · K Estado · L FBP · M FBC ·
N Event ID (`CB-…`) · O User Agent · P IP. Si se agregan columnas, van **al final**.

## Antes de lanzar (valores que hay que poner o confirmar)

- `PIXEL_ID` (píxel de Meta de este producto) y `WA_NUMERO` (WhatsApp de atención, con 51):
  son constantes al inicio del `<script>` de `public/cable/index.html` **y** de `gracias.html`
  (`npm run check` falla si no coinciden). Vacíos = no se carga el píxel y no se muestran los
  botones de WhatsApp.
- Precios y packs: hoy S/ 39 (antes 79) · S/ 69 (antes 158) · S/ 89 (antes 237), cada uno con
  una bolsa de regalo por cable. Se cambian en `src/lib/pedido-cable.js` **y** en `PACKS` de
  `index.html` (el chequeo avisa si difieren).
- Textos que prometen algo y hay que confirmar: entrega «24 a 48 horas» en Lima, garantía de
  30 días con cambio, colores Naranja y Negro disponibles, bolsa incluida en todos los packs.
- Reseñas: la página **no trae reseñas inventadas**. Se agregan reseñas reales en el arreglo
  `RESENAS` (`{ nombre, fecha, texto, foto }`); mientras esté vacío la sección no se muestra.
- Especificaciones: la ficha original se contradice (240 W en las fotos, 140 W en el texto), por eso
  la página dice solo «carga rápida» y no cita vatios. Confirmar con el proveedor antes de citarlos.

## Fotos y videos

Salen de la ficha original, sin los textos en inglés: la portada es un recorte de una foto de
estilo de vida con el rótulo borrado, los videos están recortados para quitar los subtítulos en
inglés y sin audio (se ven mudos). Los videos solo se descargan al acercarse (`data-src`).
En el último tramo de los videos 2 y 3 aparece la bolsa con la marca del proveedor.
Si se cambia el contenido de un archivo hay que **renombrarlo** (`_headers` los cachea un año).
