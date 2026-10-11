# Mapa: qué hay, cómo se conecta y qué NO se mueve

> **Reglas de interfaz del dueño** (detalle en `CLAUDE.md`): sin emojis en la interfaz del CRM, siempre iconos (`public/crm/icons.js`); no borrar ni esconder funciones sin preguntar; el cronómetro de la ventana de 24 h va al lado del nombre y teléfono del cliente.

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

- 2026-10-11 · Bienvenida y seguimiento de interesados por tienda: siempre que sale la bienvenida de anuncios (automática en el webhook o a mano desde el panel, `welcome-send.js`) sale también el seguimiento de interesados de la tienda del chat, aunque el automático esté apagado (`src/lib/crm-interesados.js`: la secuencia del producto o, sin producto, la general solo de la línea principal; reemplaza la ya programada, no se duplica; respeta el killswitch del chat). El panel derecho muestra la tienda del chat y solo los pasos de bienvenida y la secuencia de esa tienda (igual que `pasosDelChat`). `followup-apply.js` marca como seguimiento de interesados también las secuencias de producto (así se cancelan si el cliente escribe).

- 2026-10-11 · Migración `0052_olva_y_pausa_por_chat.sql` (ya aplicada en prod): `contacts.olva` (casilla «Envío por Olva» en el panel del chat, la ve y marca todo el equipo; solo informativa por ahora, no cambia los planes de Shalom) y `conversations.pausa_auto` = killswitch POR CHAT (`chat-estado.js` acciones `pausar_auto`/`reanudar_auto`): cancela lo programado de ese chat, el cron cancela lo automático y las plantillas que venzan, y el webhook no le corre bienvenida, seguimiento automático ni plan tras el aviso de envío; lo que una persona programe a mano sí sale. El killswitch general (arriba) sigue aparte.

- 2026-10-11 · Killswitch y «mandar toda la secuencia» (`src/api/crm/pausa.js`, ajustes `pausa_total` y `siempre_global`): botón rojo siempre visible en el encabezado de Chats cancela todo lo programado y, mientras esté puesto, el cron cancela lo que venza en vez de mandarlo (no se acumula para salir de golpe al reanudar; la bienvenida, que responde en el momento, no se toca). El checkbox de Herramientas hace que lo que se programe desde entonces (secuencias, respuestas rápidas, planes y seguimiento de plantilla, también el recojo en Shalom) lleve `mandar_siempre`: no lo cancela que el cliente o nosotros escribamos; «Ya lo recogí» sí lo detiene. `siempreGlobal()` en `crm-db.js`.

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
