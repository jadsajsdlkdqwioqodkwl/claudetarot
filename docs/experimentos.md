# Experimentos de flujo con testers — cómo funcionan HOY (registro práctico)

> Estado ACTUAL. Se reescribe cuando cambia algo; la historia está en `docs/MAPA.md`.
> Última revisión: 2026-11-03 noche (dueño: «desactiva lo del Yape en 2 tiempos», pantalla propia «Pruebas con testers» y vista previa para el admin).

## Qué es
Una prueba compara dos cadenas de respuestas rápidas en los chats de un segmento (provincia) que atienden las vendedoras
marcadas como **tester** (Equipo → «Hacer tester»; no cambia su rol). A cada chat le toca un brazo fijo (A = control,
B = nuevo) por sorteo del id del chat; queda guardado y se respeta aunque otra vendedora tome el chat.

## Dónde se ve y se edita (CRM → icono de matraz «Pruebas con testers», solo admin)
- Está en la cabecera de la lista de chats (y en «Más opciones» en pantallas angostas), además del botón «Ver y editar las
  pruebas con testers» en el modal admin. Modal `#modal-pruebas-fondo`.
- **Pruebas:** cada una con su estado (Activa / En pausa / Terminada), los dos brazos en orden, las métricas y los botones
  Activar / Pausar / Terminar. «Ver y editar» abre el editor: nombre, destino (provincia, Lima o todos), % al brazo B,
  mínimo de chats, «solo chats de testers», nombre de cada brazo y sus rápidas (agregar, subir, bajar, quitar y
  «Editar texto», que abre la respuesta rápida encima). «Crear» arma una prueba nueva, que nace en pausa.
- **Testers:** casillas con todas las cuentas activas (también la del admin). Es lo mismo que «Hacer tester» en Equipo.
- **Probarlo yo (vista previa):** el admin elige prueba y brazo y, en cualquier chat que abra, ve el chip
  «Vista previa · …» y el panel de rápidas como lo vería una tester de ese brazo. Solo en su navegador (localStorage
  `crm_vista_previa_prueba`), no asigna el chat (`GET /api/crm/experimentos?conversation_id=N&solo_ver=1`), no cuenta para
  la prueba y funciona aunque esté en pausa. Lo que mande desde ahí sí le llega al cliente: probarlo en un chat propio.
  Tocar el chip abre esta pantalla para cambiar de brazo o salir.

## Prueba en pausa = sus mensajes nuevos no se ven
Las rápidas que solo son del brazo B de alguna prueba (`rapidasSoloDePrueba`, en `src/lib/experimentos.js`) no salen en el
panel de rápidas de ningún chat que no vaya por ese brazo B (`ocultar_siempre` / `solo_prueba` en el GET por chat). Así, con
la prueba en pausa o terminada, el equipo no ve «Provincia 2T · 1/2». Se siguen editando desde «Pruebas con testers».

## Cómo lo ve la tester
- Abre un chat de provincia (o toca la primera rápida de cualquiera de los dos brazos): el chat recibe su brazo.
- Junto al teléfono aparece el chip «Prueba · control» o «Prueba · 2 tiempos».
- En el panel de rápidas, las del brazo salen arriba bajo la franja «Prueba · …»; las del otro brazo no se ven en ese chat.
- Las vendedoras que no son tester no ven nada distinto y sus chats no entran a la estadística.
- El admin puede tocar el chip para pasar el chat al otro brazo: queda anotado como cambio a mano y sale de la cuenta.

## «Yape en 2 tiempos» (experimento 1, en pausa: el dueño lo desactivó el 3/11 noche; sus rápidas 2T no se ven)
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
