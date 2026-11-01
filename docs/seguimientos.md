# Seguimientos («si no responde») — cómo funcionan HOY (registro práctico)

> Estado ACTUAL. Se reescribe cuando cambia algo; la historia está en `docs/MAPA.md`.
> Última revisión: 2026-11-01 (dueño: reglas nuevas de cadena, plan universal, barra en el chat).

## Las reglas (del dueño, 2026-11-01)
1. **Solo el cliente corta la cadena.** Cuando el cliente escribe, el webhook cancela los seguimientos
   automáticos pendientes (`cancelarSeguimientosPendientes`). Lo que nosotros mandemos o programemos
   (texto, foto, catálogo, plantilla, sugerencia aprobada, seguimiento a mano) NO la toca.
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
6. Red de seguridad del cron: como mucho 6 automáticos seguidos sin respuesta
   (`MAX_AUTOMATICOS_SIN_RESPUESTA`); el ritmo real lo pone la cadena.
7. A quien ya compró (etapa 5 / etiqueta purchase) no se le programa ni se le manda.

## El plan universal
- Son pasos iguales a los de una respuesta rápida ({ horas, body, botones, plantilla, desde, activo },
  hasta 6), guardados UNA vez en el ajuste `seguimiento_universal` (crm_settings).
- Cada respuesta rápida elige en su editor: **Plan universal** · **Pasos propios** · **Sin seguimiento**
  (columna `quick_replies.followup_universal`). Con «Plan universal», al mandarla se programa el plan.
- Dónde se edita: CRM → Respuestas rápidas → editar cualquiera → «Plan universal»: ahí se ven y se
  editan los pasos (solo admin); al guardar cambian para todas las rápidas que lo usan. El botón
  «Usar el plan universal en todas las respuestas con seguimiento» cambia todas de un toque (los pasos
  propios quedan guardados por si se vuelve a «Pasos propios»).
- Semilla (2026-11-01): los dos pasos de «Provincia Msj. 3»: 1 h «Solo quería recordarte…» y 20 h
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

## Dónde está cada cosa
- `src/lib/crm-db.js`: `normalizarPasosSeguimiento`, `pasosUniversales`, `pasosDeSeguimientoRapida`,
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
