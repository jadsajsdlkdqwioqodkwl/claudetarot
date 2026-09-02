# Kit de Tarot — réplica para GHL

Este paquete tiene 2 archivos para pegar en GoHighLevel:

- **`index.html`** → el código de la página (hero, galería, video, reseñas, y
  el modal de pedido). Instrucciones completas de dónde pegar cada parte
  están en un comentario grande al principio del propio archivo.
- **`form-custom.css`** → el CSS que va en el **Custom CSS del Form Builder**
  de tu formulario de GHL (una pestaña distinta a la del CSS de la página).

Puedes abrir `index.html` directamente en tu navegador para verlo funcionar
antes de tocar GHL — usa nombres de archivo relativos como reserva mientras
no hayas pegado tus URLs reales.

## 1. Decisiones de diseño que debes conocer

**El video sí está incluido en el código.** Se carga solo (como en tu web
original) cuando el visitante se acerca a esa parte de la página. Si no
aparece, ya no falla en silencio: desde este ajuste, si el navegador no
puede reproducir la fuente (URL sin reemplazar, archivo no subido, formato
no soportado), la caja del video se reemplaza por un aviso visible tipo
"Video no disponible — revisa ASSETS_GHL.bodyVideo", igual que una imagen
rota muestra su icono en vez de desaparecer. Si lo ves así, es que falta
pegar la URL real en `ASSETS_GHL.bodyVideo` (o el archivo no se subió
todavía) — revisa el paso 2.

**El formulario real vive dentro de un iframe de GHL**, no son inputs
sueltos como en tu web original — por eso los deliverables son "el HTML" +
"el CSS del formulario", cada uno en su sitio.

**Captura de fbclid / \_fbp / \_fbc.** `index.html` ya lee estas 3 cookies/
parámetro por su cuenta (igual que hacía tu web original) y los manda pegados
a la URL del iframe del formulario, junto con variante y bump — no tienes que
tocar nada de eso. Lo único manual es crear los 3 campos ocultos que los
reciben dentro de tu formulario de GHL (tabla de la sección 4) y pegar el
script que los rellena; no puedo crear esos campos por ti porque vive dentro
de tu cuenta de GHL, a la que no tengo acceso.

**Arreglo de overflow con imágenes rotas.** Si una imagen no carga (URL sin
reemplazar, archivo no subido todavía), el navegador muestra su ícono +
texto ALT, y ese texto se comporta como texto normal dentro de una tarjeta
flex/grid — sin protección, empuja la tarjeta más ancha y la hace salirse
del modal (esto es lo que viste en tu captura: la tarjeta "2 Kits" se corría
hacia afuera). Ya está corregido en el CSS (`.vcard { min-width: 0 }` y
`.gal { grid-template-columns: repeat(4, minmax(0,1fr)) }`), así que ahora
ni con todas las imágenes rotas se sale nada del modal — lo probé a propósito
bloqueando todas las imágenes para confirmarlo.

**El "order bump" (mazo Rider Waite) ahora es una franja compacta DEBAJO del
iframe del formulario**, no un carrusel grande ni un 2do popup: una sola
miniatura, nombre, precio y un botón chico "+ Añadir". Va debajo del
formulario (no antes) a propósito. Por qué no es un popup después de
enviar: en tu web original, ese 2do popup aparecía *después* de que el
servidor confirmaba que el pedido se guardó. Con un formulario nativo de GHL
en iframe (dominio distinto al de tu página), no hay forma 100% confiable de
que la página madre sepa "ya se envió" para recién mostrar un popup nuevo —
apostar todo el flujo de conversión a eso es el tipo de cosa que se rompe a
medias. Por eso el cliente lo agrega ANTES de tocar "enviar", y ese "sí
quiero" viaja en el mismo envío (campo oculto `f-bump`). Si de todos modos
prefieres el popup-después-de-enviar, se puede armar con el `postMessage`
que ya dejé escuchando en el código (ver el comentario "Mejor esfuerzo"
dentro de `index.html`), pero no es 100% garantizado — depende de un mensaje
que GHL no documenta oficialmente.

**Los botones ahora son verdes (degradado tipo Shopify)**, no rojo/naranja:
`--cta1`/`--cta2` en el `:root` del CSS controlan ese degradé y se usan en
el CTA principal, el sticky CTA y el botón "+ Añadir" del bump; el botón
"REALIZAR PEDIDO" real (dentro del iframe) se pinta igual desde
`form-custom.css`. Si quieres otro tono de verde, esos son los únicos 3
lugares a tocar (los dos `--cta1`/`--cta2` de `index.html` y el
`linear-gradient` del botón submit en `form-custom.css`).

**Se quitó la sección "Lo que nuestros clientes dicen de nosotros"** (el
resumen 4.8 + reseñas verificadas con botones de "me gusta"). El carrusel
corto de 3 reseñas con foto que está más arriba, cerca del video, se queda
igual — solo se eliminó el bloque largo de abajo.

**La página de "gracias" ya no se usa.** El propio formulario de GHL
redirige a WhatsApp al enviarse (lo configuras tú en GHL, ver paso 4 más
abajo). No hace falta código para eso.

## 2. Imágenes y videos — nombres y dónde subirlos

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
| `kittarotcod/` | `foto2orderbumb.webp` | Miniatura del mazo Rider Waite (bump, debajo del form) | 56 KB |
| `kittarotcod/resenas/` | `r1.webp` | Foto reseña — Carla Rojas | 40 KB |
| `kittarotcod/resenas/` | `r2.webp` | Foto reseña — Lucía Mendoza | 36 KB |
| `kittarotcod/resenas/` | `r3.webp` | Foto reseña — Andrea Salas | 36 KB |
| `kittarotcod/galeria/` | `g1.webp` + `g1-mini.webp` | Galería foto 1 (grande + miniatura) | 164 KB / 28 KB |
| `kittarotcod/galeria/` | `g2.webp` + `g2-mini.webp` | Galería foto 2 | 108 KB / 28 KB |
| `kittarotcod/galeria/` | `g3.webp` + `g3-mini.webp` | Galería foto 3 | 124 KB / 36 KB |
| `kittarotcod/galeria/` | `g4.webp` + `g4-mini.webp` | Galería foto 4 | 112 KB / 32 KB |
| `kittarotcod/galeria/` | `g5.webp` + `g5-mini.webp` | Galería foto 5 | 52 KB / 12 KB |
| `kittarotcod/galeria/` | `g6.webp` + `g6-mini.webp` | Galería foto 6 | 140 KB / 36 KB |

Total: 21 archivos. Los favicons (`favicon-32.png`, `favicon-180.png`) no
están en la tabla porque el favicon se configura aparte, en Sitios >
Configuración, no dentro del HTML de la página. `orderbumpvideo1.mp4` y
`fotobump3.png` de tu carpeta original ya no se usan (el bump ahora es una
miniatura sola, no un carrusel) — no hace falta subirlos.

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

## 3. Cómo pegar `index.html` en GHL

1. Crea una página en blanco en Sitios (Sites) o en tu Funnel.
2. Borra las secciones vacías que trae por defecto.
3. Agrega un elemento **"Custom Code"** (o "Custom HTML/CSS/JS" según tu
   versión) que ocupe todo el ancho de la página.
4. Dentro de ese elemento, pega:
   - El `<style>...</style>` completo (todo el CSS).
   - Todo el `<body>` — desde `<div id="tarotKit">` (que envuelve el resto)
     hasta el cierre `</div><!-- /#tarotKit -->`.
   - El `<script src="https://link.msgsndr.com/js/form_embed.js"></script>`
     y el `<script>...</script>` grande con la lógica.
5. El Meta Pixel y Microsoft Clarity (te los dejé documentados en un
   comentario dentro del archivo) van mejor en **Sitios > Configuración >
   Tracking Code > Header**, para que carguen en todas las páginas del
   funnel, no solo en esta.

El `#tarotKit` que envuelve todo el HTML y prefija cada regla del CSS
(`#tarotKit .cta`, `#tarotKit .modal`, etc.) es a propósito: evita que los
estilos de tu página (`.card`, `.title`, `.wrap`...) choquen con clases que
ya use la plantilla de GHL en el resto del sitio.

## 4. Cómo armar el formulario nativo de GHL

En Sitios > Formularios, crea un formulario nuevo con estos campos, **en
este orden**, y el "CSS Class Name" (o "CSS ID", el nombre cambia según tu
versión de GHL, suele estar en la pestaña "Advanced" de cada campo) exacto
que se indica — es lo que hace que `form-custom.css` los reconozca:

| # | Campo | Tipo | CSS Class Name | Notas |
|---|---|---|---|---|
| 1 | Nombres | Texto corto | `f-nombre` | Placeholder: "Coloca tu nombre" |
| 2 | WhatsApp | Teléfono | `f-whatsapp` | Placeholder: "Coloca tu Whatsapp" |
| 3 | Método de Envío | Opción única (radio) | `f-envio` | Opción A: "Pago en Casa (Lima) — Gratis". Opción B: "Envío por Agencia (Provincia) — Gratis" |
| 4 | Dirección de Entrega | Texto corto | `f-direccion` | Lógica condicional: mostrar solo si Método de Envío = Opción A |
| 5 | Agencia de Destino | Texto corto | `f-agencia` | Lógica condicional: mostrar solo si Método de Envío = Opción B. Placeholder: "Ej: Shalom - Sede Centro" |
| 6 | Variante | Campo oculto (hidden) | `f-variante` | Se rellena solo (ver script más abajo) |
| 7 | Extra / Bump | Campo oculto (hidden) | `f-bump` | Se rellena solo |
| 8 | Facebook Click ID | Campo oculto (hidden) | `f-fbclid` | Se rellena solo |
| 9 | Facebook Browser ID | Campo oculto (hidden) | `f-fbp` | Se rellena solo |
| 10 | Facebook Click ID (cookie) | Campo oculto (hidden) | `f-fbc` | Se rellena solo |
| 11 | Botón enviar | — | `f-submit` | Texto: "REALIZAR PEDIDO" |

Sé honesto conmigo mismo aquí: crear estos campos DENTRO de tu formulario es
lo único que no puedo hacer por ti — no tengo acceso a tu cuenta de GHL, así
que ese paso (arrastrar el campo, ponerle el tipo y pegarle el nombre de
clase de la tabla) lo tienes que hacer tú, una vez, campo por campo. Lo que
sí puedo darte es UN solo script que resuelve TODO lo demás (el toggle
Lima/Provincia y el llenado automático de los 3 campos de Facebook) para que
no tengas que tocar más configuración aparte de crear los campos.

**Antes de nada — revisa si ya tienes esto sin código.** En tu cuenta de GHL,
ve a **Configuración (del sub-account) > Integraciones > Facebook/Meta Ads**.
Si la conectas ahí, GHL manda los eventos de conversión (Lead, Purchase) por
su propia integración de Conversions API del lado del servidor, sin que
tengas que capturar fbclid/fbp/fbc a mano. Es la opción "cero código" real.
Lo de abajo es para cuando quieres además el máximo de precisión en el
matching (fbclid/fbp/fbc a nivel de contacto) o esa integración nativa no
está disponible en tu plan.

**Un solo script para todo.** Arrastra UN elemento **"Custom HTML"** en
cualquier parte del formulario (no necesita espacio visual — funciona igual
esté al principio o al final) y pega esto una sola vez:

```html
<script>
(function () {
  // 1) Lima/Provincia: identifica la opción marcada por su TEXTO ("casa"),
  //    no por su posición, así que sigue funcionando si reordenas las
  //    opciones o cambias el texto exacto.
  function actualizarEnvio() {
    var marcado = document.querySelector('.f-envio input[type="radio"]:checked');
    if (!marcado) return;
    var etiqueta = marcado.closest('label');
    var texto = (etiqueta ? etiqueta.textContent : '').toLowerCase();
    var esCasa = texto.indexOf('casa') > -1;
    var dir = document.querySelector('.f-direccion');
    var ag = document.querySelector('.f-agencia');
    if (dir) dir.style.display = esCasa ? '' : 'none';
    if (ag) ag.style.display = esCasa ? 'none' : '';
  }
  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('.f-envio input[type="radio"]')) actualizarEnvio();
  });

  // 2) Rellena los campos ocultos desde la URL del propio iframe. La página
  //    madre (index.html) ya arma esa URL con ?variante=..&bump=..
  //    &fbclid=..&fbp=..&fbc=.. cada vez que abre o actualiza el formulario
  //    — este script solo copia esos valores a los inputs ocultos.
  function llenarOcultos() {
    var q = new URLSearchParams(location.search);
    ['variante', 'bump', 'fbclid', 'fbp', 'fbc'].forEach(function (clave) {
      var campo = document.querySelector('.f-' + clave);
      if (campo && q.get(clave)) campo.value = q.get(clave);
    });
  }

  function iniciar() { actualizarEnvio(); llenarOcultos(); }
  document.addEventListener('DOMContentLoaded', iniciar);
  setTimeout(iniciar, 300); // red de seguridad si el formulario tarda en pintar
})();
</script>
```

Este mismo script reemplaza al que te pasé antes (ya incluye el toggle) —
solo necesitas UNO, no los dos.

**Opción 3 — usar una Survey en vez de un Form.** Las Surveys de GHL están
pensadas justo para "la pregunta 2 cambia según la respuesta de la pregunta
1" con una lógica condicional visual, sin código. También disparan
Workflows (trigger "Survey Submitted") y también pueden mover Contacts por
Pipelines — es igual de nativo que un Form, solo que el constructor es
distinto. Si prefieres armarlo así en vez de con el script de la Opción 2,
dímelo y actualizo el HTML para que el iframe cargue tu Survey en vez de tu
Form (el embed y la sincronización de variante/bump funcionan igual).

**Campos ocultos con valor desde la URL**: en la configuración de un campo
"Hidden", GHL tiene una opción para rellenarlo automáticamente con un
parámetro de la URL del formulario (busca algo como "Fill with URL
parameter" / "Default value from query param"). Ponle `variante` al campo 6
y `bump` al campo 7 — esos son los nombres que `index.html` ya usa cuando
arma la URL del iframe (`?variante=1kit&bump=riderwaite`).

**Acción al enviar** (esto reemplaza a la página de "gracias"): en las
Acciones/Settings del formulario, elige **"Redirigir a URL"**, pega tu
enlace de WhatsApp:

```
https://wa.me/51928529656?text=Hola!%20Acabo%20de%20hacer%20mi%20pedido%20del%20Kit%20de%20Tarot%20y%20quiero%20confirmarlo
```

y activa la opción de **abrir en pestaña nueva** (suele llamarse "Open in
new tab" / "Abrir en una nueva ventana"). Esto es importante: así WhatsApp
se abre en una pestaña aparte y tu página con el modal se queda cargada
detrás, en vez de navegar "hacia adentro" del iframe.

Después de crear el formulario, copia su **código de inserción (Embed
code)** — GHL te da un `<iframe src="https://api.leadconnectorhq.com/widget/form/xxxxxxxxx" ...>` —
y en `index.html` reemplaza `TU_FORM_ID` en la variable `GHL_FORM_SRC` (cerca
del inicio del `<script>`) por esa URL completa.

Por último, pega todo el contenido de `form-custom.css` en la pestaña
**Styles / Custom CSS** del propio formulario (no en el CSS de la página).

## 5. Checklist antes de publicar

- [ ] Los 21 archivos de la tabla están subidos y sus URLs pegadas en `ASSETS_GHL`.
- [ ] `GHL_FORM_SRC` apunta a tu formulario real (ya no dice `TU_FORM_ID`).
- [ ] El formulario tiene los 11 campos con sus `CSS Class Name` exactos.
- [ ] Pegaste el script "Un solo script para todo" (sección 4) en un bloque
      Custom HTML dentro del formulario.
- [ ] El Meta Pixel está cargado en la página (Tracking Code > Header) — sin
      él, `_fbp`/`_fbc` nunca se escriben y esos 2 campos llegan vacíos.
- [ ] La lógica condicional de Dirección/Agencia funciona (pruébalo dentro
      del formulario directamente en GHL antes de embeberlo).
- [ ] La acción de envío redirige a tu WhatsApp con "abrir en pestaña nueva".
- [ ] `form-custom.css` está pegado en el Custom CSS del formulario.
- [ ] Abriste la página publicada en el celular y: el modal no se corta, el
      formulario no se sale hacia los costados, el video del cuerpo carga al
      hacer scroll, la galería abre el visor de fotos.
