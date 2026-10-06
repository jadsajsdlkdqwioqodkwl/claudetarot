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
- **Solo Tarot Store**: toques 2/7/14/30, carrito abandonado, el evento de
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
