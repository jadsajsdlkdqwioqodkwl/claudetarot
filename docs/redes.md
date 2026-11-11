# Comentarios de Facebook e Instagram: respuesta automática

> Pedido del dueño, 2026-11-11. Código: `src/lib/redes.js`, `src/api/meta-webhook.js`, `src/api/crm/redes.js`,
> panel en CRM → Herramientas → «Comentarios de Facebook e Instagram». Prueba: `scripts/test-redes.mjs`.

## Qué hace
1. Alguien comenta un post o anuncio de la página (Facebook) o de la cuenta (Instagram) con una **palabra clave**
   (precio, info, cuánto, me interesa, DM, envío…; la lista se edita en el panel).
2. Se le **responde el comentario** en público: «¡Hola! ✨ Te envíe los detalles 📩📩».
3. Le llega **un mensaje privado** (private reply) con la info del kit, la web y el WhatsApp.
4. Si después escribe por mensaje directo, le llega **la foto del kit** una sola vez (`public/redes/kit-tarot.jpg`).

Todo editable en el panel: prender/apagar (y por red), palabras, los dos textos y la foto. El panel muestra los últimos
30 comentarios vistos y qué se hizo con cada uno.

## Límites de Meta (no se pueden saltar)
- **Gratis:** Messenger e Instagram no cobran por mensaje (solo WhatsApp cobra plantillas).
- **Un solo mensaje privado por comentario**, dentro de los 7 días del comentario. Por eso la foto sale recién cuando la
  persona escribe por DM (ahí se abre su ventana de 24 h). Texto + foto juntos en el primer mensaje no se puede.
- Solo comentarios de publicaciones y anuncios **de la página o cuenta propia**.
- La página nunca se responde a sí misma, y cada comentario se responde una sola vez aunque Meta reintente el webhook.

## Conexión (una sola vez)
1. **Instagram**: la cuenta debe ser profesional y estar vinculada a la página de Facebook. En la app de Instagram:
   Configuración → Mensajes → «Permitir acceso a los mensajes» (herramientas conectadas) prendido.
2. **App de Meta** (developers.facebook.com; lo más simple es la misma app de WhatsApp, así la firma ya funciona):
   agregar los productos **Messenger**, **Instagram** (API con inicio de sesión de Facebook) y **Webhooks**.
3. **Permisos** de la app: `pages_show_list`, `pages_read_engagement`, `pages_manage_engagement`,
   `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_comments`,
   `instagram_manage_messages`. Para responder y escribirle a cualquier persona (no solo a quienes tienen un rol en la
   app) Meta pide **acceso avanzado**, es decir, pasar la **Revisión de la app** con un video corto de cómo se usa.
   La empresa ya está verificada si se usa la misma app y el mismo portfolio de WhatsApp.
4. **Token**: en Business Manager → Usuarios del sistema, al mismo usuario del sistema de WhatsApp asignarle la página
   y la cuenta de Instagram, y generar un token de esa app con los permisos de arriba (no vence). Pegarlo en el panel
   (Herramientas → Comentarios… → Conexión con Meta → «Token de la página»). Se guarda y nunca se vuelve a mostrar.
   Si la app NO es la de WhatsApp, pegar también su «Clave secreta de la app».
5. **Webhooks** en la app: URL `https://kit-tarot-para-principiantes.tarotperu.store/api/meta/webhook` y el token de
   verificación que muestra el panel. Suscribir el objeto **Page** a `feed` y `messages`, y el objeto **Instagram** a
   `comments` y `messages`.
6. En el panel: «Suscribir la página a la app» (hace `POST /{page-id}/subscribed_apps?subscribed_fields=feed,messages`).
7. Probar: comentar «precio» desde otra cuenta (con un rol en la app mientras no esté aprobada la revisión).

## Datos
- Tabla `redes_comentarios` (migración `0078`, aplicada en D1 el 2026-11-11): un registro por comentario visto
  (UNIQUE plataforma + comment_id), con la palabra que lo activó, si se respondió, si salió el mensaje privado y la foto,
  y el error de Meta si lo hubo.
- Ajustes en `crm_settings`: `redes_auto` (config JSON), `redes_token`, `redes_app_secret`, `redes_verify_token`,
  `redes_cuentas` (id de la página y de su Instagram, para no responderse a sí misma). También valen los secretos del
  Worker `META_PAGE_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN` (mandan sobre el panel).
