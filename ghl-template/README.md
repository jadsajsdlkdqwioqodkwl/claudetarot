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

## 0. Decisiones de alcance (para que no haya sorpresas)

- **Estructura**: un Funnel de GHL con 2 Steps — `Landing` (la página producto) y
  `Gracias` (confirmación). Un Funnel te da estadísticas por paso, que un Website
  normal no separa igual de bien para un embudo de una sola oferta.
- **El popup del formulario COD es un Popup nativo de verdad**, no una sección que
  se muestra/oculta con CSS: se abre con la acción nativa "Abrir Popup" de los
  botones. Igual el sticky CTA: es sticky nativo, no un `position:fixed` disfrazado
  (el CSS trae ese fallback solo por si tu cuenta no tiene el toggle nativo).
- **Sin order bump / upsell.** El pedido de precios que diste es solo el producto
  principal en 3 tramos, así que esta guía no arma el segundo popup de "¿quieres
  añadir X?". La sección 8 explica cómo añadirlo después, reusando exactamente el
  mismo patrón de Popup.
- **La página de Gracias queda como confirmación estática**, tal como autorizaste:
  tilde verde, mensaje, resumen breve, contador de urgencia decorativo y botón de
  WhatsApp. No depende de ningún backend externo — nada que romper.
- **Backend, automatizaciones, Sheets, notificaciones**: eso lo resuelves tú desde
  GHL (Workflows, integraciones). Esta guía se detiene en "el formulario nativo
  queda armado y dispara el submit"; a partir de ahí conectas tu automatización.
- **Convención de clases**: todo lleva el prefijo `lp-` (landing page). Están
  definidas en `custom.css`. No inventes nombres nuevos sin agregarlos también ahí.

## 1. Crear el Funnel

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
   **Step Settings → Custom CSS**, uno por página).

## 2. Ajustes de la página antes de arrastrar nada

- El look "tarjeta móvil centrada de 480px sobre fondo gris" (igual al original)
  se logra con una **Section** contenedora a la que le pones la Custom Class
  `lp-page`. Todo el contenido del Step 1 vive dentro de esa Section.
- Ve a **Section → Settings → Background Color**: déjalo transparente o blanco
  (el gris de fondo `#f2f2f4` ya lo pone `custom.css` sobre el `body`).
- **Brand/Fonts**: agrega la fuente Google "Inter" (pesos 400/500/600/700/800/900)
  desde Settings → Website → Fonts, o desde el selector de fuente del primer
  Headline que agregues (la mayoría de builders de GHL dejan buscar cualquier
  Google Font ahí mismo).

## 3. Mapeo sección por sección — Step "Landing"

Cada fila es un bloque tal como aparece en el diseño original, de arriba hacia
abajo. La columna **Elemento GHL** dice qué arrastrar desde el panel de Elements;
**Custom Class** es lo que escribes en la pestaña **Advanced → Custom Class** de
ese elemento (o del campo, cuando es dentro de un Form).

### 3.1 Banner principal

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| Row (1 columna) | `lp-banner` | |
| ↳ Image | — | Sube tu foto principal. Actívale "Lazy Load: No" / prioridad alta si tu builder lo ofrece — es la imagen más grande de la página (LCP) |

### 3.2 Rating (estrellas + reseñas)

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| Row (2 columnas) | `lp-rating-row` | |
| ↳ Text: `★★★★★` | `lp-rating-stars` | Texto plano con el carácter estrella, no un ícono — así lo edita cualquiera sin tocar SVG |
| ↳ Text: `(4.9/5) en +1286 Reseñas` | `lp-rating-count` | |

### 3.3 Badge de envío gratis

| Elemento GHL | Custom Class |
|---|---|
| Text: `Envío gratis a todo Perú` | `lp-badge-free` |

### 3.4 Título

| Elemento GHL | Custom Class |
|---|---|
| Headline (H1): `Billetera Antirrobo de Viaje` | `lp-title` |

### 3.5 "Personas viendo ahora"

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| Row | `lp-viewing` | |
| ↳ Custom Code (HTML pequeño): `<span class="lp-viewing-dot"></span>` | — | El punto parpadeante es puro CSS (`@keyframes lpBlink`), por eso basta un `<span>` vacío |
| ↳ Text: `personas viendo este producto AHORA!` con un `<span id="lpViewingCount">12</span>` al inicio | — | Si tu Text element permite HTML enriquecido, escribe el número dentro de ese `span` con ese `id` exacto — así el `footer.js` lo hace fluctuar solo. Si tu Text no admite HTML crudo, usa un elemento "Custom Code" para toda la línea |

### 3.6 Precio

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| Row | `lp-price-block` | |
| ↳ Text: `Antes S/ 99.00` | `lp-price-old` | |
| ↳ Headline: `Ahora S/ 79.00` | `lp-price-now` | Este es el precio de la variante base (1 unidad); no se recalcula solo, es texto editable |

### 3.7 Stock

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| Row | `lp-stock-row` | |
| ↳ Custom Code: `<span class="lp-stock-dot"></span>` | — | |
| ↳ Text: `Solo quedan 23 unidades en stock` | — | |
| Row (barra) | `lp-stock-bar` | |
| ↳ Row/Div interior, ancho fijo | `lp-stock-bar-fill` | Cambia el `width: 46%` en `custom.css` si quieres otro nivel de barra |

### 3.8 CTA principal #1 (patrón reutilizable)

Este patrón se repite 3 veces en la página (CTA arriba, CTA de medio, sticky
bottom). Documentado una sola vez aquí:

| Elemento GHL | Custom Class | Configuración |
|---|---|---|
| Row | `lp-cta-wrap` | |
| ↳ **Button** | `lp-cta-btn lp-cta-buzz` | Texto: `¡LO QUIERO! + PAGO AL RECIBIR`. Icono: bolsa/carrito (opcional, según tu builder). **Action → On Click → Open Popup** → selecciona el Popup `Formulario COD` (lo creamos en la sección 5) |
| ↳ Text (debajo del botón, no clicable) | `lp-cta-sub` | `Envío gratis y pagas al recibir` |

> Por qué el texto va en un Text aparte y no como segunda línea dentro del botón:
> el elemento Button de GHL garantiza una sola línea de texto de forma estable
> entre versiones. Meter una segunda línea dentro del botón es frágil (depende de
> si tu editor de texto enriquecido del botón admite saltos de línea). Separarlo
> en un Text pegado justo debajo, centrado, se ve idéntico y es 100% estable.

Repite este mismo patrón para:

- **CTA de medio de página** (después de la galería): mismo Button+Text, cambia
  solo el copy (`EMPIEZA TU CAMINO...` → ajústalo al producto).
- **Sticky CTA**: ver sección 3.14.

### 3.9 Carrusel de reseñas con foto

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| **Carousel** (elemento nativo, no Image Gallery) | `lp-reviews-carousel` | Actívale flechas + puntos si tu builder lo permite |
| ↳ Slide 1: Row | `lp-review-card` | |
| &nbsp;&nbsp;↳ Image (foto redonda) | `lp-review-avatar` | |
| &nbsp;&nbsp;↳ Text: nombre | `lp-review-name` | |
| &nbsp;&nbsp;↳ Text: `★★★★★` | `lp-review-stars` | |
| &nbsp;&nbsp;↳ Text: reseña | `lp-review-text` | |
| ↳ Slide 2, 3… | (misma clase `lp-review-card` en cada uno) | Duplica el slide 1 y cambia el contenido |

> Si tu versión de GHL solo deja meter imágenes sueltas en el Carousel nativo (no
> Rows completas como slide), usa en su lugar 3 Rows normales dentro de un
> contenedor con overflow horizontal — pero antes revisa: la mayoría de cuentas
> recientes de GHL sí permiten arrastrar una Row entera como slide del Carousel.

### 3.10 Video del cuerpo

| Elemento GHL | Custom Class | Configuración |
|---|---|---|
| **Video** (nativo, sube tu MP4 a Media Storage) | `lp-video` | Activa: `Autoplay`, `Muted`, `Loop`, `Hide Controls`. Si tu Video element trae la opción "reproducir solo al entrar en pantalla" / lazy, actívala — reemplaza al `IntersectionObserver` manual del original sin escribir una línea de JS |

### 3.11 Galería de fotos

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| **Image Gallery** (nativo, con lightbox propio) | `lp-gallery` | Sube tus 5–6 fotos de detalle. El lightbox a pantalla completa (equivalente al "visor" del original) ya viene incluido — no repliques esa parte a mano |

### 3.12 CTA de medio de página

Repite el patrón de 3.8 (`lp-cta-wrap` / `lp-cta-btn lp-cta-buzz` / `lp-cta-sub`)
apuntando **Open Popup** al mismo Popup `Formulario COD`.

### 3.13 Resumen "lo que dicen nuestros clientes" + lista de reseñas

| Elemento GHL | Custom Class |
|---|---|
| Row | `lp-summary` |
| ↳ Headline: título | — |
| ↳ Headline grande: `4.8` | `lp-summary-big` |
| ↳ Text: `★★★★★` | `lp-summary-stars` |
| ↳ Text: `+546 Reseñas verificadas` | `lp-summary-count` |

Lista de reseñas (repite este bloque 3–4 veces):

| Elemento GHL | Custom Class |
|---|---|
| Row (tarjeta) | `lp-review-item` |
| ↳ Row (nombre + fecha) | — |
| &nbsp;&nbsp;↳ Text: nombre | `lp-review-item-name` |
| &nbsp;&nbsp;↳ Text: fecha | `lp-review-item-date` |
| ↳ Text: `✓ Comprador Verificado` | `lp-review-item-verif` |
| ↳ Text: `★★★★★` | `lp-review-stars` (reusa la misma clase) |
| ↳ Text: título de la reseña | `lp-review-item-title` |
| ↳ Text: cuerpo de la reseña | `lp-review-item-body` |

> El original tenía botones de "me gusta / no me gusta" con contador. Como no hay
> backend que guarde ese contador en GHL sin trabajo extra, esta plantilla los
> deja fuera por simplicidad — son puramente decorativos en el original y no
> afectan la conversión del formulario. Si los quieres igual, serían dos íconos +
> número como Text estático (sin funcionalidad de clic), no hace falta JS.

### 3.14 Sticky CTA (obligatorio)

| Elemento GHL | Custom Class | Configuración |
|---|---|---|
| **Section** (fuera del `lp-page`, al final del Step) | `lp-sticky-wrap` | **Advanced → Position → Sticky: sí, Bottom.** Esto es lo que la deja pegada abajo en móvil y desktop, sin JS |
| ↳ dentro, el mismo patrón de CTA (3.8) | `lp-cta-wrap` / `lp-cta-btn lp-cta-buzz` | Copy: `¡LO QUIERO! + PAGO AL RECIBIR`. Mismo **Open Popup** |

Si tu cuenta de GHL **no** tiene el toggle "Sticky" en Advanced → Position:
`custom.css` ya trae un `position: fixed` de respaldo en `.lp-sticky-wrap`, así que
funciona igual sin tocar nada más.

### 3.15 Footer legal

| Elemento GHL | Custom Class |
|---|---|
| Text (párrafo pequeño con el disclaimer de Meta, si usas Facebook Ads) | `lp-footer-legal` |

## 4. Meta Pixel / tracking (nativo, no lo escribas a mano)

No repliques el snippet del pixel manual: usa **Settings → Integrations →
Facebook Pixel** (o **Funnel Settings → Tracking Code → Header Code** si tu cuenta
no tiene esa integración directa) para pegar solo el Pixel ID. Los eventos
`ViewContent` / `AddToCart` / `Lead` puedes dispararlos desde las acciones nativas
de Formulario (**Form → Actions → Facebook Pixel Event**) sin código, si tu plan de
GHL incluye esa opción; si no, un Workflow disparado por el submit del formulario
puede enviar el evento por Conversions API — eso ya es parte de tu backend, que
manejas tú.

## 5. El Popup nativo — "Formulario COD"

1. En el panel de Elements, busca **Popup** y arrástralo a cualquier parte del
   Step `Landing` (queda oculto hasta que algo lo dispare, así que su posición en
   el lienzo no importa).
2. Nómbralo `Formulario COD` — es el nombre que vas a buscar en la acción **Open
   Popup** de cada botón (sección 3.8).
3. Dentro del Popup, arrastra una Row/Section y ponle la Custom Class `lp-modal`
   — esa es la "tarjeta blanca" con bordes redondeados y sombra.
4. Ajusta el Popup en sí: ancho `Auto` o `Custom` alineado con `max-width: 456px`
   (lo controla igual `custom.css`, pero conviene que el contenedor del Popup no
   fuerce un ancho fijo mayor), overlay oscuro semi-transparente (suele venir por
   defecto), y **cerrar con click fuera + botón X** activado.

### 5.1 Contenido superior del modal (no forma parte del formulario)

| Elemento GHL | Custom Class |
|---|---|
| Image (logo circular) | `lp-modal-logo` |
| Row/Text: `✓ Vendedor calificado` | `lp-modal-vendor` |
| Text: `Garantía de 90 días por tu pedido` | `lp-modal-guarantee` |

### 5.2 El Form nativo — construcción crítica

**Constrúyelo con Elements → Form directamente dentro del Popup**, no lo crees
primero en "Sites → Forms" para luego incrustarlo por embed/iframe. La razón:

> Un formulario incrustado por iframe vive en otro documento HTML — tu
> `custom.css` (que se inyecta en el `<head>` de la página) **no puede
> alcanzarlo**, y las tarjetas de variante/envío de las secciones 5.3 y 5.4 se
> verían sin estilo. El Form creado directo en el builder del Funnel/Website se
> renderiza en línea, dentro del mismo documento, así que sí hereda el CSS.

Dale al Form la Custom Class `lp-form-cod` (Form → Advanced → Custom Class).

### 5.3 Campo "Cantidad" (las 3 tarjetas de precio)

1. Agrega un campo tipo **Opción única / Radio Select** ("Single Option" /
   "Radio").
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
5. En **Advanced** de ese campo, Custom Class: `lp-variant-field`.
6. Si tu Form Builder permite texto enriquecido dentro de cada opción, dale a la
   opción del medio o la de 3 unidades un salto de línea con `MÁS POPULAR` en
   mayúsculas — el CSS ya trae `.lp-vbadge` como referencia de estilo por si tu
   builder te deja envolver eso en un `<span class="lp-vbadge">`.
7. **custom.css** convierte automáticamente esas 3 opciones en tarjetas
   horizontales con el radio nativo oculto y el borde azul al seleccionar — no
   necesitas JS para el resaltado (`:checked` lo resuelve todo).

> Si después de publicar las tarjetas no se ven (siguen como una lista con
> bolitas de radio normales), es casi siempre porque el wrapper real que GHL
> generó para las opciones no coincide exactamente con el selector CSS. Clic
> derecho → Inspeccionar sobre una opción, confirma el nombre de clase que GHL
> puso alrededor del `input`/`label`, y ajusta el selector en la sección **18**
> de `custom.css`. El patrón no cambia, solo el nombre de la clase.

### 5.4 Campo "Método de envío"

Mismo patrón que 5.3 pero en **lista vertical** (el CSS ya lo distingue por la
clase distinta):

1. Campo **Opción única / Radio**, etiqueta `Método de envío`.
2. Opciones:
   - `Pago en Casa (Lima) — Gratis` — valor `casa`
   - `Envío por Agencia (Provincia) — Gratis` — valor `agencia`
3. Custom Class del campo: `lp-ship-field`.
4. Marca `casa` como valor por defecto.

### 5.5 Campos compartidos

| Campo del Form Builder | Tipo | Custom Class del campo | Notas |
|---|---|---|---|
| Nombres | Texto corto, requerido | `lp-form-name` | |
| WhatsApp | Teléfono, requerido | `lp-form-phone` | Usa el "Help text" nativo del campo (no un Text aparte) para el aviso: `Si no estás, puede recibirlo cualquier persona. Empaque discreto.` |
| Dirección de entrega | Texto corto, requerido | `lp-form-address` | **Condicional**: mostrar solo si `Método de envío = casa` (ver 5.6) |
| Agencia de destino | Texto corto, requerido | `lp-form-agency` | **Condicional**: mostrar solo si `Método de envío = agencia` (ver 5.6) |

### 5.6 Mostrar/ocultar Dirección vs Agencia — Lógica condicional nativa

En el Form Builder de GHL, cada campo tiene una pestaña **Conditional Logic /
Show-Hide Logic**. Configúrala así:

- Campo `Dirección de entrega` → **Mostrar este campo SI** `Método de envío` es
  igual a `casa`.
- Campo `Agencia de destino` → **Mostrar este campo SI** `Método de envío` es
  igual a `agencia`.

Esto reemplaza al `selShip()` de JavaScript del original sin una sola línea de
código — es exactamente para esto que existe la lógica condicional nativa del
Form Builder.

### 5.7 Nota de entrega y botón de envío

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| Text (dentro o justo debajo del Form): `Entrega para Lima al día siguiente y provincia 2-3 días` | `lp-entrega-note` | Si quieres que también cambie según el envío elegido sin JS, duplica el Text en dos versiones distintas y aplícales la misma lógica condicional de 5.6 (una visible solo con `casa`, otra solo con `agencia`) |
| Botón de envío del propio Form (Form → Style → Submit Button) | `lp-btn-submit` | Texto: `REALIZAR PEDIDO` |
| Text debajo: `✓ Te escribiremos por WhatsApp para confirmar tu pedido` | `lp-wa-note` | |
| Image (sellos de confianza) | `lp-trust-seals` | |

### 5.8 Qué pasa al enviar (Action After Submit)

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

## 6. Step "Gracias"

Página de confirmación estática — sin dependencias de sessionStorage ni de un
backend propio, tal como autorizaste si la lógica original no se podía portar tal
cual.

| Elemento GHL | Custom Class | Notas |
|---|---|---|
| Section | `lp-thanks-page` | Contenedor de todo el Step |
| Row/Icon o Image con tilde | `lp-thanks-tick` | Un ícono de check simple (SVG que tu builder traiga, o una imagen) |
| Headline: `¡Pedido confirmado!` | `lp-thanks-title` | |
| Text: `Ya registramos tu pedido. Te escribimos por WhatsApp para coordinar la entrega.` | `lp-thanks-sub` | |
| Row | `lp-thanks-timer` | Dentro, un Text/Custom Code con `Tienes <span id="lpCountdown">10:00</span> minutos para asegurar tu orden` — el `id="lpCountdown"` es lo que activa el contador de `footer.js` |
| Row (tarjeta) | `lp-thanks-card` | |
| ↳ Button/Link: `Confirmar por WhatsApp` | `lp-thanks-wa` | **Action → Open URL**: `https://wa.me/51XXXXXXXXX?text=Hola!%20Acabo%20de%20hacer%20mi%20pedido%20y%20quiero%20confirmarlo.` Cambia el número y, si quieres, el mensaje |
| Row × 3 (pasos "Qué sigue") | — | Cada uno: círculo numerado (`lp-thanks-step-num`) + Text |

> **Prefill dinámico (opcional, "mejor esfuerzo"):** si quieres que el mensaje de
> WhatsApp lleve el nombre del cliente sin backend propio, GHL soporta *merge
> fields* (`{{contact.first_name}}`, `{{contact.phone}}`) en textos y enlaces
> cuando el visitante ya quedó identificado por haber llenado el Form justo antes
> (vía el tracking/cookie del propio GHL). Pruébalo así:
> `https://wa.me/51XXXXXXXXX?text=Hola,%20soy%20{{contact.first_name}}...` — pero
> no lo des por garantizado en el primer segundo tras la redirección; si el merge
> field no resuelve a tiempo, GHL normalmente deja el texto vacío o el propio
> tag sin reemplazar, así que pruébalo con un pedido real antes de confiar en él.
> La versión estática de arriba (sin merge fields) es la que **siempre** funciona.

## 7. Checklist de verificación visual

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

## 8. Extensiones opcionales

### Añadir un order bump (upsell) después del pedido

Reusa exactamente el patrón de la sección 5: un segundo **Popup** nativo
(`lp-modal` también le sirve de base visual), con su propio carrusel de
fotos/video y un botón "Sí, añadir" (Action → tu Workflow) y "No, gracias"
(Action → Close Popup). Como no existe la acción nativa "abrir Popup al enviar un
Form", la forma robusta de encadenarlo es: el **Redirect to URL** del Form COD
(sección 5.8) apunta a un **Step intermedio** del Funnel (por ejemplo
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
