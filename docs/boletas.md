# Boletas de provincia — cómo funciona HOY (registro práctico)

> Este archivo describe el estado ACTUAL del despacho automático de boletas. Se reescribe cada vez
> que cambia algo; la historia de cómo se llegó aquí está en `docs/MAPA.md` (que nunca se recorta).
> Última revisión: 2026-10-31 (noche).

## Qué hace el dueño
1. Manda al número de la empresa (desde su WhatsApp 927633099) las fotos de HOY: por cada cliente de
   provincia, la foto de la boleta (ticket Shalom, etiqueta GR Shalom o guía Olva) y la foto de la caja.
   En cualquier orden. Opcionalmente escribe `ENVIAR`.
2. Espera unos segundos y dispara a mano la Routine **«Despacho automático de boletas»** (Run now).
3. Lee el reporte que llega por Telegram. Lo que no salió, lo manda a mano.

## Qué hace el sistema
- Las fotos del dueño caen en la tabla D1 `boletas_staging` (`pendiente`; con `ENVIAR` pasan a `listo`
  con un `lote_id`). La Routine procesa las dos cosas: el «Run now» del dueño vale como ENVIAR.
- La Routine corre en su **propia sesión** (modelo Sonnet) con el prompt de `docs/routines.md`
  (versión 13) y usa solo `scripts/asesor/boletas.py`:
  `bajar` (fotos de hoy + `boletas.md`), `historial`, `buscar`, `chat`, `reportes`, `rotar`,
  `despachar`, `error`, `telegram`. El modelo no arma curl ni toca D1.
- Por cada cliente, `despachar` llama **`POST /api/asesor/mandar { tipo: "despachar" }`**
  (`src/api/asesor-mandar.js`), que decide TODO en el Worker:
  1. Rechaza 400 si faltan datos, si el texto no lleva el nro de orden, o si lleva el código de retiro.
  2. Rechaza 409 si la foto ya se usó, si ese nro de orden ya salió, o si el chat ya tiene su comprobante
     (`ya_procesado` / `ya_despachado_en_chat`). `forzar: true` solo si de verdad es otro pedido.
  3. Mira la ventana de 24 h (`conversations.last_inbound_at`):
     - **abierta** → manda foto boleta, foto caja y el texto; etiquetas `bot_boleta`, `cobro_3x` (o
       `saldo_pagado` si saldo 0), `shalom_codigo_pendiente` (u `olva=1`); programa el cobro (3 avisos);
       staging `enviado`; fila en «Boletas auto».
     - **cerrada** → staging `pendiente_ventana` con el texto guardado; manda la plantilla
       `aviso_envio_shalom`; fila en «Boletas auto» (`plantilla`). Cuando el cliente toca el botón, el
       webhook (`despacharBoletasPendientesVentana`) manda fotos + texto, programa el cobro y pone
       etiquetas, sin que nadie haga nada.
  4. En los dos casos registra la venta en la pestaña **Ventas** (crea la fila si no existía: DNI,
     celular, Shalom, adelanto, saldo, código TS-…) y le cuelga la foto de la boleta.
- Los envíos `texto` y `foto-staging` sueltos del mismo endpoint se rechazan (409) con la ventana
  cerrada: antes WhatsApp los descartaba en silencio.

## Reglas fijas (del dueño)
- Al cliente le llega SOLO boleta + caja + el texto fijo. Nada más, nunca. Ni pruebas.
- Solo fotos de HOY (hora Lima). Las de otros días se marcan `error` y se avisan.
- Siempre dos fotos por cliente; una sola no se despacha.
- En el texto va el CÓDIGO de 4 letras del ticket. El código de retiro de 4 dígitos (3114/3143/3144…)
  NUNCA sale del sistema; el Worker rechaza el texto si lo lleva.
- Cobro: todo despacho con saldo > 0 programa los 3 avisos de recojo. Cuando una persona del equipo
  manda por el chat el código de retiro del cliente (está en su perfil), el cobro se cancela solo y el
  chat pasa a `saldo_pagado` (`terminarCobroSiLlevaCodigo`, `src/lib/crm-db.js`). Para que funcione,
  el código tiene que estar guardado en el perfil del contacto antes de mandarlo.
- Cómo encontrar al cliente (en orden, hasta confirmar con DOS datos: DNI, apellido, agencia, teléfono):
  Sheets Ventas por DNI → CRM por DNI → CRM por apellido → teléfono impreso en el ticket → PDF del
  reporte de ventas (ayer y hoy). Si aun así no aparece, no se despacha y se avisa.

## Dónde ver las cosas
- Registro de despachos: pestaña **«Boletas auto»** del libro «Pedidos Tarot Kit»
  (`1kcoEEG6E2uHFLQ_wjjq6oVMQg4bzvIqmPYygiBT6qQc`). Ventana = `abierta` (salió todo), `plantilla`
  (se mandó el aviso, se espera al cliente), `pendiente` (el webhook ya mandó todo tras el botón).
- Estado de cada foto: `python3 scripts/asesor/boletas.py historial 7` o
  `GET /api/asesor/boletas_staging?historial=1`.
- Chat, ventana y etiquetas de un cliente: `python3 scripts/asesor/boletas.py chat <conversation_id|wa_id>`.
- Routine: `trig_01` (ver `docs/routines.md`, última versión). Sesión de la Routine: la que se indica ahí.

## Si algo sale mal
- «Sin boletas hoy» pero sí mandaste fotos → las fotos no llegaron al staging (mira el CRM: deben
  aparecer en el chat del número del dueño) o llegaron ayer (vencidas). Vuelve a mandarlas.
- Cliente no encontrado → el reporte de Telegram trae nombre, DNI, teléfono y agencia: mándalo a mano
  y, si el chat existe con otro número, dímelo para mejorar la búsqueda.
- `ya_despachado_en_chat` siendo un pedido nuevo del mismo cliente → repetir con `"forzar": true`.
- Foto de lado → `rotar <staging_id> 90|180|270` antes de despachar (el modelo lo hace solo).
- Pendiente conocido: Olva se registra en Ventas como «Shalom» (la columna Envío solo acepta
  Lima/Shalom/Dinsides).
