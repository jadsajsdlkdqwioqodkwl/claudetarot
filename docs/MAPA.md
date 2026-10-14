# Mapa: qué hay, cómo se conecta y qué NO se mueve

> **Reglas de interfaz del dueño** (detalle en `CLAUDE.md`): sin emojis en la interfaz del CRM, siempre iconos (`public/crm/icons.js`); no borrar ni esconder funciones sin preguntar; el cronómetro de la ventana de 24 h va al lado del nombre y teléfono del cliente.
>
> **Regla del dueño sobre este MAPA: no se remueve nada.** Solo se agrega o se corrige; si algo se quita del sistema se anota que se quitó (y cuándo), conservando su historia.

Este es el documento del workflow. Léelo antes de mover, renombrar o borrar
cualquier archivo, documento, hoja, pestaña, columna o Routine. **Todo cambio
al workflow actualiza este mapa en el mismo commit** y suma una línea al
"Registro de cambios" del final.

## 🔒 No mover, no renombrar, no recrear

| Cosa | Dónde | Quién depende de ella |
|---|---|---|
| **Brief de anuncios (versión viva)** | Google Doc `1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0` | Projects de claude.ai (por su link), `creativos/instrucciones.md`, `creativos/copy-meta.md`, Routine de voz del cliente. Se edita siempre el mismo Doc (conector Google Docs); nunca crear otro |
| Brief (copia en repo) | `docs/anuncios/brief-avatar-oferta.md` | Respaldo y fuente inicial de la Routine del brief |
| **Bitácora CRO Tarot** | Google Doc en Drive (el Director CRO lo recrea cada día y manda el viejo a la papelera; se busca por título) | Director CRO, Routine del brief |
| **Hoja de creativos** | Sheet `19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY` | Project de conceptos, skill `creativos`, Routine de voz del cliente. Pestañas y columnas en `.claude/skills/creativos/SKILL.md`; no reordenar columnas (las nuevas van al final) |
| Pestaña **Formatos** | en la hoja de creativos | Project (elige formatos por familia), REVISA COMENTARIOS (Estado), `desde-hoja.mjs` (lista "No usar" copiada en el script). Sus fórmulas leen Prompts K y Ángulos C e I |
| Pestaña **Avatares** | en la hoja de creativos | Project de conceptos (reparto de cada lote), Routine de voz del cliente (suma chats y avatares nuevos), REVISA COMENTARIOS (Estado). Las fórmulas de Cobertura leen Prompts col. D, J y L |
| Hoja de chats del CRM (TAROT CHATS - VENTAS CRM) | la escribe el Worker cada 10 min | `apps-script/ASESOR.gs`, `preparar.py` (modo xlsx) |
| Reglas del negocio | `docs/negocio.md` | Todo lo que escribe a clientes o anuncios (precios y regalos mandan aquí) |
| Scripts del asesor | `scripts/asesor/*.py` | Todas las Routines del asesor y del director (rutas fijas en sus prompts) |
| API del asesor | `https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/*` + clave `ASESOR_CLAVE` | Scripts del asesor |
| Skills | `.claude/skills/*` (ver su README) | Routines y sesiones de Claude Code |
| Pausa "escribiendo…" | `src/lib/crm-send.js` | Regla del dueño, ver `CLAUDE.md` |
| **Números y productos del CRM** | D1: tablas `lineas` y `productos` (CRM → Herramientas → Productos y números) | Webhook (a qué número escribió y de qué producto es), envíos, CAPI. URO = app de Meta "WSP API 2DA ECOMMERCE", WABA `1608866757469431`, Phone number ID `1293522693852278` (+51 940 028 332), píxel `1788156381816025`, secretos `WHATSAPP_TOKEN_URO`, `WHATSAPP_APP_SECRET_2`, `WHATSAPP_VERIFY_TOKEN_2`. Ver `docs/productos-y-numeros.md` |
| Reglas de URO | `docs/uro/negocio.md` | Vendedoras de URO, textos de URO (no aplican las de Tarot) |
| Instrucciones de vendedoras | `docs/vendedoras.md` | Cuentas nuevas (entrar, contraseña, Telegram) |

## Routines (claude.ai → Routines), hora de Lima

| Routine | Hora | Qué hace | Dónde deja el resultado |
|---|---|---|---|
| Director de marketing y CRO | 7:52 | Embudo 7 días, chats perdidos y sin respuesta, fatiga de anuncios en Meta, experimentos | Telegram al dueño + CRM → Reportes; propuestas en CRM → ✨ Sugerencias; Doc "Bitácora CRO Tarot"; memoria (`memoria.py`) |
| Asesor — reporte de pedidos | 10:30 | PDF de pedidos a despachar, links de seguimiento, boletas | Telegram (dueño y Danitza) + CRM → Reportes |
| Asesor — mensajes y cierre | 11:30, 16:30, 22:30 | Seguimientos para las vendedoras; a las 22:30 cierra el reporte | Telegram a cada vendedora; CRM |
| **Voz del cliente → brief y ángulos** | 11:56 | Chats del día → brief (Google Doc) + pestañas Voz del cliente y Avatares | Doc del brief, hoja de creativos, Telegram al dueño. Pasos: `docs/anuncios/voz-del-cliente.md` (usa `docs/anuncios/rutina-brief-drive.md`) |
| Asesor — reporte de ventas | 21:00 | Ventas del día, mensajes de seguimiento | Telegram + Drive |
| Asesor — reporte A PEDIDO | a mano | Igual que el de 10:30, cuando el dueño lo pide | Telegram |
| Asesor — rescate de lead 1 | 9:47 | Decide a quién de los chats pasados (fuera de su ventana de 7 días) mandarle el rescate 1 (regla 10 de `CLAUDE.md`) | Sale solo por `POST /api/asesor/rescates` |
| Coaching y voz del cliente (semanal) | lunes 7:37 | Análisis por chat, coaching por vendedora, variantes | CRM → Reportes y ✨ Sugerencias |
| **Asesor — reporte de ventas (22:00 · 23:00 · 00:00)** | 22:00, 23:00, 00:00 | Ventas del día (a las 00:00, del día que cerró), por vendedora, Lima/provincia, kits, adelantos y saldos; qué cambió desde la hora anterior. No propone mensajes | CRM → Reportes (`enviar.py --informe`). Agregada 2026-10-13 a pedido del dueño |

**2026-10-13: al pasar la cuenta al plan Team se borraron todas las Routines** y se recrearon desde Claude Code (entorno «Default»). Los prompts quedan en `docs/routines.md` (si se vuelven a perder, se recrean con ese archivo). La clave del asesor ya no va en el prompt: es la variable de entorno `ASESOR_CLAVE` del entorno de la nube. Los conectores (Drive, Sheets, Docs, Meta) se agregan a cada Routine desde claude.ai → Routines → Editar.

**Entorno de la nube de las Routines (claude.ai → Claude Code → entorno «Default» → Editar)**, todo esto es necesario o las Routines fallan:
- Variable de entorno `ASESOR_CLAVE` (la clave del asesor; el Worker solo guarda su SHA-256 en `wrangler.jsonc` → `ASESOR_CLAVE_SHA256`, así que la clave no se puede leer de Cloudflare: está también en Apps Script → Propiedades del script `ASESOR_CLAVE`; si se pierde, se crea una nueva y se cambia el SHA-256 en `wrangler.jsonc`, la variable del entorno y la propiedad del Apps Script). `GEMINI_API_KEY` para los anuncios.
- Acceso a la red: dominio permitido `kit-tarot-para-principiantes.tarotperu.store` (la API del asesor; el entorno nuevo lo bloqueaba). Para que Claude Code despliegue o aplique migraciones de D1: `api.cloudflare.com` y la variable `CLOUDFLARE_API_TOKEN` (token de Cloudflare con permisos de Workers y D1). Para los anuncios: `generativelanguage.googleapis.com`.
- **Todo cambio en una Routine (nueva, borrada, otra hora, otro prompt) se anota aquí y en `docs/routines.md` en el mismo commit**, para poder recrearlas si se vuelven a perder.

Conectores que necesitan (se agregan en claude.ai → Routines → Editar):
Director CRO → Google Drive y Meta. Voz del cliente → Google Docs, Google
Drive y Google Sheets. Las del asesor → Google Drive.

## Cómo fluye todo

    Chats de WhatsApp (CRM / Worker)
      ├─ Asesor (11:30·16:30·21:00·22:30) → seguimientos y pedidos → vendedoras / PDF
      ├─ Director CRO (7:52) → informe + experimentos → Sugerencias del CRM
      └─ Voz del cliente (11:56) → Brief (Google Doc) + Voz del cliente + Avatares
                                          │
              Project de conceptos (claude.ai) lee Instrucciones, Reglas,
              Avatares (Cobertura), Voz del cliente, Ángulos y el brief
              → escribe en Prompts (col. L = avatar)
                                          │
              Claude Code (skill creativos, prompt maestro) → imágenes
              Flash 1080×1350 → Creativos + Copy Meta + Ángulos
                                          │
              Dueño califica (Creativos y Copy Meta) → "REVISA COMENTARIOS"
              → Reglas, Instrucciones, Copy reglas, Avatares (Estado), creativos/brief.md

## Plantillas de Meta: dónde se ven y quién las manda

CRM → Herramientas → **Plantillas para Meta** (solo admin): muestra, por marca (Tarot Store / URO), el texto exacto, categoría, botones y estado en Meta de cada plantilla propuesta (recojo en Shalom primero, rescate de interesado, toques). El botón «Mandar a Meta» las crea en la WABA de ese número. **Seguimiento de una plantilla (lápiz en el botón de plantillas del chat, solo admin):** «después de mandar esta plantilla, programa estas otras a los N días» (ajuste `plantillas_seguimiento`, `src/lib/plantillas-seguimiento.js`); de fábrica el aviso de envío de cada marca arrastra sus 3 recojos. Las respuestas rápidas también aceptan pasos de plantilla en su seguimiento (sale en días, aunque la ventana ya cerró). La vista previa estilo WhatsApp se ve en las tarjetas, al editar y al mandar. **Flujo del envío por Shalom:** la vendedora manda la plantilla «Aviso de envío» (`aviso_envio_shalom` / `uro_aviso_envio_shalom`, dos botones) desde el botón de plantillas del chat → el cliente toca un botón y se abre su ventana → ella manda la boleta → **al mandar el aviso** el CRM ya deja programados los 3 recordatorios de recojo (4, 7 y 21 días contados desde hoy, no desde el último mensaje del cliente); si el cliente responde se recuentan desde su mensaje, y con «Ya lo recogí» el plan termina. **Sin plantilla** (boleta mandada dentro de las 24 h): botón «Programar recojo en Shalom» del panel derecho del chat, mismos 4/7/21 desde hoy. Los textos de origen viven en `src/lib/planes-plantilla.js` (planes) y `src/lib/toques.js` (toques); el admin puede **editar el texto y los botones desde esa pantalla** (ajuste `plantillas_textos` en `crm_settings`, manda sobre el código) mientras la plantilla esté «Sin enviar». **Aviso de aprobación:** el cron de 15 min (`vigilarPlantillas`) compara el estado en Meta con el último guardado (`plantillas_estados`) y manda un Telegram al dueño cuando una plantilla se aprueba o se rechaza (con el motivo); de paso deja el estado listo para los planes y toques. Una ya enviada a Meta no se puede cambiar con el mismo nombre: hace falta un nombre nuevo. Ojo: el texto de vista previa de los pasos ya programados sigue siendo el original; lo que le llega al cliente es el de la plantilla aprobada. URO usa el prefijo `uro_` / `toque_u_` y no nombra síntomas (tema íntimo; el aviso se ve en la pantalla de bloqueo).

## Seguimientos del CRM: qué corre y qué no (auditoría 2026-10-10)

| Seguimiento | Estado | Notas |
|---|---|---|
| Bienvenida de anuncio (Tarot y URO) | ✅ funciona | Solo chat **nuevo** con clic de anuncio (`ctwa_clid`). Por producto/línea (`pasosDelChat`); sale por el número del chat |
| Seguimiento automático 24 h (3 h y 20 h) | ✅ funciona | URO usa la secuencia de su producto; Tarot la general (`ad_followup_sequence_id`). Tope de 2 sin respuesta |
| Respuestas rápidas con seguimiento | ✅ funciona | Las de URO no traen seguimiento. En chats de otro número ya no salen las generales (de Tarot) salvo buscando |
| Planes con plantilla (recojo Shalom, rescate) | ✅ manual + cadena | Siempre por aprobar del admin. Etapa 1 (solo saludo) ya no genera cadena |
| Pedido web a los 3 min | ✅ solo Tarot | Ya solo mira el último mensaje del chat de Tarot |
| **Toques** Tarot (`d2…post60`) y URO (`u_…`) (`toques.js`) | ✅ prendidos (2026-10-10) | Cron `minuto % 5 = 2`, `TOQUES` en `wrangler.jsonc`. Requieren `migrations/0043` aplicada a mano y la plantilla **aprobada en Meta** (se mandan desde CRM → Herramientas → Plantillas para Meta; nada sale solo a Meta). Grupo de control: chats con id múltiplo de 5 |
| Carrito abandonado | ⏸ apagado | `CARRITO_AUTO_HORAS` vacío; al prenderlo ya excluye otras líneas |
| Link de envío de Shalom (página TS-…, «Links de Shalom») | 🗑 deprecado | Botón del chat, ruta `/api/crm/link-envio` y botón «Links de Shalom» ya no están en la pantalla. El código de `shalom.js`/`crm-links-envio.js` sigue (lo usa el flujo de saldos); borrar cuando se confirme |
| Recomendación con el timer en 0 | ✅ | Desaparece y el bot deja un plan con plantilla por aprobar: rescate (no compró, etapa 2+) o recojo Shalom (compró y es de provincia) |
| Mensaje masivo | ⏸ apagado | El servidor lo rechaza; el formulario ya no se muestra |

Pendiente (no tocado, ver informe): doble bienvenida si los avisos llegan por las dos apps de Meta (sin índice único en `messages.wa_message_id`); sugerencias del asesor y `asesor-resumen` buscan el chat por teléfono sin distinguir línea; `CLAUDE.md` dice 1,5 s de "escribiendo…" pero el código usa 2 s / 1,5 s / 1 s (rápidas y bienvenida).

## Dónde ver cada cosa

- Informe CRO del día: Telegram (te llega a ti) y CRM → Reportes.
- Experimentos y su historia: Drive → "Bitácora CRO Tarot".
- Brief al día: el Google Doc del brief.
- Anuncios para calificar: hoja de creativos → Creativos y Copy Meta.
- Qué avatares faltan probar: hoja de creativos → Avatares → Cobertura (rojo = 0).

## Registro de cambios (lo más nuevo arriba)

- 2026-10-14 · Ventana gratis del anuncio: el dueño corrige que hoy son **7 días** (no 72 h). Se actualizó `docs/whatsapp-ventanas-y-costos.md` (y las menciones en `.claude/skills/sms/SKILL.md` y `.claude/skills/README.md`), conservando la nota de que antes decía 72 h. Con esto el rescate automático del día 7 (`src/lib/rescate-lead.js`, 6 días + 18 h desde el inicio del chat) cae dentro de la ventana gratis; no se cambió código. Los 200 rescates del 11–13/10 que fallaron por las variables siguen en «fallido» (no se reprogramaron).
- 2026-10-13 · Chip «Reactivar seguimiento» en la burbuja: todo mensaje que salió de una respuesta rápida con «si no responde» guarda `messages.quick_reply_id` (migración `0054`, aplicada en D1 el 2026-10-13); `leerMensajes` devuelve `con_seguimiento` y el chat pinta el chip. Tocarlo llama `POST /api/crm/followup-rapida` → `programarSeguimientoDeRapida`, que ahora devuelve el motivo cuando no programa (ventana de 23 h, ya compró, seguimiento manual pendiente, ajuste apagado) en vez de callar. Lo que cancela ese seguimiento sigue igual: cualquier mensaje nuestro posterior (`cancelarSeguimientosDeLead`). Mensajes anteriores a esta fecha no tienen chip (no se sabe de qué rápida salieron).
- 2026-10-13 · Prueba de las 8 Routines a pedido del dueño (19:44 Lima). Todas entran a la API con la clave nueva y clonan el repo; los conectores de Drive, Sheets y Meta Ads responden. ARREGLADO: `GET /api/asesor/anuncios` daba error 1101 (mismas líneas de «promesas» pegadas por error en `onRequestGetAnuncios` y `onRequestGetPedidosWeb`, `src/api/asesor-datos.js`, usando `url` sin definir; se quitaron de las dos, solo van en `/api/asesor/chats`). ARREGLADO: `promesas.py` tomaba «envío totalmente GRATIS a domicilio» como promesa de un extra (⚠️ VERIFICAR falso); ahora `RE_ENVIO_GRATIS` cubre cualquier forma de envío/delivery gratis. OJO, lección: el texto que se agrega con «fire_trigger» llega como un SEGUNDO mensaje; tres Routines (rescate 1, reporte de pedidos 10:30 y semanal) ya habían empezado la corrida REAL antes de leer «es prueba»: se programaron 5 rescates 1 (dentro del tope), el PDF de pedidos del 14/10 llegó 3 veces al dueño y a Danitza, se registraron 5 ventas de provincia con ventas.py, y el semanal dejó 3 variantes + 1 respuesta rápida en ✨ Sugerencias, su informe en Reportes y 2 lecciones en la memoria. Para probar sin efectos: sesión nueva con un prompt de prueba propio (no fire_trigger), o `--prueba` en enviar.py dentro del prompt.
- 2026-10-13 · ARREGLADO: el rescate del día 7 NUNCA había salido (desde el 11/10, 200 de 200 «fallido»). La plantilla `rescate_lead_1` aprobada en Meta no lleva variables (se editó: «Hola estimad@ 🩷🤗…»), pero se programaba con 2 (`[nombre, producto]`) y Meta rechaza el envío (#132000). Ahora `plantillaAprobada()` (`src/lib/plantillas.js`) guarda cuántas variables lleva el texto APROBADO (5.º campo del caché `plantilla_estado:*`, también lo escribe `vigilarPlantillas`) y el cron (`src/lib/crm-cron.js`) manda exactamente esa cantidad: quita las que sobran y completa las que faltan con el primer nombre y «el kit de tarot». Vale para toda plantilla editada después de programarla. Los ~473 rescates pendientes salen con este arreglo; los 200 ya fallidos no se reprograman solos. Además: el brief (Google Doc) no se actualiza desde el 06/10 porque las Routines no tienen conector de Google Docs (el de Drive no puede reemplazar el contenido de un Doc) y la pestaña «Voz del cliente» está vacía.
- 2026-10-13 · Prueba completa del reporte de pedidos (sin enviar): con la clave nueva la API responde 200, leyó 346 chats y armó el PDF (31 pedidos para el 14/10). Arreglado: `GET /api/asesor/pedidos-web` daba siempre HTTP 500 (usaba `url` sin definirla en `onRequestGetPedidosWeb`, `src/api/asesor-datos.js`), así que el PDF salía sin la sección «Pedidos de la web». Las sesiones de las Routines no traen conectores (Drive, Meta, Sheets): se agregan en claude.ai → Routines → Editar.
- 2026-10-13 · Clave del asesor nueva (la elige el dueño; está solo en la variable `ASESOR_CLAVE` del entorno «Default» de Claude Code): `ASESOR_CLAVE_SHA256` en `wrangler.jsonc` acepta ahora VARIOS SHA-256 separados por coma (`src/api/asesor.js`); se agregó el de la clave nueva (`07fa0300…`) y se conserva el viejo (`b22840…`, cuya clave se perdió con las Routines borradas) por si algo aún lo usa. `account_id` en `wrangler.jsonc` (cuenta `d0c6550b43c7a966eb8e93a69a653993`) para que wrangler funcione con el token de cuenta `CLOUDFLARE_API_TOKEN` del entorno. El dueño aprobó también volver a prender «Asesor — reporte de pedidos» (10:30).
- 2026-10-13 · Primera corrida de prueba del «reporte A PEDIDO» (sin enviar nada): la red ya sale bien al CRM, la variable `ASESOR_CLAVE` llega a la sesión, pero el Worker la rechaza (401): tiene 64 caracteres, como el SHA-256 de `wrangler.jsonc`, así que probablemente se pegó el hash en vez de la clave. Además, las Routines creadas desde Claude Code no traen el repo adjunto y ahí no existen `add_repo` ni `gh repo clone`; `git clone` por HTTPS sí funciona: se cambió el inicio de los 9 prompts (ver `docs/routines.md`) para clonar así y para avisar claro si la clave es incorrecta. Ojo: «Asesor — reporte de pedidos» (10:30) quedó desactivado (enabled=false) desde las 22:28 del 13/10; no se reactivó sin preguntar al dueño.
- 2026-10-13 · Routines recreadas tras pasar la cuenta al plan Team (se habían borrado todas): las 8 de la tabla de arriba más una nueva, «Asesor — reporte de ventas (22:00 · 23:00 · 00:00)», que pidió el dueño. Prompts e IDs en `docs/routines.md`. La clave del asesor pasa del prompt a la variable `ASESOR_CLAVE` del entorno; el entorno nuevo no deja salir a `kit-tarot-para-principiantes.tarotperu.store` ni a `api.cloudflare.com` hasta que el dueño los permita.
- 2026-10-13 · Rescate del día 7 con plantilla elegible y «Reactivar seguimiento» con vista previa: (1) Herramientas → «Rescate de lead del día 7» tiene un selector por marca (Tarot y URO, solo plantillas aprobadas) para elegir qué plantilla sale el día 7 (ajuste `rescate7_plantillas`, `elegirPlantillaDia7` en `rescate-lead.js`, API `/api/crm/pausa` {rescate7_plantilla:{marca,nombre}}); al cambiarla también cambia en los ya agendados que no salieron; las variables de una plantilla elegida las arma el cron al mandarla (`parametrosDePlantilla`); de fábrica sigue `rescate_lead_1` / `uro_rescate_lead_1`. Al marcar COMPRA se cancela también un rescate del día 7 con otra plantilla (`created_by` «Automático (día 7)»). El rescate 1 que decide el asesor sigue siendo `rescate_lead_1`. (2) DEPRECADO por el dueño: «Mandar secuencias completas» / «Mandar toda la secuencia» (ajuste `siempre_global`, `siempreGlobal()` en `crm-db.js`): se quitaron el checkbox de Herramientas, la escritura en la API y la función; lo que ya estaba programado con `mandar_siempre` sigue igual, y siguen la casilla «Se manda sí o sí» de un mensaje suelto y la de «siempre» del seguimiento de una plantilla. (3) El botón «Reactivar seguimiento» de la burbuja sale solo si la respuesta rápida tiene algún paso de seguimiento PRENDIDO (antes contaba los apagados) y una sola vez por respuesta rápida (en su última burbuja); al tocarlo abre una ventana con los pasos que se programarán (texto, plantilla o archivo y su espera) para editarlos o quitar alguno solo en ese chat (`GET /api/crm/followup-rapida`, `pasos` en el POST, `pasosDeSeguimientoRapida`). Sin migraciones.
- 2026-10-13 · Plantillas y botones también en el asesor y en «Programar seguimiento»: (1) `POST /api/crm/scheduled` acepta `template_name` (+ `template_params`, `template_language`); la plantilla no tiene el límite de 24 h (el cron arma las variables solo si no vienen). (2) Cada mensaje de una sugerencia del asesor (el 1 y los pasos «si no responde») puede llevar una plantilla (`plantilla: {name, language, params}`) y hasta 3 botones; salen por `programar()` en `sugerencias.js` (misma pausa «escribiendo…» vía `mandarConEscribiendo`/`mandarTexto`). `normalizarPasos` (`asesor.js`) conserva `plantilla` y `botones`. (3) Selector con buscador para el celular (`elegirMensaje()` en `app.js`, hoja `#modal-selector-fondo`) en lugar del `<select>` nativo: junta respuestas rápidas y plantillas aprobadas; el `<select id="seg-rapida">` sigue en el HTML, oculto, porque el resto del modal lo lee. Sin migraciones.
- 2026-10-12 · Rescate del día 7 y seguimientos apilables: (1) al marcar COMPRA (`agregarEtiquetaMeta(..., "purchase")`, `crm-db.js`) se cancelan de una vez los rescates `rescate_lead_*` pendientes o por aprobar de ese chat (antes solo los cancelaba el cron al vencer). (2) CORREGIDO el mismo día por el dueño: NO es día 6,5, sigue en día 6 + 18 h desde `conversations.created_at`; lo único que importa es que salga dentro de los 7 días. Si si cae entre 23:30 y 06:00, `acomodarAlHorario` lo ADELANTA a las 23:29 en vez de correrlo a las 06:00 cuando eso lo sacaría de los 7 días, y si tampoco hay hora de día dentro de la ventana sale de madrugada (no se cancela) (solo los de origen «Automático (día 7)»; los del asesor, ya fuera de ventana, siguen igual). Se ancla en el inicio del chat, que nunca pasa del último mensaje del cliente, así que queda dentro de la ventana gratis en cualquier caso. (3) Apilables: las plantillas (rescate del día 7, planes) ya no cuentan como seguimiento «manual» en `programarSeguimientoDeRapida`; un lead puede tener el seguimiento de respuesta rápida (texto) y el rescate de 7 días a la vez.
- 2026-10-11 · Botones de respuesta (hasta 3, 20 caracteres) en mensajes de texto: al escribir un mensaje (clip → «Botones de respuesta»), en las respuestas rápidas y en sus pasos de seguimiento, y en los seguimientos programados a mano. Salen como mensaje interactivo por `mandarTexto` (misma pausa «escribiendo…»), solo con texto y dentro de las 24 h. Columnas `quick_replies.botones` y `scheduled_messages.botones` (migración `0050`; la de `scheduled_messages` ya existía en producción, la de `quick_replies` se aplicó el 2026-10-11). Iconos con color según lo que significan (estrella ámbar, reloj verde azulado, etc.; clase `ic-nombre` en `icons.js`, reglas al final de `style.css`).

- 2026-10-10 · Seguimiento por plantilla (lápiz), pasos de plantilla en respuestas rápidas, vista previa estilo WhatsApp de las plantillas y galería de fotos del catálogo para todo el equipo (menú «⋯» y panel de catálogo del chat). Ojo D1: un patrón LIKE de más de 50 bytes falla (`LIKE or GLOB pattern too complex`); usar `instr(col, texto) = 1`.

- 2026-10-10 · Chats separados por número: el bloqueo pasó de la persona al chat (`conversations.blocked`, migración `0049` aplicada en D1; antes bloquear a alguien en Tarot le escondía su chat de URO y descartaba sus mensajes). Botón «Su chat de …» en el panel para saltar entre los dos chats del mismo cliente. Lo que sigue compartido por persona: nombre, notas y código de Shalom. Plantillas: el chat muestra el texto real con sus botones (no solo el nombre) y la lista de plantillas se reordena arrastrando (orden compartido por el equipo, ajuste `plantillas_orden`); las respuestas rápidas ya se ordenaban así.

- 2026-10-10 · Producto «Tarot» en el número principal (migración `0048`, aplicada en D1) y respuestas rápidas combinadas de todos los productos por defecto (casilla «Solo las de este producto» para filtrar); el recojo en Shalom cuenta desde el despacho y se programa solo al mandar el aviso de envío o con el botón del chat.

- 2026-10-10 · Plantillas: de 0 a 3 botones, tipo de mensaje elegible (Marketing o Utilidad; se muestra si Meta la reclasificó). Interfaz sin emojis (iconos nuevos: caja, teléfono, matraz, bombilla, ayuda, enlace) con chequeo automático; cronómetro otra vez junto al teléfono; se restauran el botón «Links de Shalom», la etiqueta «Contacto» y el formulario de mensaje masivo, que yo había ocultado sin que me lo pidieran.

- 2026-10-10 · Aviso por Telegram cuando Meta aprueba o rechaza una plantilla propuesta (`vigilarPlantillas`, cron de 15 min); probado con un Meta simulado (`META_GRAPH_URL` y `TELEGRAM_API_URL`, solo para pruebas locales).

- 2026-10-10 · Plantillas editables desde el CRM (texto y botones, con las reglas de Meta validadas) antes de mandarlas a aprobar.

- 2026-10-10 · Aviso de envío por Shalom (plantilla de 2 botones que reabre la ventana para mandar la boleta) y recojo 4/7/21 que arranca solo cuando el cliente responde (`activarPlanTrasAviso`, `rearmarPlanShalom`).

- 2026-10-10 · Plantillas por marca y toques prendidos: pantalla «Plantillas para Meta» (el admin ve y manda cada plantilla; ya no se crean solas), textos propios de URO, toques de Tarot y URO conectados al cron (aplicar `0043`), plan con plantilla cuando el timer de una recomendación llega a 0, el cron de seguimientos espera a que Meta apruebe la plantilla, cronómetro en una franja sobre el chat, link de envío de Shalom deprecado (UI y ruta), y se revierte «secuencia de producto = lead» (lead y compra son manuales).

- 2026-10-10 · Auditoría del CRM (sandbox local + código). Arreglado: header del admin desbordado en escritorio (acciones secundarias siempre en «⋯»); botón de reaccionar tapaba el mensaje en móvil; filtros en una sola fila en móvil; etiqueta «Contacto» y badge de número repetido fuera de la lista; Interés/venta de un chat de URO ya no mandan «Kit Tarot S/89» a Meta (usan el producto del chat); formulario de mensaje masivo oculto (está apagado). Servidor: un error de D1 ya no manda un chat de URO por el número de Tarot (`lineas.js`); secuencia de producto aplicada a mano cuenta como lead; producto sin secuencia cae a la general en Tarot; pedido web y CAPI no mezclan líneas; catálogo del cron usa el de la línea; cadena de rescate salta etapa 1; resumen fallido ya no bloquea el embudo. Ver tabla «Seguimientos del CRM».

- 2026-10-11 · Rescate de lead (`src/lib/rescate-lead.js`): (1) a los 7 días del inicio del chat (`conversations.created_at`, la ventana de 7 días de Meta tras el clic) sale `rescate_lead_2` (`uro_rescate_lead_2` en URO) a TODOS los contactos que no compraron, sin excepción salvo chat bloqueado, killswitch del chat (`pausa_auto`) o ya programado antes (aunque lo hayan cancelado); sale solo (`pendiente`, `mandar_siempre`), cron de 15 min; solo chats cuyo día 7 cae después de activarlo (ajuste `rescate7_desde`, para no escribirle a todo el historial); se apaga con el ajuste `rescate7_auto`=0 y respeta la pausa general. (2) El asesor (Routine) decide a quién mandarle `rescate_lead_1` (fuera de las 24 h) con `rescates` en `salida.json` → `POST /api/asesor/rescates` (clave del asesor), sale solo, tope 15 por envío y 30 por día; es la excepción a «el asesor nunca manda» (regla 10 de `CLAUDE.md`). Fuera de esto, el rescate de 4/7/21 días del chat por vendedora/aprobación sigue igual.

- 2026-10-11 · Corrección del rescate de lead (el anterior de este día mandaba el rescate 2 a los 7 días; así quedó, sin borrar la nota anterior): `src/lib/rescate-lead.js` agenda el RESCATE 1 (`rescate_lead_1`, `uro_rescate_lead_1` en URO) a TODO contacto que no compró y está dentro de su ventana gratis de 7 días del anuncio, para el final de esa ventana (día 6 + 18 h desde `conversations.created_at`), sin importar si respondió o si le escribimos; los que llegan después se agendan solos (cron de 15 min); si compra antes, `crm-cron.js` lo cancela; chat bloqueado o con killswitch no lo recibe. Interruptor «Rescate de lead del día 7» en Herramientas (muestra PRENDIDO/APAGADO, cuántos agendados y cuándo sale el próximo; al prenderlo agenda de una vez; ajuste `rescate7_auto`; API `/api/crm/pausa` {rescate7}). Ya NO usa el ajuste `rescate7_desde`. El asesor (Routine «Asesor — rescate de lead 1», diaria) revisa los chats pasados, fuera de la ventana, y decide a quién mandarle el mismo rescate 1 (`POST /api/asesor/rescates`).

- 2026-10-11 · Migración `0053_saldo_del_cliente.sql` (ya aplicada en prod): `contacts.saldo` (texto libre, hasta 20 caracteres). En el panel del chat, junto a la casilla «Envío por Olva», una mini casilla «Saldo» donde cualquiera del equipo anota cuánto le falta pagar al cliente (guarda al salir del campo; `PATCH /api/crm/contacts` `{saldo}`). Es solo una nota: no es el flujo de saldos del asesor (`saldos` con código TS-…). Y un filtro «Olva» en la bandeja (junto a Contacto / Interés / Compra) que deja solo los chats marcados como envío por Olva (`GET /api/crm/conversations?olva=1`).

- 2026-10-11 · Colores de fondo por tienda a gusto de cada quien: botón «Colores de las tiendas» (icono paleta, en el menú ⋯ del encabezado, lo ve todo el equipo) con un selector de color para Tarot Store y otro para URO + «Restablecer». Se guarda en el navegador de cada persona (`localStorage` `color_tienda_tarot` / `color_tienda_uro`, variables CSS `--cfondo-tarot` / `--cfondo-uro`), no en el servidor: cada asesor ve el suyo y no cambia lo de los demás. Pinta el fondo del chat abierto y un tinte de la misma tonalidad en la bandeja; por tienda, no por chat. Por defecto lavanda (Tarot) y rosa (URO).

- 2026-10-11 · Editor de respuestas rápidas: el selector «Catálogo completo / un producto» trae los productos del catálogo de la tienda elegida en «Producto» (URO → su catálogo con su token vía `?linea_id=`; Tarot → el principal), y se vuelve a cargar al cambiar de tienda (`productosDelCatalogo(lineaId)` con caché por número en app.js). Antes siempre salían los de Tarot. Los selectores de secuencias de leads y seguimientos siguen con el catálogo principal.

- 2026-10-11 · Caracteres especiales (negrita, cursiva, tachado, monoespaciado) también junto a «Emojis» en los editores de respuestas rápidas, bienvenida, seguimientos y leads (`agregarEmojisA` en app.js, mismos símbolos de WhatsApp que el botón del chat). Y la bandeja pinta de rosa el fondo de los chats de URO (`.conv-item[data-marca="uro"]`), además de la franja y el fondo del chat.

- 2026-10-11 · Enter en el chat hace salto de línea (como al principio, decisión del dueño); solo el botón de enviar manda el mensaje. Había quedado Enter = enviar (Shift+Enter = salto) desde el 29/09 en el cuadro de texto del chat; se quitó ese atajo. Regla nueva en `CLAUDE.md` y arriba de este MAPA: en el MAPA no se remueve nada.

- 2026-10-11 · El chat se distingue por tienda: fondo lavanda + franja violeta arriba + etiqueta TAROT para Tarot Store, fondo rosa + franja rosa + etiqueta URO para URO (`marcaDeChat` en app.js: por producto o por número; sin nada, Tarot). La franja izquierda de la lista usa el color del producto o, sin producto, el de la tienda. Cambiar el producto del panel repinta al instante.

- 2026-10-11 · Mensajes de Tarot duplicados a URO (datos en D1, sin código): las 40 respuestas rápidas generales quedaron copiadas como «URO · …» (producto URO, orden 49–88) con Tarot→URO/frasco y el set de emojis 🩷🤗 (☺️→🤗, 🫶/💛→🩷, ✨🙌 se quedan), con sus seguimientos de pasos y sus horas. Redactadas a mano porque nombraban el kit: Precio?, Seguimiento 1 Lima/provincia, Precio? provincia, «para dónde lo desea», IG, Instagram desconfiado, Tienda física?, 79 precio, Link de envío, y dos que cambiaron de pregunta («Puedo leerme a mí mismo» → «Puedo tomarlo yo misma»; «Es para principiantes?» → «Es para mí?»). Sin copiar: fotos y catálogo de Provincia msj. 2 y Referencias Lima Adelanto (son del kit de Tarot). La secuencia «URO · leads sin respuesta» ahora repite la de Tarot (4 h y 15 h); el paso del regalo y sus copias en seguimientos de respuestas rápidas quedaron APAGADOS (activo=false) hasta que el dueño defina qué regalo da URO; los textos viejos de URO quedaron como pasos 3 y 4 apagados. Por confirmar con el dueño: regalo adicional, descuento S/79, adelanto S/20 + Yape (en URO el negocio dice 100% contra entrega, provincia sin definir) y el link de Instagram de URO (se quitó de las 3 respuestas que lo llevaban).

- 2026-10-11 · «Pedidos del catálogo» de un chat de URO resuelve los nombres con el catálogo y el token de ese número (`catalog.js` GET usa `envDeConversacion`); antes usaba el de Tarot y podía mostrar el código.

- 2026-10-11 · Catálogo de URO: `lineas.catalog_id` de la línea URO = 1406629348332032 («API CATALOG URO CONDE»), puesto directo en D1 (sin cambio de código: `envDeLinea` ya lo pasa como `WHATSAPP_CATALOG_ID` a catálogo, picker de producto, galería de fotos y seguimientos con producto). Para que Meta deje mandarlo, el catálogo tiene que estar conectado al número de URO (WhatsApp Manager → Catálogo) y el token `WHATSAPP_TOKEN_URO` necesita permiso de catálogo.

- 2026-10-11 · Formato de WhatsApp en el chat: botón «Formato» junto a los emojis (negrita `*`, cursiva `_`, tachado `~`, monoespaciado ```) que envuelve lo seleccionado, y atajos Ctrl+B, Ctrl+I, Ctrl+Shift+X (tachado) y Ctrl+Shift+M en cualquier cuadro de texto (`aplicarFormato` en app.js). El servidor no toca esos símbolos: WhatsApp los dibuja en el celular del cliente.

- 2026-10-11 · Bienvenida y seguimiento de interesados por tienda: siempre que sale la bienvenida de anuncios (automática en el webhook o a mano desde el panel, `welcome-send.js`) sale también el seguimiento de interesados de la tienda del chat, aunque el automático esté apagado (`src/lib/crm-interesados.js`: la secuencia del producto o, sin producto, la general solo de la línea principal; reemplaza la ya programada, no se duplica; respeta el killswitch del chat). El panel derecho muestra la tienda del chat y solo los pasos de bienvenida y la secuencia de esa tienda (igual que `pasosDelChat`). `followup-apply.js` marca como seguimiento de interesados también las secuencias de producto (así se cancelan si el cliente escribe).

- 2026-10-11 · Migración `0052_olva_y_pausa_por_chat.sql` (ya aplicada en prod): `contacts.olva` (casilla «Envío por Olva» en el panel del chat, la ve y marca todo el equipo; solo informativa por ahora, no cambia los planes de Shalom) y `conversations.pausa_auto` = killswitch POR CHAT (`chat-estado.js` acciones `pausar_auto`/`reanudar_auto`): cancela lo programado de ese chat, el cron cancela lo automático y las plantillas que venzan, y el webhook no le corre bienvenida, seguimiento automático ni plan tras el aviso de envío; lo que una persona programe a mano sí sale. El killswitch general (arriba) sigue aparte.

- 2026-10-11 · Killswitch y «mandar toda la secuencia» (`src/api/crm/pausa.js`, ajustes `pausa_total` y `siempre_global`): el botón rojo del encabezado se QUITÓ (dueño); la API `/api/crm/pausa` {pausa:true} y el cron que cancela lo que venza mientras esté puesta quedan, sin botón, por si se necesita; el killswitch que se usa es el de cada chat. Antes: cancelaba todo lo programado y, mientras estuviera puesto, el cron cancelaba lo que venciera en vez de mandarlo (no se acumula para salir de golpe al reanudar; la bienvenida, que responde en el momento, no se toca). El checkbox de Herramientas hace que lo que se programe desde entonces (secuencias, respuestas rápidas, planes y seguimiento de plantilla, también el recojo en Shalom) lleve `mandar_siempre`: no lo cancela que el cliente o nosotros escribamos; «Ya lo recogí» sí lo detiene. `siempreGlobal()` en `crm-db.js`.

- 2026-10-11 · Emojis nuevos (🩷 🫶 🤗…) salían como cuadro en Windows sin esa versión de emoji: `index.html` carga Noto Color Emoji (Google Fonts, ya permitido en el CSP) como último recurso de la pila de fuentes de `style.css`; los emojis que el sistema ya tiene se siguen viendo con su estilo propio.

- 2026-10-11 · Stickers/fotos/audios de clientes del número de URO no se veían: `api/crm/media.js` los bajaba de Meta con el token de Tarot; ahora usa `envDeConversacion` (el número del chat). Emojis 🩷 y 🤗 agregados al selector (`EMOJIS` en app.js).

- 2026-10-11 · Orden de los mensajes de los planes con plantilla (recojo en Shalom, rescate): flechas en «Plantillas para Meta» cambian qué plantilla sale a cada día (4/7/21) sin tocar Meta; se guarda en `plantillas_textos` clave `orden:marca:plan` (`guardarOrden`, `pasosOrdenados` en `planes-plantilla.js`). Solo afecta planes que se programen después; `rearmarPlanShalom` respeta el orden. Plantillas sin variables ya no mandan ejemplo vacío a Meta (daba Invalid parameter) y la tarjeta muestra el texto que Meta tiene hoy.

- 2026-10-11 · Plantillas ya en Meta se pueden editar con el lápiz y «Reenviar a revisión» (`editarTemplate` en `whatsapp.js`: Meta edita el mismo nombre y la revisa de nuevo; aprobadas/rechazadas/pausadas, con límite de Meta de ediciones). Se pueden quitar variables ({{1}} → «estimad@»). Al mandar una plantilla desde el chat, las variables vacías se llenan solas (nombre del cliente) en vez de fallar con (#131008).

- 2026-10-11 · Orden, interruptor y botones en todos los pasos: migración `0051_pasos_activos_botones.sql` (`activo` en `followup_sequence_steps` y `welcome_steps`, `botones` en `welcome_steps`; `followup_sequence_steps.botones` ya existía en prod). Bienvenida, secuencias de seguimiento, pasos de respuestas rápidas y seguimiento de plantilla (`plantillas_seguimiento`) se reordenan con flechas y se apagan sin borrar; un paso apagado no se programa ni se manda. Bienvenida y secuencias aceptan hasta 3 botones (solo en texto sin media; `mandarTexto` los ignora si el texto pasa de 1024). Los días del seguimiento de plantilla ahora son relativos al paso anterior (lo guardado en absoluto se convierte; de fábrica 4/3/14 = día 4, 7, 21).

- 2026-10-10 · Cadena: cuando sale el último seguimiento automático de 24 h sin respuesta, el rescate con plantilla queda por aprobar solo (`encadenarRescate`, ajuste `plan_auto`). Días de los planes editables (`plan_dias`, Herramientas). CAPI de otra línea con su propio token.

- 2026-10-10 · Planes con plantilla (`src/lib/planes-plantilla.js`, `/api/crm/planes`): recojo en Shalom (UTILITY) y rescate de interesado (MARKETING) a los 4, 7 y 21 días del último mensaje; la vendedora los marca en el chat y el admin los aprueba en Herramientas. Las plantillas (`recojo_shalom_1..3`, `rescate_lead_1..3`, es_PE) se mandan solas a revisión de Meta en la WABA del número del chat.

- 2026-10-10 · El webhook acepta una segunda app de Meta (URO): `WHATSAPP_APP_SECRET_2` y `WHATSAPP_VERIFY_TOKEN_2`; línea URO con su WABA y `WHATSAPP_TOKEN_URO`.

- 2026-10-10 · CRM con varios números y productos (URO en su propio número,
  color, respuestas rápidas, bienvenida y secuencia por producto; CAPI por
  línea). Migraciones 0045–0046 aplicadas; contenido de URO en 0047.
  Cuentas de Mayra, Bruce, Fandio y Gissele; `docs/vendedoras.md`. Catálogo
  del chat con precios. Respaldo del CRM anterior: rama `respaldo-crm-2026-10-10`.

- 2026-10-07 · Avatares A9–A14 (futuro, calma, esoterismo, camino espiritual,
  tradición familiar, estética) y mapa de motivos en `creativos/avatares.md`;
  pestaña **Formatos** (44 formatos en 9 familias + "No usar", usos y nota
  automáticos) con reglas de reparto en Instrucciones; Cobertura de Avatares
  movida a las filas 17–33.

- 2026-10-07 · Creativos: `render.mjs --editar` retoca una imagen ya hecha
  (campo "editar" en lote.json); CTA corregido en L001-C01 y L004-C03/C07/C08/C09.

- 2026-10-06 · Creativos: columna M "Titular (novedoso)" al final de Prompts y
  Ángulos (20 % de titulares evocadores por lote); filas de Creativos, Copy
  Meta y Ángulos ordenadas por avatar; reglas de CTA de compra y de formatos
  que esconden el producto (`desde-hoja.mjs` avisa); REGLAS_RENDER: cartas
  sin dibujo, números legibles, flechas con destino.

- 2026-10-06 · Avatares: pestaña Avatares (8 razones de compra × 5 niveles,
  Cobertura por fórmulas), columna Avatar al final de Prompts (L), Creativos
  (M), Ángulos (L) y Voz del cliente (I); `creativos/avatares.md`;
  Instrucciones, skill creativos, `desde-hoja.mjs`/`filas.mjs` y Routine de
  voz del cliente al tanto. Los 60 anuncios de L001–L006 etiquetados (49 = A1).
- 2026-10-06 · Creativos: dos flujos (CREA y REVISA COMENTARIOS); sin Pro ni
  Drive; REGLAS_RENDER fijas en `render.mjs`.
- 2026-10-06 · Brief: el Google Doc vuelve a ser la versión viva; se crea este mapa.

## Respuestas rápidas: borrado y orden del catálogo (2026-10-14)

- Borrar una respuesta rápida ya suelta antes `messages.quick_reply_id` y
  `scheduled_messages.quick_reply_id` (null) y borra su fila de
  `welcome_sequence`; sin eso la llave foránea de D1 impedía borrarla.
- Nueva columna `quick_replies.catalogo_despues` (migración
  `0055_rapida_catalogo_despues.sql`, **se aplica a mano**): 0 = catálogo antes
  del texto, 1 = debajo. Se elige en el editor de la respuesta rápida
  (`#rapida-catalogo-orden`). Sin la migración, la API lee y guarda sin ella.
- 2026-10-14 · Pedido del dueño: TODOS los reportes de ventas (21:00, 22:00, 23:00, 00:00) llegan también por Telegram. `enviar.py --informe` pone origen «reporte de ventas» si el texto empieza con «Ventas», y el Worker (`src/api/asesor.js`) manda ese texto + link al dueño. Los demás informes (director CRO, semanal) siguen solo en CRM → Reportes. Requiere deploy del Worker. El resumen de las 21:00 ahora lleva título «Ventas 21:00 — AAAA-MM-DD».
- 2026-10-14 · Corrección del dueño: el reporte de ventas había salido como texto plano. Ahora los de 21:00, 22:00, 23:00 y 00:00 salen como PDF con tablas (el formato de siempre) con `enviar.py salida.json` y `"tipo_reporte": "ventas"` (`armar_pdf`: título «Reporte de ventas · HH:MM fecha», sección «Ventas por vendedora», archivo `ventas-AAAA-MM-DD-HHMM.pdf`; Telegram solo al dueño vía `solo_dueno` en `src/api/asesor.js`, hace falta desplegar el Worker). `--informe` sigue existiendo (director CRO). Prompts de los triggers `trig_01MqeNCP2gXjMyXZaWt2sqBo` y `trig_01MUZWZBq7nr1Cvq1cLRNpAN` cambiados (ver `docs/routines.md`). Regla del dueño anotada en `docs/negocio.md` y `CLAUDE.md`: venta = Lima dio dirección / provincia mandó adelanto; confirmación verbal sin eso = otra cosa o error de asesor. Prueba: `scripts/asesor/pruebas/test_pdf_ventas.py`.
- 2026-10-14 · Reporte de ventas, segunda corrección: la tabla «Ventas por vendedora» ahora cuenta toda venta (confirmadas para el despacho y las agendadas para otro día), con columnas Lima / Provincia / Agendadas otro día / Total ventas / Kits y fila TOTAL. `enviar.py` rechaza un reporte de ventas si algún pedido no trae `vendedora`, `destino` y `estado` (o falta `fecha_objetivo`): la Routine lo corrige y reenvía, nunca sale a medias. Caso que lo motivó: la décima venta de Jennifer del 13/10 (Edon, Espinar) mandó el adelanto el 11/10 y los datos el 13/10; la venta cuenta el día en que se completa (adelanto + datos para provincia, dirección para Lima), aunque el adelanto sea de días antes. Prueba ampliada en `scripts/asesor/pruebas/test_pdf_ventas.py`.
- 2026-10-14 · Corrección de la regla de día de venta (reemplaza lo anotado hace un momento sobre Edon): la venta cuenta el día del adelanto (provincia) o de la dirección (Lima), igual que la etiqueta «Compra · día» del CRM; Edon (Mayra) fue compra del 11/10. La vendedora de la venta es la asesora del chat en el CRM, no quien confirma al final. Total correcto del 13/10: 17 ventas (Jennifer 10, Danitza 4, Fandio 3; 16 para el 14/10 y 1 para el 16/10); los reportes anteriores con 18 se equivocaron al incluir a Edon.
