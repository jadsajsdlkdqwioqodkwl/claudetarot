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
   por cada cable del pack, el conector (USB-C / Lightning). Solo se vende en naranja: no hay elección de color.
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
(`1) USB-C · 2) Lightning`) · I Cantidad · J Total · K Estado · L FBP · M FBC ·
N Event ID (`CB-…`) · O User Agent · P IP. Si se agregan columnas, van **al final**.

## Antes de lanzar (valores que hay que poner o confirmar)

- `PIXEL_ID` ya está puesto: `1788156381816025`, el píxel de Puerto Secreto (el mismo que usa el Worker `uro`; no es el de Tarot). Eventos: PageView, ViewContent, AddToCart e InitiateCheckout; **Lead y Purchase se envían desde `/gracias` (corregido el 2026-10-19; antes decía que no), una vez por pedido y con `eventID`** (`npm run check` lo vigila). Falta `WA_NUMERO`; las constantes están en `index.html` y `gracias.html`. Antes: `PIXEL_ID` y `WA_NUMERO` (WhatsApp de atención, con 51):
  son constantes al inicio del `<script>` de `public/cable/index.html` **y** de `gracias.html`
  (`npm run check` falla si no coinciden). Vacíos = no se carga el píxel y no se muestran los
  botones de WhatsApp.
- Precios y packs (piso del dueño: 1 cable = S/ 79; costo supuesto ~S/ 20 por unidad): 1 cable S/ 79 (antes 149) ·
  Pack Dúo S/ 129 (antes 298) · Pack Regalo S/ 169 (antes 447), cada uno con una bolsa de regalo por cable.
  Margen bruto por pedido: S/ 59 · S/ 89 · S/ 109, antes de publicidad y envío. Se cambian en `src/lib/pedido-cable.js` **y** en `PACKS` de
  `index.html` (el chequeo avisa si difieren).
- Textos que prometen algo (confirmados por el dueño el 2026-10-18, es un testeo): entrega «24 a 48 horas» en Lima,
  **garantía de 90 días con cambio sin costo**, solo naranja, bolsa incluida en todos los packs. CTAs: «COMPLETAR PEDIDO».
  Copy con promesa fuerte pero sin afirmaciones que Meta rechace (nada de cifras de carga ni de salud).
- Reseñas: la página **no trae reseñas inventadas**. Se agregan reseñas reales en el arreglo
  `RESENAS` (`{ nombre, fecha, texto, foto }`); mientras esté vacío la sección no se muestra.
- Especificaciones: la ficha original se contradice (240 W en las fotos, 140 W en el texto), por eso
  la página dice solo «carga rápida» y no cita vatios. Confirmar con el proveedor antes de citarlos.

## Diseño (2026-10-18, rehecho a pedido del dueño)

Calcado de la ficha original de beverlygoods, pero limpio y para Lima: galería + título + precio, packs
(1 · Dúo · Regalo), bolsa gratis, CTA «COMPLETAR PEDIDO», línea de entrega con fechas reales de Lima,
**«Míralo en acción» justo debajo**, beneficios, preguntas y cierre. Fondo blanco, texto negro y naranja solo
en el botón; formulario COD limpio con fotos de pack, selector de conector por cable, caja de envío y sellos.
Sin reseñas inventadas. En escritorio sale en dos columnas.

## Envío a provincia y marca (2026-10-18)

El formulario tiene las dos opciones del COD de Tarot: **Pago en casa (Lima)**, con distrito y dirección, y **Envío por agencia
(provincia)**, con ciudad/departamento y agencia de destino (Shalom/Olva), con **adelanto de S/ 10** y la diferencia al recoger
(`ADELANTO_PROVINCIA` en `src/lib/pedido-cable.js` y `var ADELANTO` en `index.html`; el chequeo exige que coincidan). La pestaña
«Cable» quedó con estas columnas: Fecha · Nombre · WhatsApp · Envío · Distrito / Ciudad · Dirección / Agencia · Pack · Detalle ·
Cantidad · Total · Adelanto · Estado · FBP · FBC · Event ID · User Agent · IP (la pestaña aún no existía, por eso se pudo reordenar).
Marca para el testeo: logo de **Puerto Secreto** (`img/logo.webp`) en círculo y badge «Vendedor autorizado» arriba del formulario
(como en el COD de Tarot); la cabecera de la página lleva el logo y el nombre, sin badge.

## Fotos y videos

Galería de 4: `principal.webp` (catálogo, ficha de Alpha Technology, Perú), `combinacion.webp` y `power-delivery.webp` (infografías originales de la
ficha con el texto **traducido al español** y sin cifras de vatios ni «80% en 30 min»), `naranja.webp` (catálogo). `bolsa.webp` es el fotograma
real de la bolsa en los videos. Se descartaron las fotos generadas con personas (se veían falsas); los videos están recortados para quitar los subtítulos en
inglés y sin audio (se ven mudos). Los videos solo se descargan al acercarse (`data-src`).
En el último tramo de los videos 2 y 3 aparece la bolsa con la marca del proveedor.
Si se cambia el contenido de un archivo hay que **renombrarlo** (`_headers` los cachea un año).

## Link para compartir

Ruta larga bajo el mismo dominio del Worker (`RUTA_LARGA_CABLE` en `src/lib/pedido-cable.js`; el Worker la sirve
como `/cable/` en `src/index.js`, y `/…/gracias` como la página de gracias):

`https://kit-tarot-para-principiantes.tarotperu.store/cable-de-carga-rapida-con-soporte-plegable-para-celular-usb-c-y-lightning-envio-gratis-a-lima-pago-contra-entrega`

Es la misma página que `/cable/`; el `<title>` también es largo y descriptivo. Se publica al hacer merge a `main`.

## Cambios del 2026-10-18 (tarde)

- Se quitó «¿Para qué celular?» del formulario: ya **no se pregunta el conector** (USB-C o Lightning). La vendedora lo confirma por WhatsApp
  y la columna «Detalle» de la pestaña Cable queda como «Conector por confirmar (WhatsApp)». El servidor aún acepta `cables` si algún día vuelve.
- El logo de Puerto Secreto ya **no está en la página**: solo en el formulario, con el badge «Vendedor autorizado».
- Se quitó el bloque de resumen del formulario (producto, precio, envío, total) y el botón «COMPLETAR PEDIDO» quedó **fijo al borde inferior** del formulario (siempre visible; `.btn-fijo`). El subtítulo del botón sigue diciendo «Pagas cuando lo recibes» o el adelanto de provincia.

## Versión 2 (2026-10-18): hero en video

`public/cable-v2/` es una copia de `public/cable/` (misma página, mismo endpoint, mismos precios; las fotos y videos de la v1 se siguen sirviendo desde `/cable/…`). La primera imagen de la galería es el video 3 de «Míralo en acción» (`/cable/video/en-accion-3.mp4`, 4:5, se reproduce solo, mudo y en bucle); la galería es 4:5 para no recortarlo. El GIF de la primera entrega (celular + bolsita de regalo, recortado a cuadrado) se descartó porque se cortaba feo: esa escena ahora es un video 4:5 sin recorte, `video/bolsa-regalo.mp4`, que ocupa el lugar del video 3 en «Míralo en acción» (con su pie «Se guarda en su bolsita de regalo…»). Si se cambia un video hay que renombrarlo (`_headers` lo cachea un año). Si se cambia un precio o un texto común, hacerlo en las dos versiones.

**2026-10-19: la bolsa de regalo se OCULTÓ** de `/cable/` y `/cable-v2/` (Juan avisó que no hay stock): bloque «GRATIS bolsa», video de la bolsa (v2), textos de packs, meta y línea de la gracias. Los archivos `bolsa.webp` y `bolsa-regalo.*` siguen en el repo para volver a mostrarla cuando haya stock.
