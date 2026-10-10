# Varios productos y varios números de WhatsApp

Para probar muchos productos (unos 25) en un número aparte del de Tarot Store, y
después sumar números por marca, sin abrir otro CRM ni otra sesión.

## Cómo está armado

- **Un solo CRM, un solo webhook.** Todos los números de WhatsApp Cloud API
  apuntan al mismo webhook (`/api/whatsapp/webhook`). Cada mensaje trae
  `metadata.phone_number_id` y con eso se sabe a qué número escribió el cliente.
- **Líneas** (`lineas`, `src/lib/lineas.js`): cada número. Tarot Store es la
  línea principal (`WHATSAPP_PHONE_NUMBER_ID` de `wrangler.jsonc`, chats con
  `linea_id` NULL: todo lo de antes sigue igual). Un número nuevo se registra
  solo con su primer mensaje y usa el `WHATSAPP_TOKEN` de siempre (sirve si el
  número está en el mismo Business Manager y el usuario del sistema tiene
  acceso). Si es de otro Business Manager: secreto aparte
  (`npx wrangler secret put WHATSAPP_TOKEN_MARCA2`) y su nombre en la línea.
- **Un chat por cliente y por número.** Si la misma persona escribe a Tarot
  Store y al número de pruebas, son dos chats, y cada respuesta sale por el
  número al que escribió (`envDeConversacion` en `crm-send.js`: nadie tiene que
  elegir el número a mano). Plantillas y catálogo, los de la cuenta de ese número.
- **Productos** (`productos`, `src/lib/productos.js`): el CRM reconoce el
  producto de cada chat solo, en este orden:
  1. por el **ID del anuncio** (Click to WhatsApp) cargado en el producto,
  2. por **palabras clave** en el anuncio o en lo que escribió el cliente,
  3. si el número tiene **un solo producto**.
  La vendedora puede cambiarlo en el panel del chat (manda sobre lo automático).

## Qué cambia con el producto del chat

- **Respuestas rápidas**: cada una puede ser de un producto o general. En un
  chat de un producto salen primero las suyas y después las generales; las de
  otros productos no aparecen (buscando por nombre sí, al final).
- **Bienvenida**: cada paso de la bienvenida es general o de un producto. Un
  chat de un producto recibe solo sus pasos. En otro número, sin pasos propios
  no sale ninguna (la general es la de Tarot Store). Se puede apagar por producto.
- **Seguimiento de leads**: cada producto elige su secuencia (las mismas de
  "Secuencias de seguimiento"). Sin producto, la general de siempre (solo en
  Tarot Store).
- **Por marca**: los toques (Tarot `d2…post60`, URO `u_…`) y los planes con plantilla tienen textos propios en cada marca (ver `plantillas-propuestas.js`). **Solo Tarot Store**: carrito abandonado, el evento de
  conversación de CAPI y el asesor (`/api/asesor/chats`, salvo `&linea=<id>`)
  siguen solo en el número principal: sus textos y ofertas son de Tarot Store.
- Lista de chats: insignias 📦 producto y 📱 número, y filtros por los dos.

## Dónde se configura

CRM → (admin) Herramientas → **Productos y números**: productos (nombre,
número, IDs de anuncio, palabras clave, precio, notas, secuencia, bienvenida) y
números (nombre, Phone number ID, WABA, catálogo, secreto del token, marca).

## Poner en marcha

1. Aplicar `migrations/0045_crm_v45.sql` a mano en D1 (**antes** del deploy:
   los crons de toques y carrito ya filtran por `linea_id`).
2. Deploy.
3. En WhatsApp Manager, el número nuevo con el mismo webhook y suscrito a
   `messages`; el token del sistema con acceso a ese número.
4. Crear los productos con sus IDs de anuncio y palabras; sus respuestas
   rápidas, su bienvenida y su secuencia.

## Escalar a otra marca

Otro número = otra línea (marca en el campo `marca`). Si algún día una marca
necesita su propio equipo o datos aparte, el corte natural es filtrar por
línea (ya existe `?linea=` en la lista y en el asesor); no hace falta otro CRM.

## Segundo número (URO) — checklist

1. Meta Business Manager (el mismo de Tarot): WhatsApp Manager → crear **otra
   WABA** "URO" y agregarle el número nuevo (que NO esté en la app de
   WhatsApp ni en WhatsApp Business; si lo está, borrar esa cuenta antes).
   Nombre visible "URO…" (Meta lo aprueba), método de pago en la WABA.
2. Usuario del sistema (el del `WHATSAPP_TOKEN`): darle la WABA nueva como
   activo con control total. Así sirve el mismo token. Si no, token propio:
   `npx wrangler secret put WHATSAPP_TOKEN_URO` y ese nombre en la línea.
3. Suscribir la app a la WABA nueva (`POST /{WABA_URO}/subscribed_apps`) para
   que sus mensajes lleguen al mismo webhook.
4. Registrar el número en Cloud API (`POST /{PHONE_ID}/register` con PIN de 6 dígitos).
5. Página de Facebook de URO conectada a ese número (para Click to WhatsApp).
6. CRM → Productos y números: la línea con Phone number ID, **WABA**,
   **píxel** (`1788156381816025`) y catálogo si hay; el producto URO en esa
   línea con color, IDs de anuncio y palabras ("uro", "probiótico").
7. Migraciones `0045` y `0046` aplicadas a mano antes del deploy.

Sin WABA propia la línea no lista plantillas ni manda CAPI (nunca cae a la de
Tarot). Sin píxel, los eventos sin clic de anuncio de esa línea no salen.
