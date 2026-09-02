# Kit de Tarot — réplica para GHL

Este paquete tiene **1 solo archivo** para pegar en GoHighLevel:

- **`index.html`** → CSS + HTML + las preguntas del formulario (Nombres,
  WhatsApp, Método de Envío, Dirección/Agencia) + el order bump, todo
  autocontenido. No usa el Form Builder de GHL ni ningún iframe: el pedido
  se envía con un `fetch()` propio a un **Webhook de GHL**, que es lo que
  conecta esto con tus Pipelines y Workflows.

Puedes abrir `index.html` directamente en tu navegador para verlo funcionar
antes de tocar GHL — usa nombres de archivo relativos como reserva mientras
no hayas pegado tus URLs reales.

(`form-custom.css` de versiones anteriores de este paquete ya no aplica —
era el CSS para el formulario del Form Builder, que este archivo ya no usa.
Bórralo si lo tenías guardado.)

## 1. Por qué cambió de un iframe de GHL a un Webhook

Pediste "todo en un solo HTML — CSS, HTML y las preguntas — para no tener
que hacer nada más". Eso y "usar el formulario nativo de GHL para tener
pipelines" son, en la práctica, dos cosas que **no pueden ser ciertas al
mismo tiempo**: el Form Builder de GHL SIEMPRE entrega su formulario como un
iframe a un dominio distinto (así lo diseñó GHL, no hay forma de "traer" el
HTML de sus campos hacia tu propio archivo) — por eso el "Cargando
formulario…" que viste: es el propio formulario de GHL, en su iframe,
tardando o fallando en pintar sus campos, algo que yo no puedo depurar
porque vive dentro de tu cuenta.

La solución: **el formulario completo (preguntas, estilos, lógica del
toggle Lima/Provincia) ahora es HTML normal dentro de tu propia página**, y
al enviarse hace un `POST` directo a un **Webhook** de GHL — un tipo de
disparador de Workflow hecho justo para recibir datos desde fuera de GHL
(exactamente tu caso). Sigue siendo 100% nativo de GHL: el Workflow que
recibe el webhook puede crear/actualizar el Contact, meterlo a un Pipeline,
mandar notificaciones, etc. — todo lo que un formulario disparaba, lo
dispara un webhook igual. Lo único que cambia es que tú no ves un campo
"CSS Class Name" que configurar por cada pregunta: las preguntas ya están
resueltas en el HTML.

## 2. Decisiones de diseño que debes conocer

**Flujo restaurado a como era en tu web original.** Como ya no depende de
un iframe de otro dominio, se pudo restaurar el flujo exacto: al enviar el
pedido se abre un 2do modal (el "order bump" del mazo Rider Waite, con su
carrusel, cuenta regresiva y "SÍ AÑADIR / NO GRACIAS") mientras el pedido
viaja en paralelo por `fetch()`. Al cerrar ese 2do modal (aceptes o no el
bump), te redirige a WhatsApp con todo el pedido ya escrito en el mensaje.

**Si el webhook falla** (sin internet, GHL caído, URL mal pegada), el lead
no se pierde: aparece un aviso ofreciendo mandarlo por WhatsApp igual, con
todos los datos ya escritos — igual que hacía tu web original.

**El video sí está incluido en el código.** Se carga solo cuando el
visitante se acerca a esa parte de la página. Si no aparece, ya no falla en
silencio: si el navegador no puede reproducir la fuente (URL sin
reemplazar, archivo no subido, formato no soportado), la caja del video se
reemplaza por un aviso visible tipo "Video no disponible — revisa
ASSETS_GHL.bodyVideo", igual que una imagen rota muestra su ícono en vez de
desaparecer.

**Arreglo de overflow con imágenes rotas.** Si una imagen no carga, su
texto ALT se comporta como texto normal dentro de las tarjetas flex/grid, y
sin protección empuja la tarjeta más ancha que el modal. Ya está corregido
en el CSS (`.vcard { min-width: 0 }` y `.gal { grid-template-columns:
repeat(4, minmax(0,1fr)) }`) — verificado con Playwright bloqueando todas
las imágenes a propósito, incluso así no se sale nada del modal.

**fbclid / \_fbp / \_fbc.** Van dentro del mismo `fetch()` que manda todo lo
demás (nombre, teléfono, producto, etc.) — un solo payload, sin necesidad de
pasarlos por ningún iframe ni campo oculto. Tu Workflow los recibe como
cualquier otro dato del webhook.

**Botones verdes** (degradado tipo Shopify: `--cta1`/`--cta2` en el `:root`
del CSS). Si quieres otro tono, ese es el único lugar a tocar.

**Se quitó la sección "Lo que nuestros clientes dicen de nosotros"** (stats
+ reseñas verificadas con botones de "me gusta"), a pedido. El carrusel
corto de 3 reseñas junto al video se mantiene.

## 3. Imágenes y videos — nombres y dónde subirlos

Sube todo a **Sitios (o Media Storage) > Archivos** en tu cuenta de GHL.
Puedes crear carpetas para organizarte (no afecta la URL final, es solo para
que no te pierdas):

| Carpeta sugerida | Archivo | Usado en | Peso aprox. |
|---|---|---|---|
| `kittarotcod/` | `1.webp` | Banner principal (portada vertical) | 240 KB |
| `kittarotcod/` | `2.mp4` | Video del cuerpo de la página | 1.8 MB |
| `kittarotcod/` | `logo.webp` | Logo circular arriba del formulario | 24 KB |
| `kittarotcod/` | `kit-variante.webp` | Foto del kit (tarjetas de variante) | 32 KB |
| `kittarotcod/` | `badges.webp` | Sellos de confianza (debajo del form) | 88 KB |
| `kittarotcod/` | `orderbumpvideo1.mp4` | Video del mazo Rider Waite (order bump) | 3.6 MB |
| `kittarotcod/` | `foto2orderbumb.webp` | Foto 2 del mazo Rider Waite (order bump) | 56 KB |
| `kittarotcod/` | `fotobump3.png` | Foto 3 del mazo Rider Waite (order bump) | 92 KB |
| `kittarotcod/resenas/` | `r1.webp` | Foto reseña — Carla Rojas | 40 KB |
| `kittarotcod/resenas/` | `r2.webp` | Foto reseña — Lucía Mendoza | 36 KB |
| `kittarotcod/resenas/` | `r3.webp` | Foto reseña — Andrea Salas | 36 KB |
| `kittarotcod/galeria/` | `g1.webp` + `g1-mini.webp` | Galería foto 1 (grande + miniatura) | 164 KB / 28 KB |
| `kittarotcod/galeria/` | `g2.webp` + `g2-mini.webp` | Galería foto 2 | 108 KB / 28 KB |
| `kittarotcod/galeria/` | `g3.webp` + `g3-mini.webp` | Galería foto 3 | 124 KB / 36 KB |
| `kittarotcod/galeria/` | `g4.webp` + `g4-mini.webp` | Galería foto 4 | 112 KB / 32 KB |
| `kittarotcod/galeria/` | `g5.webp` + `g5-mini.webp` | Galería foto 5 | 52 KB / 12 KB |
| `kittarotcod/galeria/` | `g6.webp` + `g6-mini.webp` | Galería foto 6 | 140 KB / 36 KB |

Total: 23 archivos. Los favicons (`favicon-32.png`, `favicon-180.png`) no
están en la tabla porque el favicon se configura aparte, en Sitios >
Configuración, no dentro del HTML de la página.

### Cómo conectarlos

Después de subir cada archivo, GHL te da una URL pública (algo como
`https://storage.googleapis.com/msgsndr/.../media/xxxxxxxx.webp`). Abre
`index.html`, busca el bloque que dice:

```js
var ASSETS_GHL = {
  hero: '',
  logo: '',
  ...
```

y pega cada URL en su clave correspondiente (`hero` = `1.webp`, `logo` =
`logo.webp`, `g1` / `g1mini` = la galería, etc. — el nombre de cada clave ya
te dice qué archivo es). Es el único lugar del código donde tocas rutas de
imágenes.

## 4. Cómo pegar `index.html` en GHL

1. Crea una página en blanco en Sitios (Sites) o en tu Funnel.
2. Borra las secciones vacías que trae por defecto.
3. Agrega un elemento **"Custom Code"** (o "Custom HTML/CSS/JS" según tu
   versión) que ocupe todo el ancho de la página.
4. Dentro de ese elemento, pega:
   - El `<style>...</style>` completo (todo el CSS).
   - Todo el `<body>` — desde `<div id="tarotKit">` (que envuelve el resto)
     hasta el cierre `</div><!-- /#tarotKit -->`.
   - El `<script>...</script>` grande con toda la lógica (carrusel,
     galería, modales, envío del pedido, Pixel).
5. El Meta Pixel y Microsoft Clarity van mejor en **Sitios > Configuración >
   Tracking Code > Header**, para que carguen en todas las páginas del
   funnel, no solo en esta.

El `#tarotKit` que envuelve todo el HTML y prefija cada regla del CSS
(`#tarotKit .cta`, `#tarotKit .modal`, etc.) es a propósito: evita que los
estilos de tu página choquen con clases que ya use la plantilla de GHL en
el resto del sitio.

## 5. Cómo conectar tu Webhook (Pipelines y Workflows)

1. En GHL: **Automatización > Workflows > + Nuevo Workflow**.
2. Como disparador (Trigger), elige **"Inbound Webhook"**. GHL te muestra
   una URL única — cópiala.
3. En `index.html`, busca la variable `WEBHOOK_URL` (cerca del inicio del
   `<script>`, sección "2) TU WEBHOOK Y TU WHATSAPP") y pégala ahí.
4. Envía un pedido de prueba desde el archivo abierto en tu navegador (con
   `WEBHOOK_URL` ya puesta). En el Workflow, GHL te deja ver el "payload"
   de ese envío de prueba — con eso arma el mapeo del siguiente paso.
5. Agrega acciones al Workflow, por ejemplo:
   - **"Create/Update Contact"**: mapea `nombre` → nombre del contacto,
     `telefono` → teléfono, y el resto (`producto`, `envio`, `direccion`,
     `agencia`, `bump`, `total`, `fbclid`, `fbp`, `fbc`) → Custom Fields
     que crees para cada uno.
   - **"Create Opportunity"** (o el disparador automático de tu Pipeline al
     crear/actualizar un Contact): para que el pedido entre a tu Pipeline
     de ventas.
   - Cualquier otra automatización que ya uses (notificación a Slack/
     Telegram, tags, etc.) — se agrega igual que con cualquier otro
     trigger.

Los campos que manda el `fetch()` en cada pedido son:

| Campo | Qué es |
|---|---|
| `nombre` | Nombre del cliente |
| `telefono` | WhatsApp en formato 51XXXXXXXXX |
| `envio` | `casa` o `agencia` |
| `direccion` | Dirección (si envío = casa) |
| `agencia` | Agencia de destino (si envío = agencia) |
| `variante` | `1kit` o `2kit` |
| `producto` | Nombre legible de la variante |
| `precio_variante` | Precio de esa variante, en soles |
| `bump` | `riderwaite` si aceptó el extra, si no vacío |
| `total` | Precio variante + bump (si lo aceptó) |
| `moneda` | `PEN` |
| `website` | Trampa anti-bots — si viene con texto, es un bot; tu Workflow puede filtrar por esto |
| `fbclid`, `fbp`, `fbc` | Identificadores de Meta Ads para matching/CAPI |
| `pagina` | URL desde la que se hizo el pedido |

**Nota sobre CORS**: los Webhooks de GHL están hechos para recibir datos
desde fuera de GHL (integraciones, Zapier, tu propia web), así que aceptan
peticiones `POST` de otros orígenes sin problema — no deberías necesitar
nada especial de tu lado. Si alguna vez ves un error de CORS en la consola
del navegador, avísame y lo resolvemos con un pequeño cambio (mandar el
`fetch` con `mode: 'no-cors'`, al costo de no poder leer la respuesta).

## 6. Redirección a WhatsApp

Ya no depende de configurar nada en GHL: `index.html` arma el mensaje de
WhatsApp con los datos del pedido (nombre, producto, entrega, total) y
redirige solo — al `WHATSAPP_NUM` que está justo debajo de `WEBHOOK_URL` en
el `<script>`. Cambia ese número si hace falta.

## 7. Checklist antes de publicar

- [ ] Los 23 archivos de la tabla están subidos y sus URLs pegadas en `ASSETS_GHL`.
- [ ] `WEBHOOK_URL` apunta a tu Workflow real (ya no dice `TU_WEBHOOK_ID`).
- [ ] `WHATSAPP_NUM` es tu número real.
- [ ] El Workflow tiene al menos "Create/Update Contact" y algo que lo
      meta a tu Pipeline.
- [ ] Hiciste un pedido de prueba end-to-end: se abre el order bump, llega
      el registro al Workflow (revísalo en GHL, pestaña de ejecuciones), y
      WhatsApp se abre con el mensaje correcto.
- [ ] Abriste la página publicada en el celular y: el modal no se corta,
      nada se sale hacia los costados, el video del cuerpo carga al hacer
      scroll, la galería abre el visor de fotos.
