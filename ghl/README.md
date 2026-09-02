# Kit de Tarot — réplica para GHL

Este paquete tiene **1 solo archivo** para pegar en GoHighLevel:

- **`index.html`** → CSS + HTML + las preguntas del formulario (Nombres,
  WhatsApp, Método de Envío, Dirección/Agencia) + el order bump, todo
  autocontenido. No usa el Form Builder de GHL ni ningún iframe: el pedido
  se envía con un `fetch()` propio a un endpoint nuevo de **tu Worker de
  Cloudflare** (el mismo que ya tienes desplegado en producción), que habla
  directo con la API de GHL para dejar el pedido en Contacts/Pipeline.

Puedes abrir `index.html` directamente en tu navegador para verlo funcionar
antes de tocar GHL — usa nombres de archivo relativos como reserva mientras
no hayas pegado tus URLs reales.

(`form-custom.css` de versiones anteriores de este paquete ya no aplica —
era el CSS para el formulario del Form Builder, que este archivo ya no usa.
Bórralo si lo tenías guardado.)

## 1. Por qué esto pasó por 3 arquitecturas distintas

Pediste "todo en un solo HTML — CSS, HTML y las preguntas — para no tener
que hacer nada más". Eso y "usar el formulario nativo de GHL para tener
pipelines" son, en la práctica, dos cosas que **no pueden ser ciertas al
mismo tiempo**: el Form Builder de GHL SIEMPRE entrega su formulario como un
iframe a un dominio distinto (así lo diseñó GHL, no hay forma de "traer" el
HTML de sus campos hacia tu propio archivo) — por eso el "Cargando
formulario…" que viste en el primer intento: era el propio formulario de
GHL, en su iframe, tardando o fallando en pintar sus campos.

El siguiente intento fue **el formulario completo como HTML normal** dentro
de tu propia página, enviando el pedido a un **Webhook entrante** de un
Workflow de GHL — pero esa función resultó estar bloqueada en tu plan actual
("Funciones prémium… deshabilitada").

Lo que quedó, y es lo que tienes ahora: **el mismo HTML autocontenido**
(nada cambió ahí), pero el `fetch()` del pedido va a un **endpoint nuevo de
tu propio Worker de Cloudflare** — el mismo Worker que ya tienes corriendo
en producción hoy — y ese Worker es quien llama a la API de GHL directo
(crea/actualiza el Contact, deja una nota con el pedido y, si configuras un
Pipeline, la Opportunity). Sigue siendo GHL de verdad del otro lado — Contact,
notas, Pipeline — nada más que en vez de pasar por un Workflow con un
trigger que tu plan no tiene, pasa por una llamada a la API que si funciona
en cualquier plan (siempre que puedas crear un token de Private Integration
en tu cuenta — ver sección 5).

## 2. Decisiones de diseño que debes conocer

**Flujo restaurado a como era en tu web original.** Como ya no depende de
un iframe de otro dominio, se pudo restaurar el flujo exacto: al enviar el
pedido se abre un 2do modal (el "order bump" del mazo Rider Waite, con su
carrusel, cuenta regresiva y "SÍ AÑADIR / NO GRACIAS") mientras el pedido
viaja en paralelo por `fetch()`. Al cerrar ese 2do modal (aceptes o no el
bump), te redirige a WhatsApp con todo el pedido ya escrito en el mensaje.

**Si el envío falla** (sin internet, el Worker o GHL caídos), el lead no se
pierde: aparece un aviso ofreciendo mandarlo por WhatsApp igual, con todos
los datos ya escritos — igual que hacía tu web original.

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
pasarlos por ningún iframe ni campo oculto. El Worker los deja escritos en
la nota del Contact en GHL.

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

## 5. Cómo dejar funcionando el puente (tu Worker → API de GHL)

Esto se hace UNA vez, en el repositorio de tu Worker (el mismo que ya
despliega `kit-tarot-para-principiantes.tarotperu.store` hoy), no dentro de
GHL. Ya agregué el código; solo falta la configuración y el deploy.

**A) Consigue tus credenciales de GHL:**

1. En tu sub-cuenta de GHL: **Configuración > Private Integrations** (a
   veces aparece como "Integraciones privadas" o dentro de "Configuración >
   API"). Crea una nueva integración con estos permisos (scopes):
   `contacts.write`, `contacts.readonly`, y si vas a usar Pipeline también
   `opportunities.write`. Copia el token que te da — empieza con `pit-`.
2. Tu **Location ID**: en GHL, ve a **Configuración > Perfil de la empresa**
   (o mira la URL del navegador estando dentro de tu sub-cuenta — trae un
   segmento largo tipo `location/XXXXXXXXXXXXXXXXXXXX`). Cópialo.
3. *(Opcional, solo si quieres que el pedido cree una Opportunity en un
   Pipeline)*: el **Pipeline ID** y el **Stage ID** de la etapa donde deben
   caer los pedidos nuevos. Están en Configuración > Pipelines, o pídeme
   ayuda si no los encuentras a simple vista — se pueden sacar por API.

**B) Configura el Worker (en tu terminal, dentro del repo):**

```bash
npx wrangler secret put GHL_PRIVATE_TOKEN
# pega el token pit-... cuando te lo pida
```

Y en `wrangler.jsonc`, sección `vars` (ya están los campos, solo faltan los
valores):

```jsonc
"GHL_LOCATION_ID": "tu_location_id",
"GHL_PIPELINE_ID": "",        // opcional
"GHL_PIPELINE_STAGE_ID": ""   // opcional
```

**C) Despliega:**

```bash
npm run deploy
```

Con eso, `WEBHOOK_URL` en `ghl/index.html` (que ya apunta a
`https://kit-tarot-para-principiantes.tarotperu.store/api/ghl-lead`) queda
funcionando — no necesitas tocar esa variable salvo que cambies de dominio.

**Qué hace el Worker con cada pedido** (`src/api/ghl-lead.js`): valida los
datos igual que ya validaba `/api/order`, descarta bots por el honeypot,
aplica el mismo límite de 5 pedidos por minuto por IP, y llama a la API de
GHL para: crear o actualizar el Contact (por teléfono, así un cliente que
pide dos veces no genera un duplicado), dejarle una nota con el resumen
completo del pedido (producto, entrega, destino, total, fbclid/fbp/fbc), y
—si configuraste Pipeline/Stage— crear la Opportunity. También manda el
mismo aviso a tu Telegram que ya recibías con `/api/order`, si tienes
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` configurados.

Probé toda esta lógica con pruebas automatizadas (payload correcto, honeypot,
validación, límite por IP, CORS, y qué pasa si la API de GHL responde con
error) — lo único que NO pude probar es la llamada real a la API de GHL,
porque no tengo credenciales de tu cuenta. Si al probar un pedido real te
da error, mándame el mensaje que te devuelve y lo ajustamos — las APIs a
veces cambian de forma sutil entre versiones.

**Si más adelante consigues acceso a Workflows/Inbound Webhook** (upgrade de
plan, o soporte de GHL te lo habilita), no hace falta deshacer nada de esto:
simplemente podrías migrar `WEBHOOK_URL` a la URL de ese Webhook en vez de
tu Worker, si prefieres esa ruta.

## 6. Redirección a WhatsApp

Ya no depende de configurar nada en GHL: `index.html` arma el mensaje de
WhatsApp con los datos del pedido (nombre, producto, entrega, total) y
redirige solo — al `WHATSAPP_NUM` que está justo debajo de `WEBHOOK_URL` en
el `<script>`. Cambia ese número si hace falta.

## 7. Checklist antes de publicar

- [ ] Los 23 archivos de la tabla están subidos y sus URLs pegadas en `ASSETS_GHL`.
- [ ] `WHATSAPP_NUM` es tu número real.
- [ ] `GHL_PRIVATE_TOKEN` subido con `wrangler secret put`, y `GHL_LOCATION_ID`
      puesto en `wrangler.jsonc`.
- [ ] Corriste `npm run deploy`.
- [ ] Hiciste un pedido de prueba end-to-end: se abre el order bump, el
      Contact aparece en GHL con su nota (revisa en Contacts, búscalo por
      el teléfono de prueba), y WhatsApp se abre con el mensaje correcto.
- [ ] Si configuraste Pipeline: la Opportunity aparece en la etapa correcta.
- [ ] Abriste la página publicada en el celular y: el modal no se corta,
      nada se sale hacia los costados, el video del cuerpo carga al hacer
      scroll, la galería abre el visor de fotos.
