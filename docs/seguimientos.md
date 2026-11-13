# Seguimientos («si no responde») — cómo funcionan HOY (registro práctico)

> Estado ACTUAL. Se reescribe cuando cambia algo; la historia está en `docs/MAPA.md`.
> Última revisión: 2026-11-04 (la cadena sigue aunque hablen: solo la corta «Detener»; mínimo de 5 h; tope de 7 días; reanudar; campaña a chats antiguos).

## Las reglas (del dueño, 2026-11-01)
1. **Nadie corta la cadena hablando (dueño, 2026-11-04; antes: «solo el cliente la corta»).** La cadena
   automática sigue aunque el cliente escriba o la vendedora le mande algo. Solo la detiene el botón
   **«Detener»**: la barra «Seguimiento en marcha» arriba del chat o el aviso parpadeante «Seguimiento en
   marcha · Detener» en la lista de chats (`POST /api/crm/seguimiento { accion: "apagar" }` →
   `cancelarSeguimientosDeLead`). Lo que el webhook sí cancela cuando el cliente escribe
   (`cancelarSeguimientosPendientes`): las **sugerencias del asesor** (ya quedaron desactualizadas), los
   recordatorios programados a mano por una persona y las plantillas que esperaban aprobación. Un texto
   sigue sin salir pasadas 24 h del último mensaje del cliente (el cron lo anota); si el cliente escribe,
   la ventana se renueva y los textos que faltan sí salen.
2. **Una sola cadena automática por chat.** Mandar una respuesta rápida con seguimiento reemplaza la
   cadena que hubiera (de otra rápida, de la secuencia de anuncio o de una sugerencia).
3. **Un texto nunca sale pasadas 23 h del último mensaje del cliente** (WhatsApp lo rechaza). Si un
   paso de texto caería después, se adelanta a esa hora siempre que queden ≥ 2 h con el paso anterior;
   si no, se salta. Una plantilla aprobada no tiene tope.
4. **Plantilla «día N del chat»** (`desde: "inicio"`): sus días se cuentan desde el primer mensaje del
   cliente, no desde el paso anterior. Si ese día ya pasó al reactivar, se salta. Así "día 3" y "día 5"
   son siempre el día 3 y el día 5 de la semana gratis del anuncio.
5. **Día 6 para todos los que vienen de anuncio:** `rescate7Dias` (src/lib/rescate-lead.js) agenda sola
   la plantilla del rescate al día 6 + 18 h del inicio del chat a todo chat que escribió y no compró
   (verificado 2026-11-01: 140 de 140 chats de hace 8–10 días la recibieron). Se apaga con
   `rescate7_auto = 0` (Herramientas).
6. Red de seguridad del cron: como mucho 6 textos automáticos seguidos sin respuesta
   (`MAX_AUTOMATICOS_SIN_RESPUESTA`; las plantillas no cuentan); el ritmo real lo pone la cadena.
8. Horario de envío 06:30–23:30 (Lima; `HORARIO_ENVIO`). Lo que cae de noche se corre a las 06:30
   si la ventana sigue abierta; si no, a las 23:29; las plantillas siempre a las 06:30.
7. A quien ya compró (etapa 5 / etiqueta purchase) no se le programa ni se le manda.


> **2026-11-13 · Plan 2 «Interesado · semana gratis» con 4 pasos prendidos** (imagen de bonos +45 min, guía PDF +3 h,
> `seg7_primera_lectura` día 1 16:30, `seg_d2_miedo_principiante` día 2 12:30). Apagados: catálogo PDF +10 h,
> `seg_d4_envios_hoy`, `rescate_lead_2`, `seg_d5_ultimo_bono`. El collar extra va solo en el rescate del día 7. Datos en `docs/MAPA.md`.

## Las reglas que se aplican solas (del dueño, 2026-11-04) — `calendarioDePasos` en `src/lib/crm-db.js`
9. **Mínimo entre seguimientos: 5 h** (ajuste `seguimiento_espacio_min_h`, se cambia en Herramientas → Planes de
   seguimiento, «Mínimo entre seguimientos»; vacío = 5, 0 lo apaga). Un paso que caería antes se corre hasta cumplirlo
   (en la línea de tiempo del plan sale «corrido»). Cuenta también el **último seguimiento automático que ya salió** en
   ese chat: si hace 1 h salió uno y la vendedora manda una rápida con plan, el primer paso de la cadena nueva espera
   las 4 h que faltan. Un texto que por el corrimiento se pase de las 23 h del cliente se salta.
10. **Tope de 7 días en horas (168 h) desde el primer mensaje del cliente:** nada sale después (texto ni plantilla),
    porque Meta ya lo cobraría. En la línea de tiempo sale «no sale». (`DIA_PAGADO = 7`.)
11. **Reanudar desde el paso que sigue, no desde cero.** Cada paso programado guarda su número (`plan_paso`, también
    los pasos propios de una rápida). Si el paso 1 ya salió, el cliente respondió (cadena cancelada) y después la
    vendedora manda otra rápida con **el mismo plan** (o la misma rápida), la cadena sigue desde el paso 2; si ya
    salieron todos, lo dice («Este chat ya recibió todos los pasos de este seguimiento»). Otro plan arranca desde su
    paso 1 (respetando el mínimo de 5 h desde lo último que salió).
12. La bienvenida de anuncios programa el plan 2 «Interesado · semana gratis» (`plan_interesados_id = 2`, desde el
    4/11) en vez de la secuencia de interesados vieja.
14. **Al marcar compra muere la cadena de venta** (dueño, 2026-11-04): `agregarEtiquetaMeta(purchase)` (botón de compra /
    CAPI) y el embudo al detectar etapa 5 llaman `cancelarSeguimientosDeLead`; el cron además cancela cualquier paso
    automático de venta (texto o plantilla) de quien ya compró. El cobro y el recojo de Shalom (planes con plantilla,
    saldo) no son automáticos de venta: siguen. En Lima no hay nada más, así que ahí muere todo.
15. **Toque del día 7 a clientes = venta cruzada con catálogo** (`toques.js` `post7`, plantilla `toque_post7`, mandada a
    Meta el 4/11): plantilla de catálogo de Meta (botón CATALOG; Meta obliga al texto fijo «View catalog», el cliente lo ve
    como «Ver catálogo»). Al mandarla va la foto de un producto del catálogo (`parametrosBotonCatalogo`). Sale a todo el
    que compró (Lima o provincia) 7 días después de la compra, con las reglas de los toques: 1 de cada 5 chats es grupo de
    control, tope `TOQUES_MAX_DIA` por día, no sale si tiene algo pendiente (por ejemplo el recojo de Shalom) ni si
    alguien le escribió en las últimas 20 h.
16. **Respuesta automática de cobro** (`src/lib/cobro-auto.js`): tras la boleta, si el cliente con saldo pregunta por su
    saldo, el Yape o la clave, sale sola la rápida «Cobro» con su saldo y el número de Yape (una cada 6 h; `cobro_auto = 0`
    la apaga). La clave de retiro nunca sale sola.
13. **Campaña a chats antiguos** (`POST /api/asesor/programar-plan`, clave del asesor, solo cuando el dueño lo pide
    por escrito): programa un plan a los chats de entre N y M días sin compra, «desde hoy» (`meta.inicioMs`: el día 1
    del plan es mañana; se reparte en 3 días de arranque por id) y sin el tope de 168 h (`meta.sinTope7d`). Los textos
    del día 0 no salen (sin ventana); salen las plantillas, que Meta cobra fuera de la semana gratis. La cadena
    resultante es una más: se ve en la barra del chat y la detiene el botón. Hecho el 4/11 con el plan 2 a los
    chats de 7 a 60 días (2 904 chats) y, con `desde_hoy: false` / `saltar_con_cadena`, a los de 0 a 7 días (559 + 217): todo
    chat sin compra lleva el plan.

## Los planes con nombre (desde el 2026-11-03)
- Tabla `planes_seguimiento`: cada plan tiene nombre, segmento (general, Lima o provincia), hasta 10 pasos
  ({ horas | dia + hora, body, botones, media, plantilla, desde, activo }), una versión B opcional con su
  % de reparto (brazo fijo por chat en `plan_asignaciones`) y un interruptor de apagado. El plan 1
  «Universal» es el antiguo plan universal (el ajuste `seguimiento_universal` queda como respaldo y espejo).
- Un paso puede ser «después del paso anterior» (+N h) o «día N del chat a las HH:MM» (hora de Lima,
  contado desde el primer mensaje del cliente). Un texto solo sale dentro de las 24 h; una plantilla
  del día 7 en adelante se marca «se paga» (ya no entra en la semana gratis del anuncio).
- Dónde se editan: CRM → Herramientas → **Planes de seguimiento** (solo admin): lista, línea de tiempo,
  pasos, versión B, duplicar, apagar, y «este plan lo manda la bienvenida» (ajuste `plan_interesados_id`:
  reemplaza a la secuencia de interesados vieja solo cuando está puesto).
- Cada respuesta rápida elige en su editor: **Plan: [selector]** · Pasos propios · Sin seguimiento
  (`quick_replies.followup_plan_id`; `followup_universal` = plan 1 por compatibilidad).
- Cada mensaje programado por un plan guarda `plan_id`, `plan_brazo` y `plan_paso` (para medir por brazo).

## El plan universal (plan 1)
- Son pasos iguales a los de una respuesta rápida ({ horas, body, botones, plantilla, desde, activo },
  hasta 10), guardados en `planes_seguimiento` (id 1) y espejados en el ajuste `seguimiento_universal`.
- Cada respuesta rápida elige en su editor: **Plan universal** · **Pasos propios** · **Sin seguimiento**
  (columna `quick_replies.followup_universal`). Con «Plan universal», al mandarla se programa el plan.
- Dónde se edita: CRM → Respuestas rápidas → editar cualquiera → «Plan universal»: ahí se ven y se
  editan los pasos (solo admin); al guardar cambian para todas las rápidas que lo usan. El botón
  «Usar el plan universal en todas las respuestas con seguimiento» cambia todas de un toque (los pasos
  propios quedan guardados por si se vuelve a «Pasos propios»).
- Planes en uso (2026-11-03): **2 «Interesado · semana gratis»** (2T·1) y **3 «Cierre · le pidieron ubicación o
  adelanto»** (2T·2): solo el experimento «Yape en 2 tiempos» los usa hasta que el dueño apruebe los textos; Lima
  msj. 3, Provincia Msj. 3 y la bienvenida siguen con sus seguimientos de siempre. Textos con los bonos (30+ clases grabadas, 50+
  libros digitales) y plantillas `seg7_*` (banco «Seguimiento 7 días» en Plantillas para Meta; se saltan hasta
  que Meta las apruebe). Detalle en `docs/MAPA.md` (2026-11-03 madrugada).
- Semilla del plan 1 (2026-11-01): los dos pasos de «Provincia Msj. 3»: 1 h «Solo quería recordarte…» y 20 h
  «Si aún desea aprovechar la promoción… COLLAR AMULETO». Los días 3 y 5 se agregan como pasos de
  plantilla «desde el primer mensaje del cliente» eligiendo una plantilla aprobada en Meta
  (hoy la única de rescate aprobada es `rescate_lead_1`, la misma del día 6; para otro texto hay que
  crear y aprobar otra plantilla de marketing en Meta).
- Un cambio del plan vale para las cadenas que se programen desde ese momento (las ya programadas
  llevan el texto de cuando salieron).

## La barra «Seguimiento» del chat
Debajo de la cabecera de cada chat (`#barra-seguimiento`, `GET/POST /api/crm/seguimiento`):
- **Verde, «Seguimiento activo · N pasos · próximo …»**: hay cadena automática pendiente. Tocarla la
  apaga (cancela solo lo automático; lo programado a mano sigue).
- **Naranja, «Reactivar seguimiento · <plan> (N pasos) · se cortó porque el cliente escribió»**: abre
  el modal con los pasos del plan de ese chat (la última rápida con seguimiento que se le mandó, o el
  plan universal si no hubo rápida), deja ajustar textos/horas o quitar pasos solo para ese chat, y los
  programa. Si pasaron 24 h desde el último mensaje del cliente, avisa que solo saldrían las plantillas.
- No se muestra si el cliente ya compró. La burbuja de cada rápida mantiene su chip
  «Seguimiento activo / Reactivar» y la lista de chats muestra «Seguimiento · hora» para cualquier
  cadena automática en marcha.

## Fotos de una respuesta rápida
- En el editor de la rápida, las fotos/videos se ordenan con flechas (igual que en la bienvenida); se guarda al toque
  (`PATCH /api/crm/quick-replies { id, orden_media }`). Los experimentos de flujo están en `docs/experimentos.md`.

## Flujos de mensajes (Herramientas, desde el 2026-11-05)
Todo lo que sale solo, en un solo lugar: Herramientas → «Flujos de mensajes». Cada tarjeta muestra el texto exacto, cuándo
sale y su estado en Meta, con un botón al editor que corresponde (bienvenida, plan, Plantillas para Meta, rápida de cobro).

## Dónde está cada cosa
- `src/api/crm/planes-seguimiento.js`: los planes con nombre (`/api/crm/planes` es otra cosa: los planes con plantilla de Shalom). `scripts/test-planes.mjs`: su prueba.
- `src/lib/crm-db.js`: `normalizarPasosSeguimiento`, `calendarioDePasos`, `leerPlan`, `pasosDePlan`, `programarPlanEnChat`, `pasosUniversales`, `pasosDeSeguimientoRapida`,
  `programarSeguimientoDeRapida` → `programarPasosEnChat` (las reglas 2–4 y 7), `cancelarSeguimientosDeLead`
  (solo para reemplazar o apagar), `cancelarSeguimientosPendientes` (el cliente escribió).
- `src/api/crm/seguimiento.js`: estado y acciones de la barra. `followup-rapida.js`: el chip de la burbuja.
- `src/api/crm/settings.js`: `seguimiento_universal`, `aplicar_universal_a_rapidas`.
- `src/lib/crm-cron.js`: manda lo programado (plantillas con sus variables; un texto con la ventana
  cerrada se cancela y queda en `envio_errores`).
- Pruebas: `scripts/test-seguimientos-cadena.mjs` y `scripts/test-seguimientos-rapida.mjs` (`npm run check`).

## Qué ya NO pasa
- Mandar cualquier mensaje después de la rápida ya no borra su seguimiento (antes: `cancelarSeguimientosDeLead`
  en texto, foto, catálogo, plantilla, sugerencia y al programar a mano).
- El paso 2 (20 h) ya no se salta por haber mandado la rápida 2 h tarde (se adelanta al tope).
- El tope de 2 automáticos ya no corta el paso 2 cuando la secuencia de anuncio mandó uno antes.
