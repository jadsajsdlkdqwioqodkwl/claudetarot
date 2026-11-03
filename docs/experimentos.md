# Experimentos de flujo con testers — cómo funcionan HOY (registro práctico)

> Estado ACTUAL. Se reescribe cuando cambia algo; la historia está en `docs/MAPA.md`.
> Última revisión: 2026-11-03 (Fase 2 del plan CRO: «Yape en 2 tiempos», en pausa hasta que el dueño apruebe los textos).

## Qué es
Una prueba compara dos cadenas de respuestas rápidas en los chats de un segmento (provincia) que atienden las vendedoras
marcadas como **tester** (Equipo → «Hacer tester»; no cambia su rol). A cada chat le toca un brazo fijo (A = control,
B = nuevo) por sorteo del id del chat; queda guardado y se respeta aunque otra vendedora tome el chat.

## Cómo lo ve la tester
- Abre un chat de provincia (o toca la primera rápida de cualquiera de los dos brazos): el chat recibe su brazo.
- Junto al teléfono aparece el chip «Prueba · control» o «Prueba · 2 tiempos».
- En el panel de rápidas, las del brazo salen arriba bajo la franja «Prueba · …»; las del otro brazo no se ven en ese chat.
- Las vendedoras que no son tester no ven nada distinto y sus chats no entran a la estadística.
- El admin puede tocar el chip para pasar el chat al otro brazo: queda anotado como cambio a mano y sale de la cuenta.

## «Yape en 2 tiempos» (experimento 1, en pausa)
- Brazo A (control): Provincia msj. 1 (4) → msj. 2 (5, 7 fotos) → Msj. 3 (38, Yape) seguidos.
- Brazo B (2 tiempos): «Provincia 2T · 1» (118: texto + las 7 fotos, pregunta ciudad y agencia) → cuando el cliente
  responde, «Provincia 2T · 2» (119: el Yape). Los textos son los del plan CRO del 3/11; el dueño los edita en el CRM.
- Tester: Jennifer. Mínimo 150 chats por brazo para leer el resultado (con ~10 chats de provincia al día: 4 a 6 semanas).
- Falta antes de activar: aprobar los textos, crear los planes PROV-2T · Sin ciudad (para 118) y PROV · Sin adelanto
  (para 119 y 38) y elegirlos en el editor de cada rápida. Se activa en el modal admin → Experimentos → Activar.

## Métricas (modal admin → Experimentos, y `/api/asesor/contexto` → `experimentos`)
Por brazo: chats, respondieron después de asignados, compraron en 72 h y en 7 días (etapa 5 o evento Purchase),
horas promedio hasta la compra, cambiados a mano (fuera de la cuenta), y «faltan N chats por brazo».

## Dónde está cada cosa
`src/lib/experimentos.js`, `src/api/crm/experimentos.js`, `src/api/crm/agents.js` (tester), `public/crm/app.js`
(`cargarExperimentoChat`, `pintarChipExperimento`, `pintarQuickPanel`, `pintarExperimentosAdmin`), migración 0074,
prueba `scripts/test-experimentos.mjs`.
