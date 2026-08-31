# Plantilla nativa GHL — Landing COD estilo Shopify

Guía para reconstruir la landing de `public/index.html` (Kit de Tarot) **100% con
elementos nativos de GoHighLevel**, para un producto nuevo con pago contraentrega,
sin pegar el HTML como bloque de código. Al terminar, cualquier persona no técnica
duplica la página y edita textos, fotos y precios solo con el editor visual.

Producto usado como ejemplo en toda la guía (edítalo por el real apenas dupliques):

> **Billetera Antirrobo de Viaje** — cartera oculta que se enfila en el cinturón,
> guarda efectivo, tarjetas y monedas fuera de la vista.

Precios pedidos:

| Variante | Precio | "Antes" sugerido (edítalo) |
|---|---|---|
| 1 unidad | S/ 79 | S/ 99 |
| 2 unidades | S/ 119 | S/ 198 |
| 3 unidades | S/ 149 | S/ 297 |

Los "antes" son un placeholder razonable para mostrar descuento — cámbialos por tus
cifras reales o bórralos si no quieres precio tachado.

## Qué hay en esta carpeta

| Archivo | Dónde va |
|---|---|
| `README.md` | Esta guía — el mapeo completo, paso a paso |
| `custom.css` | Pega TODO el archivo en **Settings → Custom CSS** de tu Funnel |
| `footer.js` | Pega TODO el archivo en **Settings → Tracking Code → Footer Code** |

**Índice**

0. [Conceptos base del editor de GHL — léelo antes de arrastrar nada](#0-conceptos-base-del-editor-de-ghl--léelo-antes-de-arrastrar-nada)
1. [Decisiones de alcance](#1-decisiones-de-alcance-para-que-no-haya-sorpresas)
2. [Crear el Funnel](#2-crear-el-funnel)
3. [Ajustes de la página antes de arrastrar nada](#3-ajustes-de-la-página-antes-de-arrastrar-nada)
4. [Árbol completo de la página](#4-árbol-completo-del-step-landing)
5. [Mapeo sección por sección](#5-mapeo-sección-por-sección--step-landing)
6. [Meta Pixel / tracking](#6-meta-pixel--tracking-nativo-no-lo-escribas-a-mano)
7. [El Popup nativo — Formulario COD](#7-el-popup-nativo--formulario-cod)
8. [Step "Gracias"](#8-step-gracias)
9. [Checklist de verificación visual](#9-checklist-de-verificación-visual)
10. [Extensiones opcionales](#10-extensiones-opcionales)

---

## 0. Conceptos base del editor de GHL — léelo antes de arrastrar nada

Todo lo que sigue asume que entiendes 5 cosas. Tómate 3 minutos: si te las
saltas, cada paso de la sección 5 se va a sentir tan confuso como te pasó con
la fila de estrellas.

### 0.1 La jerarquía: Section → Row → Column → Elemento

En el editor de GHL **nunca escribes texto directamente sobre una Row ni sobre
una Section.** Esos dos son **contenedores puros** — solo organizan espacio en
la pantalla, como una caja vacía. El texto, las imágenes, los botones y los
videos son **Elementos**, y siempre se arrastran DENTRO de una columna, no
sobre la fila en sí.

```
Section   (una franja horizontal completa de la página, borde a borde)
 └─ Row    (una fila dentro de esa Section; se divide en 1, 2, 3... columnas)
     └─ Column  (cada columna de la Row — normalmente invisible, solo organiza)
         └─ Elemento   (Headline, Text, Image, Button, Video, Form...
                         ESTO es lo único que editas con doble clic)
```

Cuando en las tablas de la sección 5 ves algo así:

| Elemento GHL | Custom Class |
|---|---|
| Row (2 columnas) | `lp-rating-row` |
| ↳ Text: `★★★★★` | `lp-rating-stars` |

Significa, en orden:

1. Arrastra desde el panel de Elements una **Row de 2 columnas** al lienzo.
   Esto es un contenedor — **no tiene ningún texto propio que editar**, por
   eso al hacer doble clic sobre la fila vacía no pasaba nada. Eso es correcto,
   no estaba roto.
2. Con la Row seleccionada, ponle la Custom Class `lp-rating-row` (ver 0.2 para
   dónde exactamente).
3. Ahora arrastra un elemento **Text** desde el panel de Elements y suéltalo
   **dentro de la primera columna** de esa Row (vas a ver la columna
   resaltarse en azul/verde cuando el elemento está por caer en el lugar
   correcto).
4. Haz doble clic sobre ESE Text (el que acabas de soltar, no la Row) para
   entrar en modo edición, borra el texto de ejemplo ("Add your text here" o
   similar) y escribe `★★★★★`.
5. Con ese Text seleccionado (un solo clic, ya sin estar editando), ponle la
   Custom Class `lp-rating-stars`.
6. Repite 3-4 para un segundo Text dentro de la segunda columna, con el texto
   `(4.9/5) en +1286 Reseñas` y la clase `lp-rating-count`.

Cada línea con el símbolo `↳` en las tablas de esta guía es un **Elemento que
va DENTRO** del contenedor de la línea de arriba — nunca al mismo nivel, nunca
"al lado". Si ves dos `↳` seguidas con la misma sangría, van una al lado de la
otra dentro del mismo contenedor (por ejemplo, en columnas distintas de la
misma Row).

### 0.2 Cómo ponerle una Custom Class a cualquier elemento (siempre el mismo camino)

1. Haz **un solo clic** (no doble clic) sobre el elemento/fila/sección para
   seleccionarlo. Se le dibuja un borde de color alrededor y se abre un panel
   — según tu versión de GHL, ese panel aparece flotando junto al elemento, o
   fijo en un costado de la pantalla.
2. En ese panel busca la pestaña **Advanced** (a veces es un ícono de
   engranaje ⚙, a veces dice literalmente "Advanced" junto a "Settings" /
   "Style" / "Actions").
3. Dentro de Advanced hay un campo llamado **CSS Class** o **Custom Class**.
   Escribe ahí el nombre exacto de la guía (por ejemplo `lp-rating-row`), tal
   cual, sin el punto inicial y sin espacios de más, y presiona `Enter` o haz
   clic fuera del campo para que quede guardado.
4. Si un elemento necesita **dos clases** (por ejemplo `lp-cta-btn
   lp-cta-buzz`), escríbelas ambas en la misma caja de texto, separadas por un
   espacio — es un solo campo, no dos.
5. Este mismo camino (clic → pestaña Advanced → campo Custom Class) sirve para
   Sections, Rows, Columns, cualquier Elemento (Text, Image, Button, Video,
   Form) **y también para cada Campo individual dentro de un Form** — cuando
   la guía dice "Custom Class del campo", es este mismo paso pero hecho sobre
   ese campo del formulario en particular, no sobre el Form completo.

### 0.3 Por qué el tamaño de letra "no se ajusta solo" — y por qué está bien así

Vas a notar que, apenas escribes un texto, se ve con la tipografía/tamaño/color
por defecto de tu tema de GHL — chico, negro, sin nada especial. **Es
esperado**, no significa que algo esté mal configurado.

Todo el tamaño de letra, color, espaciado, sombras, bordes redondeados y
degradados de este diseño vive en un solo archivo: `custom.css`. Ese bloque se
pega una sola vez (Settings → Custom CSS, sección 2) y aplica a **toda la
página de golpe**, usando `!important` a propósito, para que no tengas que
entrar elemento por elemento a subir el tamaño de fuente a mano desde el panel
visual de GHL.

Es decir, mientras arrastras y llenas de texto la página (sección 5), tu único
trabajo es:

1. Poner el tipo de elemento correcto (Text, Headline, Image, Button...).
2. Escribir el contenido correcto.
3. Ponerle la Custom Class correcta (0.2).

**No pierdas tiempo ajustando fuente, color, negrita o espaciado a mano desde
el panel de estilo de cada elemento** — el CSS lo va a pisar de todas formas.

Recomendación práctica: pega el bloque completo de `custom.css` **desde el
principio**, apenas termines la sección 2, no al final. Así, cada bloque que
arrastres va tomando su forma final (estrellas doradas, precio grande,
tarjetas con sombra, botón con degradado) apenas le pones la clase correcta —
en vez de armar toda la página "a ciegas" con letra de sistema y recién ver el
resultado real al final, que es mucho más difícil de depurar si algo no
calzó.

### 0.4 El contenedor `lp-page`: qué va "adentro" y qué va "suelto"

Todo el Step `Landing`, de arriba a abajo, es **una sola Section grande** con
la Custom Class `lp-page`. Absolutamente todo lo de la sección 5 (banner,
rating, título, precio, CTAs, reseñas, video, galería, footer legal) va
**anidado dentro de esa única Section** — son Rows, una debajo de otra, todas
metidas dentro de la misma `lp-page`. `lp-page` es el equivalente al `.wrap`
del diseño original: es lo que dibuja la "tarjeta" blanca centrada de 480px de
ancho sobre el fondo gris.

Solo **dos cosas** van fuera de `lp-page`, como hermanas de esa Section (al
mismo nivel del Step, no metidas adentro):

- El **Popup** del formulario (sección 7). Los Popups en GHL siempre viven
  "flotando" fuera del flujo normal de la página, sin importar en qué parte
  del lienzo los sueltes al crearlos — no te compliques intentando arrastrarlo
  dentro de `lp-page`, es indiferente.
- La **Section del sticky CTA** (`lp-sticky-wrap`, sección 5.14). Va como su
  propia Section, al final del Step, fuera de `lp-page`, porque necesita
  quedar fija en pantalla sin importar cuánto scrollees el resto del
  contenido.

Ver el árbol completo en la sección 4 — con eso delante, cada tabla de la
sección 5 te dice exactamente qué arrastrar y en qué rama va.

### 0.5 Imágenes "que no se ponen a todo su tamaño"

Cuando subes una foto a un elemento **Image** y se ve más chica de lo
esperado, recortada raro, o con espacio en blanco a los costados, casi siempre
es una de estas tres cosas — revísalas en este orden:

1. **La Column que envuelve la imagen tiene padding lateral.** Haz clic sobre
   la Column (no sobre la imagen — puede que tengas que hacer clic una vez
   sobre la imagen y luego usar el "breadcrumb"/selector de padres que GHL
   suele mostrar arriba del panel, tipo `Section > Row > Column > Image`, para
   subir un nivel y seleccionar la Column). En su pestaña Style/Settings, baja
   el "Padding" izquierdo y derecho a `0` si quieres que la foto toque los
   bordes de la tarjeta (esto es justo lo que necesitas para el banner
   principal, `lp-banner`, que debe ir de borde a borde).
2. **El ancho del elemento Image está fijo en píxeles en vez de 100%.** En el
   panel del elemento Image (pestaña Settings/Style), busca el campo "Width" y
   ponlo en `100%` — o elige la opción "Full Width" si tu builder la ofrece en
   vez de un número.
3. **El "Image Fit" no es el que necesitas.** El mismo panel del Image suele
   traer una opción tipo "Object Fit" / "Image Display", con valores como
   `Cover`, `Contain`, `Fill`, `Actual Size`:
   - `Cover`: llena todo el espacio disponible, recortando lo que sobre.
     Úsalo para el banner principal y las miniaturas cuadradas de la galería.
   - `Contain`: muestra la imagen completa sin recortar, puede dejar franjas
     vacías si la proporción no calza. Úsalo para el logo circular del modal.

`custom.css` ya trae una regla de respaldo (`.lp-banner img { width:100%;
height:auto }`) pero esa regla **no puede arreglar el padding de la Column ni
forzar el "Image Fit"** del panel nativo de GHL — esos dos ajustes los tienes
que hacer tú, a mano, una sola vez por imagen, desde el panel visual descrito
arriba.

---

## 1. Decisiones de alcance (para que no haya sorpresas)

- **Estructura**: un Funnel de GHL con 2 Steps — `Landing` (la página producto) y
  `Gracias` (confirmación). Un Funnel te da estadísticas por paso, que un Website
  normal no separa igual de bien para un embudo de una sola oferta.
- **El popup del formulario COD es un Popup nativo de verdad**, no una sección que
  se muestra/oculta con CSS: se abre con la acción nativa "Abrir Popup" de los
  botones. Igual el sticky CTA: es sticky nativo, no un `position:fixed` disfrazado
  (el CSS trae ese fallback solo por si tu cuenta no tiene el toggle nativo).
- **Sin order bump / upsell.** El pedido de precios que diste es solo el producto
  principal en 3 tramos, así que esta guía no arma el segundo popup de "¿quieres
  añadir X?". La sección 10 explica cómo añadirlo después, reusando exactamente el
  mismo patrón de Popup.
- **La página de Gracias queda como confirmación estática**, tal como autorizaste:
  tilde verde, mensaje, resumen breve, contador de urgencia decorativo y botón de
  WhatsApp. No depende de ningún backend externo — nada que romper.
- **Backend, automatizaciones, Sheets, notificaciones**: eso lo resuelves tú desde
  GHL (Workflows, integraciones). Esta guía se detiene en "el formulario nativo
  queda armado y dispara el submit"; a partir de ahí conectas tu automatización.
- **Convención de clases**: todo lleva el prefijo `lp-` (landing page). Están
  definidas en `custom.css`. No inventes nombres nuevos sin agregarlos también ahí.

## 2. Crear el Funnel

1. **Sites → Funnels → + New Funnel** (o "Funnels" en el menú de tu subcuenta).
2. Nómbralo, por ejemplo, `Billetera Antirrobo COD`.
3. Elige una plantilla en blanco ("Blank" / "Start from scratch").
4. Dentro del Funnel se crea el Step 1 automáticamente — renómbralo a `Landing`.
5. Agrega un segundo Step: **+ Add New Step → Blank** → renómbralo `Gracias`, con
   Path `/gracias`.
6. **Funnel Settings → Domain**: conecta tu dominio si ya lo tienes agregado en
   Settings → Domains.
7. **Funnel Settings → Tracking Code → Footer Code**: pega el contenido completo
   de `footer.js`. (Si prefieres que el contador de Gracias no corra en Landing,
   pégalo en el Footer Code del Step `Gracias` en vez del Funnel entero — ambos
   scripts ya se auto-desactivan solos si no encuentran su elemento, así que
   pegarlo a nivel Funnel también es seguro).
8. **Funnel Settings → Custom CSS**: pega el contenido completo de `custom.css`.
   (Si tu versión de GHL no tiene Custom CSS a nivel Funnel, ponlo en cada Step:
   **Step Settings → Custom CSS**, uno por página). Hazlo ahora, antes de armar
   nada más — ver el porqué en 0.3.

## 3. Ajustes de la página antes de arrastrar nada

1. Abre el editor visual del Step `Landing`.
2. Arrastra una **Section** vacía como primer bloque de la página (será el
   contenedor de todo).
3. Selecciónala (un clic) → Advanced → Custom Class → escribe `lp-page` (ver
   0.2 si no encuentras el campo).
4. Con la misma Section seleccionada, ve a su pestaña **Style/Settings** →
   **Background Color** → déjalo transparente o blanco (el gris de fondo
   `#f2f2f4` alrededor de la tarjeta ya lo pone `custom.css` sobre el `body`
   de toda la página, no hace falta que lo repitas aquí).
5. **Fuentes**: agrega la Google Font "Inter" (pesos 400/500/600/700/800/900).
   La mayoría de builders de GHL te dejan buscar cualquier Google Font desde
   el propio selector de fuente del primer Headline/Text que agregues, o
   desde Settings → Website → Fonts si tu cuenta lo tiene separado. No es
   obligatorio para que el diseño "funcione" (`custom.css` ya declara Inter
   con fallback a fuentes de sistema), pero se ve más fiel al original si la
   cargas.

A partir de aquí, todo lo que agregues en la sección 5 va **dentro** de esta
Section `lp-page` (repasa 0.4 si tienes dudas de qué va adentro y qué no).

## 4. Árbol completo del Step "Landing"

Antes de seguir, mira este árbol completo una vez. Te sirve como mapa: cada
tabla de la sección 5 arma una rama de este árbol.

```
Step "Landing"
├─ Section  .lp-page                          ← TODO el bloque 5.1–5.15 va aquí adentro
│   ├─ Row  .lp-banner  →  Image
│   ├─ Row  .lp-rating-row  →  Text + Text
│   ├─ Text  .lp-badge-free
│   ├─ Headline  .lp-title
│   ├─ Row  .lp-viewing  →  Custom Code + Text
│   ├─ Row  .lp-price-block  →  Text + Headline
│   ├─ Row  .lp-stock-row  →  Custom Code + Text
│   ├─ Row  .lp-stock-bar  →  Row  .lp-stock-bar-fill
│   ├─ Row  .lp-cta-wrap  →  Button + Text                    (CTA #1)
│   ├─ Carousel  .lp-reviews-carousel  →  Rows  .lp-review-card (× 3)
│   ├─ Video  .lp-video
│   ├─ Image Gallery  .lp-gallery
│   ├─ Row  .lp-cta-wrap  →  Button + Text                    (CTA #2)
│   ├─ Row  .lp-summary  →  Headline + Headline + Text + Text
│   ├─ Row  .lp-review-item  (× 3 o 4)
│   └─ Text  .lp-footer-legal
├─ Section  .lp-sticky-wrap  →  Row  .lp-cta-wrap  →  Button   (sin subtexto)
└─ Popup "Formulario COD"  →  Row  .lp-modal  →  ... (ver sección 7)
```

## 5. Mapeo sección por sección — Step "Landing"

Cada bloque de abajo trae: qué arrastrar, en qué orden, qué escribir, y qué
Custom Class ponerle. Repasa 0.1 y 0.2 si algún paso no te calza con lo que ves
en tu pantalla.

### 5.1 Banner principal

1. Arrastra una **Row de 1 columna** dentro de `lp-page`, hasta arriba de todo.
2. Selecciónala → Advanced → Custom Class: `lp-banner`.
3. Selecciona la Column de esa Row → Style → Padding izquierdo/derecho en `0`
   (para que la foto llegue borde a borde, ver 0.5).
4. Arrastra un elemento **Image** dentro de esa columna, súbele tu foto
   principal del producto.
5. En el panel del Image: Width `100%`, Image Fit `Cover` (ver 0.5). No hace
   falta ponerle Custom Class a la imagen — el CSS ya la alcanza a través de
   `lp-banner`.
6. Si tu builder ofrece "Prioridad de carga" / "Eager Load" / "Lazy Load: No"
   para imágenes, actívaselo a esta — es la imagen más grande y la primera que
   se ve, conviene que cargue de inmediato.

### 5.2 Rating (estrellas + reseñas)

1. Arrastra una **Row de 2 columnas** debajo del banner. Custom Class:
   `lp-rating-row`.
2. Dentro de la **primera columna**, arrastra un elemento **Text**. Bórrale el
   texto de ejemplo y escribe: `★★★★★` (el carácter estrella tal cual, no un
   ícono/SVG — así lo puede editar cualquier persona sin tocar código).
   Custom Class de este Text: `lp-rating-stars`.
3. Dentro de la **segunda columna**, otro **Text** con: `(4.9/5) en +1286
   Reseñas`. Custom Class: `lp-rating-count`.

### 5.3 Badge de envío gratis

1. Arrastra un elemento **Text** suelto (no necesita Row propia, puede ir
   directo dentro de `lp-page` o dentro de una Row de 1 columna si tu builder
   no te deja soltar Elementos sueltos sin Row — en ese caso usa una Row de 1
   columna y mete el Text adentro, sin clase en la Row).
2. Texto: `Envío gratis a todo Perú`.
3. Custom Class: `lp-badge-free`.

### 5.4 Título

1. Arrastra un elemento **Headline** (encabezado, no Text — los Headline
   suelen tener mejores opciones de tamaño/semántica H1-H2 y es buena
   práctica de SEO que el título del producto sea un H1 real).
2. Texto: `Billetera Antirrobo de Viaje` (o el nombre real de tu producto).
3. Custom Class: `lp-title`.

### 5.5 "Personas viendo ahora"

1. Row de 1 o 2 columnas. Custom Class: `lp-viewing`.
2. El punto rojo parpadeante es puro CSS, no una imagen: si tu builder tiene
   un elemento **Custom Code / HTML** (a veces llamado "Custom Code" o "HTML
   Block" en el panel de Elements), arrástralo dentro de esta Row y pega
   exactamente: `<span class="lp-viewing-dot"></span>` — no le pongas Custom
   Class a este elemento Custom Code en sí, la clase ya va dentro del HTML que
   pegaste.
3. Al lado, un **Text** con el número dentro de un `<span id="lpViewingCount">`:
   si tu Text permite HTML enriquecido/código fuente (busca un botón `</>` en
   la barra de formato del editor de texto), escribe: `<span
   id="lpViewingCount">12</span> personas viendo este producto AHORA!`. Si tu
   Text NO admite HTML crudo, usa en su lugar otro elemento Custom Code para
   toda la línea. El `id="lpViewingCount"` es el que activa el número que
   fluctúa solo (`footer.js`, sección 2 punto 7) — si lo omites, el número
   simplemente se queda fijo en `12`, no rompe nada.

### 5.6 Precio

1. Row de 1 columna. Custom Class: `lp-price-block`.
2. Dentro, un **Text**: `Antes S/ 99.00`. Custom Class: `lp-price-old`.
3. Debajo, un **Headline**: `Ahora S/ 79.00`. Custom Class: `lp-price-now`.
   Este es el precio de la variante base (1 unidad) — es texto plano, no se
   recalcula solo si cambias las opciones dentro del Popup más adelante.

### 5.7 Stock

1. Row de 1 columna. Custom Class: `lp-stock-row`.
2. Dentro: un elemento Custom Code con `<span class="lp-stock-dot"></span>`
   (el punto verde), seguido de un **Text**: `Solo quedan 23 unidades en
   stock`.
3. Debajo, otra Row (la "barra" de progreso). Custom Class: `lp-stock-bar`.
4. Dentro de esa Row, arrastra una **Row anidada** más pequeña (o una Column
   con ancho fijo, según lo que tu builder te deje anidar dentro de otra Row).
   Custom Class de esa Row/Column interior: `lp-stock-bar-fill`. No necesita
   contenido, es solo un rectángulo de color — el ancho (`46%` por defecto) lo
   define `custom.css`; si quieres otro nivel de "barra llena", cambia el
   valor `width: 46%` directamente en el archivo `custom.css`.

### 5.8 CTA principal #1 (patrón reutilizable — apréndelo una vez, se repite 3 veces)

1. Row de 1 columna. Custom Class: `lp-cta-wrap`.
2. Dentro, arrastra un elemento **Button** (no un Text — el Button es el que
   trae la acción de clic). Custom Class: `lp-cta-btn lp-cta-buzz` (dos
   clases, separadas por un espacio, en el mismo campo — ver 0.2 punto 4).
   Texto del botón: `¡LO QUIERO! + PAGO AL RECIBIR`. Si tu Button tiene opción
   de ícono, ponle uno de bolsa/carrito (opcional).
3. En el mismo Button, ve a su pestaña **Actions** (o "On Click", según tu
   builder) → elige **Open Popup** → selecciona el Popup `Formulario COD` (lo
   vas a crear en la sección 7 — si todavía no existe, crea primero el Popup
   vacío en la sección 7 y vuelve aquí a conectarlo, o deja este paso pendiente
   con una nota y complétalo después).
4. Justo debajo del Button, dentro de la misma columna, arrastra un **Text**
   (no clicable, es solo texto): `Envío gratis y pagas al recibir`. Custom
   Class: `lp-cta-sub`.

> **Por qué el texto va en un Text aparte y no como segunda línea dentro del
> botón:** el elemento Button de GHL garantiza de forma estable una sola línea
> de texto entre distintas versiones del builder. Forzar una segunda línea
> dentro del botón depende de que su editor de texto enriquecido admita saltos
> de línea, lo cual no es seguro en todas las cuentas. Separar la microcopia
> en un Text pegado justo debajo, centrado, se ve idéntico al diseño original
> y es 100% estable.

Repite este mismo patrón completo (Row `lp-cta-wrap` → Button `lp-cta-btn
lp-cta-buzz` con Open Popup → Text `lp-cta-sub`) para:

- **CTA de medio de página** (sección 5.12, después de la galería) — cambia
  solo el texto del botón, por ejemplo `EMPIEZA TU CAMINO CON TU BILLETERA`.
- **Sticky CTA** (sección 5.14) — mismo Button, sin el Text de abajo.

### 5.9 Carrusel de reseñas con foto

1. Busca en el panel de Elements el elemento **Carousel** (distinto de "Image
   Gallery" — el Carousel deja meter Rows completas como cada slide, no solo
   imágenes sueltas). Arrástralo debajo del CTA #1. Custom Class:
   `lp-reviews-carousel`.
2. Dentro del primer slide del Carousel, arrastra una **Row de 2 columnas**.
   Custom Class: `lp-review-card`.
3. En la primera columna: un **Image** (foto de la persona, redondeada).
   Custom Class: `lp-review-avatar`.
4. En la segunda columna, apilados verticalmente: un **Text** con el nombre
   (Custom Class `lp-review-name`), un **Text** con `★★★★★` (Custom Class
   `lp-review-stars`), y un **Text** con el comentario de la reseña (Custom
   Class `lp-review-text`).
5. Duplica este slide completo 2 veces más (clic derecho sobre la Row →
   Duplicate, si tu builder lo ofrece, o repite los pasos 2-4 a mano) y cambia
   el contenido de cada uno. Todas las Rows llevan la misma clase
   `lp-review-card` — es la que las hace ver a todas igual, no hace falta una
   clase distinta por cada una.

> Si tu versión de GHL solo deja meter imágenes sueltas en el Carousel nativo
> (no Rows completas como slide), la mayoría de cuentas recientes de todas
> formas sí lo permiten — confírmalo antes de armar una alternativa a mano con
> 3 Rows normales dentro de un contenedor con scroll horizontal.

### 5.10 Video del cuerpo

1. Arrastra el elemento **Video** (nativo) debajo del carrusel de reseñas.
2. Sube tu MP4 a la Media Storage de GHL (o pega la URL si usas un video ya
   alojado en otro lado).
3. Activa en su panel: `Autoplay`, `Muted`, `Loop`, `Hide Controls`. Si tu
   Video trae una opción del tipo "reproducir solo al entrar en pantalla" /
   "lazy load" / "play on scroll into view", actívala — reemplaza al
   `IntersectionObserver` manual del sitio original sin que tengas que escribir
   una sola línea de código.
4. Custom Class: `lp-video`.

### 5.11 Galería de fotos

1. Arrastra el elemento **Image Gallery** (nativo, trae su propio visor a
   pantalla completa integrado — es el reemplazo directo del "visor" con
   miniaturas del sitio original, no lo repliques a mano).
2. Sube tus 5-6 fotos de detalle del producto.
3. Custom Class: `lp-gallery`.

### 5.12 CTA de medio de página

Repite completo el patrón de 5.8 (Row `lp-cta-wrap` → Button `lp-cta-btn
lp-cta-buzz` con Open Popup apuntando al mismo Popup `Formulario COD` → Text
`lp-cta-sub`), debajo de la galería. Cambia solo el copy del botón.

### 5.13 Resumen "lo que dicen nuestros clientes" + lista de reseñas

1. Row de 1 columna. Custom Class: `lp-summary`.
2. Dentro, apilados: un **Headline** con el título (`Lo que nuestros clientes
   dicen de nosotros`, sin clase propia — hereda estilo normal de Headline),
   un **Headline** más grande con `4.8` (Custom Class `lp-summary-big`), un
   **Text** con `★★★★★` (Custom Class `lp-summary-stars`), y un **Text** con
   `+546 Reseñas verificadas` (Custom Class `lp-summary-count`).
3. Debajo, la lista de reseñas detalladas: repite este bloque 3 o 4 veces —
   - Row (la "tarjeta" de cada reseña). Custom Class: `lp-review-item`.
   - Dentro, una Row pequeña con dos Text lado a lado: nombre (Custom Class
     `lp-review-item-name`) y fecha (Custom Class `lp-review-item-date`).
   - Un Text: `✓ Comprador Verificado`. Custom Class: `lp-review-item-verif`.
   - Un Text: `★★★★★`. Custom Class: `lp-review-stars` (sí, reusa la misma
     clase del punto 5.9/5.13, no hace falta una nueva).
   - Un Text con el título de la reseña. Custom Class: `lp-review-item-title`.
   - Un Text con el cuerpo de la reseña. Custom Class: `lp-review-item-body`.

> El original tenía botones de "me gusta / no me gusta" con contador. Sin un
> backend que guarde ese contador, esta plantilla los deja fuera por
> simplicidad — son decorativos en el original y no afectan la conversión del
> formulario. Si igual los quieres, agrega dos Text estáticos tipo `👍 74` y
> `👎 0` sin acción de clic — no hace falta JavaScript para eso.

### 5.14 Sticky CTA (obligatorio)

1. Arrastra una **Section nueva**, al final del Step, **fuera** de `lp-page`
   (repasa 0.4 si tienes dudas de por qué va afuera). Custom Class:
   `lp-sticky-wrap`.
2. Selecciona esa Section → busca en su panel **Advanced → Position** (o
   "Sticky", según tu builder) → actívalo como **Sticky, posición Bottom**.
   Esto es lo que la deja pegada abajo de la pantalla al hacer scroll, en
   móvil y desktop, sin una sola línea de JavaScript.
3. Dentro de esa Section, repite el mismo patrón de CTA de 5.8: Row
   `lp-cta-wrap` → Button `lp-cta-btn lp-cta-buzz` con texto `¡LO QUIERO! +
   PAGO AL RECIBIR` y Action → Open Popup → `Formulario COD`. Esta vez **no**
   agregues el Text `lp-cta-sub` de abajo — la barra sticky solo lleva el
   botón (el CSS ya oculta ese Text si por error lo dejas, pero es más
   prolijo no agregarlo).

Si tu cuenta de GHL **no** tiene el toggle "Sticky" en Advanced → Position:
`custom.css` ya trae un `position: fixed` de respaldo en `.lp-sticky-wrap`, así
que la barra funciona igual sin que tengas que tocar nada más — el paso 2 de
arriba es opcional en ese caso, no obligatorio.

### 5.15 Footer legal

1. Text de párrafo pequeño con el disclaimer de Meta (solo si vas a correr
   anuncios en Facebook/Instagram; si no, puedes omitir este bloque entero).
2. Custom Class: `lp-footer-legal`.

## 6. Meta Pixel / tracking (nativo, no lo escribas a mano)

No repliques el snippet del pixel manual: usa **Settings → Integrations →
Facebook Pixel** (o **Funnel Settings → Tracking Code → Header Code** si tu cuenta
no tiene esa integración directa) para pegar solo el Pixel ID. Los eventos
`ViewContent` / `AddToCart` / `Lead` puedes dispararlos desde las acciones nativas
de Formulario (**Form → Actions → Facebook Pixel Event**) sin código, si tu plan de
GHL incluye esa opción; si no, un Workflow disparado por el submit del formulario
puede enviar el evento por Conversions API — eso ya es parte de tu backend, que
manejas tú.

## 7. El Popup nativo — "Formulario COD"

1. En el panel de Elements, busca **Popup** y arrástralo a cualquier parte del
   Step `Landing` (queda oculto hasta que algo lo dispare, así que su posición en
   el lienzo no importa — no necesitas meterlo dentro de `lp-page` ni en ningún
   lugar específico).
2. Nómbralo `Formulario COD` — es el nombre que vas a buscar en la acción **Open
   Popup** de cada botón (sección 5.8, paso 3).
3. Dentro del Popup, arrastra una Row de 1 columna. Selecciónala → Custom
   Class: `lp-modal` — esa es la "tarjeta blanca" con bordes redondeados y
   sombra. **Todo** el contenido del formulario (secciones 7.1 a 7.7) va
   dentro de esta Row, en la misma columna, uno debajo de otro.
4. Ajusta el Popup en sí (no la Row de adentro, el Popup como elemento
   contenedor): ancho `Auto` o `Custom` cercano a `456px`, overlay oscuro
   semi-transparente (suele venir por defecto), y **cerrar con clic fuera +
   botón X** activado en sus opciones.

### 7.1 Contenido superior del modal (no forma parte del formulario)

1. Dentro de `lp-modal`, un **Image** con tu logo, en formato circular. Custom
   Class: `lp-modal-logo`. Panel del Image: Width fijo tipo `100px` (o el que
   prefieras, es un logo pequeño, no necesita `100%`), Image Fit `Contain`
   (ver 0.5 — así se ve el logo completo sin recortar).
2. Un **Text**: `✓ Vendedor calificado`. Custom Class: `lp-modal-vendor`.
3. Un **Text**: `Garantía de 90 días por tu pedido`. Custom Class:
   `lp-modal-guarantee`.

### 7.2 El Form nativo — construcción crítica

**Constrúyelo con Elements → Form directamente dentro del Popup**, no lo crees
primero en "Sites → Forms" para luego incrustarlo por embed/iframe. La razón:

> Un formulario incrustado por iframe vive en otro documento HTML — tu
> `custom.css` (que se inyecta en el `<head>` de la página) **no puede
> alcanzarlo**, y las tarjetas de variante/envío de las secciones 7.3 y 7.4 se
> verían sin estilo, como una lista de radios sueltos. El Form creado directo
> en el builder del Funnel/Website se renderiza en línea, dentro del mismo
> documento, así que sí hereda el CSS.

1. Arrastra el elemento **Form** dentro de `lp-modal`, debajo del bloque 7.1.
2. Selecciónalo → Advanced → Custom Class: `lp-form-cod`.
3. A partir de aquí, cada **campo** que agregues dentro de ese Form tiene su
   propio botón/ícono de configuración (normalmente aparece al pasar el mouse
   sobre el campo, dentro del propio editor del Form) con sus propias pestañas
   Settings/Advanced — ahí es donde le vas a poner la Custom Class a cada
   campo individual (repasa 0.2, punto 5).

### 7.3 Campo "Cantidad" (las 3 tarjetas de precio)

1. Dentro del Form, agrega un campo tipo **Opción única / Radio Select**
   ("Single Option" / "Radio").
2. Etiqueta del campo: `Elige tu paquete`.
3. Crea 3 opciones, con el **valor** (no solo la etiqueta visible) igual al
   precio real — así tu automatización de GHL sabe qué cobrar/registrar sin
   adivinar:

   | Etiqueta visible (rich text si tu builder lo permite) | Valor interno |
   |---|---|
   | `1 unidad — S/ 79.00` | `1 unidad - S/79` |
   | `2 unidades — S/ 119.00` | `2 unidades - S/119` |
   | `3 unidades — S/ 149.00` | `3 unidades - S/149` |

4. Marca la primera opción como seleccionada por defecto.
5. Selecciona este campo (no el Form completo) → Advanced → Custom Class:
   `lp-variant-field`.
6. Si tu Form Builder permite texto enriquecido dentro de cada opción, dale a
   la opción de 3 unidades un salto de línea con `MÁS POPULAR` en mayúsculas —
   el CSS ya trae `.lp-vbadge` como referencia de estilo por si tu builder te
   deja envolver ese texto en un `<span class="lp-vbadge">`.
7. **custom.css** convierte automáticamente esas 3 opciones en tarjetas
   horizontales con el círculo de radio nativo oculto y borde azul al
   seleccionar — no necesitas JS para el resaltado (`:checked` en CSS lo
   resuelve todo).

> Si después de publicar las tarjetas no se ven como tarjetas (siguen como una
> lista con bolitas de radio normales), es casi siempre porque el wrapper real
> que GHL generó para las opciones no coincide exactamente con el selector
> CSS. Clic derecho → Inspeccionar sobre una opción publicada, confirma el
> nombre de clase que GHL puso alrededor del `input`/`label`, y ajusta el
> selector en la sección **18** de `custom.css`. El patrón no cambia, solo el
> nombre de la clase.

### 7.4 Campo "Método de envío"

Mismo patrón que 7.3 pero en **lista vertical** (el CSS ya lo distingue por la
clase distinta):

1. Campo **Opción única / Radio**, etiqueta `Método de envío`.
2. Opciones:
   - `Pago en Casa (Lima) — Gratis` — valor `casa`
   - `Envío por Agencia (Provincia) — Gratis` — valor `agencia`
3. Custom Class del campo: `lp-ship-field`.
4. Marca `casa` como valor por defecto.

### 7.5 Campos compartidos

| Campo del Form Builder | Tipo | Custom Class del campo | Notas |
|---|---|---|---|
| Nombres | Texto corto, requerido | `lp-form-name` | |
| WhatsApp | Teléfono, requerido | `lp-form-phone` | Usa el "Help text" nativo del campo (un campo de texto de ayuda que casi todo Form Builder trae debajo del label, no un Text aparte) para: `Si no estás, puede recibirlo cualquier persona. Empaque discreto.` |
| Dirección de entrega | Texto corto, requerido | `lp-form-address` | **Condicional**: mostrar solo si `Método de envío = casa` (ver 7.6) |
| Agencia de destino | Texto corto, requerido | `lp-form-agency` | **Condicional**: mostrar solo si `Método de envío = agencia` (ver 7.6) |

### 7.6 Mostrar/ocultar Dirección vs Agencia — Lógica condicional nativa

Cada campo del Form Builder de GHL tiene una pestaña **Conditional Logic /
Show-Hide Logic** (búscala junto a Settings/Advanced del campo). Configúrala
así:

- Campo `Dirección de entrega` → **Mostrar este campo SI** `Método de envío`
  es igual a `casa`.
- Campo `Agencia de destino` → **Mostrar este campo SI** `Método de envío` es
  igual a `agencia`.

Esto reemplaza al `selShip()` de JavaScript del original sin una sola línea de
código — para esto existe la lógica condicional nativa del Form Builder.

### 7.7 Nota de entrega y botón de envío

1. Un **Text** (dentro o justo debajo del Form, dentro de `lp-modal`):
   `Entrega para Lima al día siguiente y provincia 2-3 días`. Custom Class:
   `lp-entrega-note`. (Si quieres que también cambie según el envío elegido,
   duplica este Text en dos versiones y aplícales la misma lógica condicional
   de 7.6 — una visible solo con `casa`, otra solo con `agencia`.)
2. El botón de envío que ya trae el propio Form (no agregues un Button
   aparte): selecciónalo desde **Form → Style → Submit Button**. Texto:
   `REALIZAR PEDIDO`. Custom Class: `lp-btn-submit`.
3. Un **Text** debajo: `✓ Te escribiremos por WhatsApp para confirmar tu
   pedido`. Custom Class: `lp-wa-note`.
4. Un **Image** con tus sellos de confianza. Custom Class: `lp-trust-seals`.
   Width `100%`.

### 7.8 Qué pasa al enviar (Action After Submit)

En **Form → Settings → Actions After Submit**:

- Acción: **Redirect to URL** → apunta al Step `Gracias` de este mismo Funnel
  (GHL te deja elegirlo de una lista, no hace falta escribir la URL a mano).
- (Opcional) Además de la redirección, conecta un **Workflow** disparado por
  "Form Submitted" para tu automatización de backend (Sheets, WhatsApp,
  notificaciones) — eso lo arma tu automatización, no esta plantilla.

No existe una acción nativa "abrir otro Popup" al enviar un formulario — por eso
el flujo aquí es Popup (pedido) → **redirección real** al Step de Gracias, en vez
de encadenar un segundo modal. Es la forma robusta de hacerlo sin scripts frágiles
escuchando el submit.

## 8. Step "Gracias"

Página de confirmación estática — sin dependencias de sessionStorage ni de un
backend propio, tal como autorizaste si la lógica original no se podía portar tal
cual. Todo esto va dentro de una Section nueva en el Step `Gracias`.

1. Arrastra una **Section**. Custom Class: `lp-thanks-page` — es el contenedor
   de todo este Step, igual que `lp-page` lo era para `Landing`.
2. Dentro, un tilde de confirmación: un **Icon** (si tu builder trae íconos
   nativos tipo check) o una **Image** con un ícono de check. Custom Class:
   `lp-thanks-tick`.
3. Un **Headline**: `¡Pedido confirmado!`. Custom Class: `lp-thanks-title`.
4. Un **Text**: `Ya registramos tu pedido. Te escribimos por WhatsApp para
   coordinar la entrega.`. Custom Class: `lp-thanks-sub`.
5. Una Row con el contador de urgencia. Custom Class: `lp-thanks-timer`.
   Dentro, un Text o Custom Code con: `Tienes <span
   id="lpCountdown">10:00</span> minutos para asegurar tu orden` — el
   `id="lpCountdown"` es lo que activa el contador regresivo de `footer.js`.
   Si tu Text no admite HTML/`id` personalizado, usa un elemento Custom Code
   para toda la línea.
6. Una Row tipo tarjeta. Custom Class: `lp-thanks-card`. Dentro:
   - Un **Button** (o un elemento tipo "Link"): texto `Confirmar por
     WhatsApp`. Custom Class: `lp-thanks-wa`. Su acción (Actions → Open URL):
     `https://wa.me/51XXXXXXXXX?text=Hola!%20Acabo%20de%20hacer%20mi%20pedido%20y%20quiero%20confirmarlo.`
     — cambia el número de WhatsApp por el real, y el mensaje si quieres.
7. Tres Rows con los pasos "Qué sigue" — cada una con: un círculo pequeño con
   el número (Custom Class `lp-thanks-step-num`, contenido `1`, `2`, `3`) y un
   Text al lado con la descripción del paso.

> **Prefill dinámico (opcional, "mejor esfuerzo"):** si quieres que el mensaje
> de WhatsApp lleve el nombre del cliente sin backend propio, GHL soporta
> *merge fields* (`{{contact.first_name}}`, `{{contact.phone}}`) en textos y
> enlaces cuando el visitante ya quedó identificado por haber llenado el Form
> justo antes. Pruébalo así:
> `https://wa.me/51XXXXXXXXX?text=Hola,%20soy%20{{contact.first_name}}...` —
> pero no lo des por garantizado en el primer segundo tras la redirección; si
> el merge field no resuelve a tiempo, GHL normalmente deja el texto vacío o
> el propio tag sin reemplazar, así que pruébalo con un pedido real antes de
> confiar en él. La versión estática de arriba (sin merge fields) es la que
> **siempre** funciona.

## 9. Checklist de verificación visual

Antes de dar por lista la plantilla, compara contra el original en un celular real
(no solo el preview del editor):

- [ ] La página se ve como una tarjeta centrada de ~480px sobre fondo gris, no a
      todo el ancho de una pantalla grande.
- [ ] Los 3 botones CTA (arriba, medio, sticky) abren el **mismo** Popup.
- [ ] El sticky CTA queda pegado abajo al hacer scroll, en móvil y desktop.
- [ ] Al abrir el Popup, las 3 tarjetas de variante se ven como tarjetas (no como
      una lista de radios sueltos) y la seleccionada se resalta en azul.
- [ ] Elegir "Envío por Agencia" oculta "Dirección de entrega" y muestra "Agencia
      de destino", sin recargar la página.
- [ ] Enviar el formulario de prueba te redirige al Step `Gracias`.
- [ ] En `Gracias`, el contador baja de `10:00` en tiempo real y el botón de
      WhatsApp abre con el número y mensaje correctos.
- [ ] Todo el texto de precios, nombre de producto y fotos se edita desde el
      editor visual — nadie necesitó tocar código para cambiarlos.

## 10. Extensiones opcionales

### Añadir un order bump (upsell) después del pedido

Reusa exactamente el patrón de la sección 7: un segundo **Popup** nativo
(`lp-modal` también le sirve de base visual), con su propio carrusel de
fotos/video y un botón "Sí, añadir" (Action → tu Workflow) y "No, gracias"
(Action → Close Popup). Como no existe la acción nativa "abrir Popup al enviar un
Form", la forma robusta de encadenarlo es: el **Redirect to URL** del Form COD
(sección 7.8) apunta a un **Step intermedio** del Funnel (por ejemplo
`/oferta-especial`) que se abre automáticamente con ese segundo Popup (usando la
acción **Open Popup on Page Load**, si tu builder la trae), en vez de intentar
disparar el Popup desde JavaScript escuchando el submit — así sigue siendo 100%
nativo y no depende de un evento del formulario que GHL no expone de forma
estable entre versiones.

### Precio dinámico visible en el modal

Esta plantilla no muestra un "total" que se recalcule en vivo dentro del Popup
(el original tampoco lo hacía — el precio solo se ve en la tarjeta de variante
elegida). Si más adelante quieres un total visible que sume envío/extras, eso sí
requeriría JavaScript adicional escuchando el cambio del campo `lp-variant-field`
— avísame si llegas a necesitarlo y lo agregamos como su propio bloque aislado en
`footer.js`, sin tocar el resto.
