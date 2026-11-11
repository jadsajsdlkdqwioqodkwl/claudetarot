# Prompt de la Routine «Reporte de pedidos y ventas» (v3, 2026-11-11; v2 del 2026-11-09)

> FUENTE DE VERDAD del prompt. La Routine solo lleva el «arranque» de abajo; en cada corrida clona o actualiza el repo y lee
> este archivo. Cambiar el reporte = editar este archivo (y anotarlo en `docs/MAPA.md`); la Routine no se toca.
> Versión anterior (v1, 2026-11-02): en `docs/routines.md`. Lo que cambia en la v2 está marcado con «(v2)».

## Arranque (lo único que va en las Routines 21:45 · 22:30 · 23:45)

```
Trabajas en el repo jadsajsdlkdqwioqodkwl/claudetarot. Esta sesión es TUYA y persistente: cada corrida es un turno más. Primero corre:
(cd /home/user/claudetarot 2>/dev/null && git fetch -q origin main && git checkout -q main 2>/dev/null; git merge -q --ff-only origin/main || (git stash -q 2>/dev/null; git merge -q --ff-only origin/main)) || GIT_TERMINAL_PROMPT=0 git clone -q --depth 20 https://github.com/jadsajsdlkdqwioqodkwl/claudetarot /home/user/claudetarot
Luego lee SOLO /home/user/claudetarot/docs/prompts/reporte.md y haz lo que dice, al pie de la letra. No leas docs/MAPA.md ni
CLAUDE.md. La clave del asesor está en la variable de entorno ASESOR_CLAVE (no la imprimas); si falta responde «Falta ASESOR_CLAVE
en el entorno de la Routine» y termina; si el Worker responde 401 responde «La ASESOR_CLAVE del entorno no es la correcta» y termina.
No hagas commits ni cambies código. No uses curl ni llames APIs a mano: todo pasa por python3 scripts/asesor/reporte.py. No uses la
API de Claude. Lee cada archivo una sola vez. Borra /tmp/reporte/salida.json de la corrida anterior antes de empezar.
```

## REPORTE DE PEDIDOS Y VENTAS (corridas 21:45 · 22:30 · 23:45, hora de Lima)

Un solo reporte para Moi, Danitza y Jennifer: las VENTAS DE HOY (por vendedora) y los PEDIDOS QUE SALEN MAÑANA. Cada corrida de la noche
suma a la anterior; la memoria (registro por fecha de despacho + pestaña «Pedidos auto» del libro «Pedidos Tarot Kit») la guarda
el sistema, no tú.

**Lo más importante (dueño, 2026-11-09): el dueño tiene que VER TODOS los pedidos, sin excepción: los que son venta, los que casi
lo son y los que huelen a venta.** Cada chat de hoy con señal de compra termina en `pedidos` con algún estado (CONFIRMADO,
POR_VERIFICAR, OTRO_DIA, INTENCION) o en DESCARTADO con motivo. Nunca descartes nada en silencio; nunca dejes un chat fuera por
duda: la duda va en `nota` y el pedido sale igual.

### LO QUE CAMBIÓ EL 2026-11-11 (v3, dueño): es un reporte de VENTAS, y mira el courier
1. **Es un reporte de ventas** para Moi, Danitza y Jennifer: ventas de hoy por vendedora y pedidos por registrar. Ya no lleva la
   sección «para el que empaca» (el empaque va impreso en cada etiqueta), ni incidencias, ni reposiciones o cambios.
2. **Reposiciones, cambios, incidencias y saldos cobrados** los sigues reportando igual (`tipo` REPOSICION / CAMBIO, `incidencias`,
   `saldos`), pero el sistema los saca del PDF del equipo y los manda en otro PDF, «Saldos y reposiciones», SOLO a Moi, una vez por
   noche (corrida 23:45). Las reposiciones las despacha otro equipo, no Dinsides: nunca las pongas como pedido normal.
3. **SALDOS: todo pago de saldo va en `saldos`**, lo pague quien lo pague y por donde sea (Yape, Plin, depósito o transferencia BCP,
   un familiar, agente): `{whatsapp, nombre, codigo, monto, motivo}` con el monto visto y cómo pagó («depósito BCP 18:19, la
   vendedora ya le dio la clave»). Caso real: César Augusto pagó S/69 por BCP y no salió en ningún reporte.
4. **MIRA EL COURIER antes de decir que algo falta.** `preparar` trae `dinsides`: lo REGISTRADO por entregar (ya está en el almacén
   de Dinsides o sale en el recojo), lo ENTREGADO y lo ANULADO o RECHAZADO, por teléfono. Un pedido que está ahí NO es pendiente, ni
   «sin entregar», ni incidencia (caso real: Sandra, registrada el 10 para el 11, salió como «no entregada» y confundió a todos).
   Ojo: Dinsides puede tener el teléfono de quien recibe (un contacto compartido en el chat), no el WhatsApp del cliente: búscalo
   también por los otros números que aparecen en el chat. Un cliente con ANULADO en Dinsides no es venta pendiente salvo que haya
   vuelto a pedir. El PDF lleva la columna «Envío» (la pone el sistema): tú no la escribes.
5. **`nota` es SOLO para el motorizado**: cómo contactar (otro número, «escribir por WhatsApp»), a quién entregar, dónde dejarlo
   (recepción, portería, piso), horario. NO pongas ahí pagos («ya pagó S/89», «paga en efectivo», «NO cobrar»: eso va en `pago`),
   ni pines o coordenadas (la etiqueta va pegada a la caja), ni apuntes tuyos («confirmar, escribió dos versiones», «cliente sin
   número en el CRM», horas en que escribió). Una duda que una persona debe resolver va como frase aparte que empiece con
   «Confirmar: …» (el sistema la saca de la etiqueta y se la muestra a la asesora). Lo que se empaca va en `empaque`, con el NOMBRE
   del producto cuando no es el kit («Cuenco tibetano 13 cm + mazo Tarot Rider Waite de aprendizaje»), nunca «reposición / cambio»
   si es una venta.
6. Provincia con 2 o más kits: viaja en UN paquete XS (lo calcula el sistema); tú solo pones `kits`.

### CRITERIO (liberal: lo verifica una persona)
- CONFIRMADO Lima = el cliente pasó su dirección (calle y referencia, o pin).
- CONFIRMADO Provincia **(v2)** = mandó el adelanto. El adelanto ES la venta, haya mandado S/10, S/20 o S/50, aunque falte el saldo o
  la captura sea de otro monto: va CONFIRMADO en su sección y con nota que empiece con «🚨 ATENCIÓN: …» (sale en rojo) diciendo qué
  revisar (monto distinto, captura de otro día, falta DNI o agencia). También cuenta si la vendedora ya le confirmó el pedido
  («gracias por la confianza», «le enviamos el comprobante»): el Yape llegó aunque no haya captura en el chat.
- POR_VERIFICAR = huele a venta pero NO hay pago ni dirección: dijo que yapeó sin captura ni confirmación de la vendedora, pidió
  datos para pagar, dirección a medias, «mañana lo recibo». En `nota` di exactamente qué falta. **(v2)** Un provincia con adelanto
  visto NUNCA va aquí; un Lima con dirección tampoco.
- OTRO_DIA con `fecha_entrega` AAAA-MM-DD: pidió otra fecha. Queda agendado y sale en el reporte de ese día.
- INTENCION: preguntó precio o dijo que compra, pero no dio nada. Sale listado (sección «Intención de compra»).
- DESCARTADO con `motivo`: lo que revisaste y NO es venta (curioso, otro producto, ya había comprado, no era cliente). Sale listado.
- Cambio, reposición o reclamo que obliga a mandar algo: `tipo` CAMBIO o REPOSICION, dirección, `empaque` (qué llevar) y nota «🚨 …».
- Una venta es del día y de la vendedora que la cerró (la asesora del chat). Un Lima que pide entrega otro día NO sale mañana:
  OTRO_DIA con su fecha.

### PRIORIDAD CERO (dueño, 2026-11-09): correcciones y datos que llegaron
`preparar` devuelve `agenda_con_movimiento`: pedidos de la hoja que NO han salido (sin «Enviado») y cuyo cliente escribió en esta
ventana. LÉELOS PRIMERO, antes que cualquier chat nuevo. Casi siempre es el dato que faltaba (DNI completo, agencia, dirección en
texto), el pago del saldo o un reclamo. Si llegó el dato o una corrección → en `pedidos` con `tipo: "CORRECCION"`, estado
CONFIRMADO, los datos nuevos (DNI, agencia, dirección) y nota que empiece con «🚨 » diciendo qué llegó (p. ej. «🚨 llegó el DNI
completo 0463…; pedido del 06-11 sin enviar»). Sale ARRIBA DEL TODO en el PDF, en rojo, y actualiza la fila de la hoja. Si es
reclamo → `incidencias`. Prefiere una falsa alarma arriba a que quede abajo sin que nadie lo vea. Un cliente con pedido pendiente
NUNCA va como INTENCION ni DESCARTADO («ya había comprado»): su compra sigue sin despacharse.

### PASOS
1) `python3 scripts/asesor/reporte.py preparar` → JSON (incluye `agenda_con_movimiento`, ver PRIORIDAD CERO): fecha_venta, fecha_objetivo (mañana), hora, corrida, ya_registrado (lo que
   ya está en el reporte de esta noche; NO lo repitas salvo que haya cambiado), agenda_hoja, chats (la primera corrida trae hoy y
   ayer completos; las siguientes solo lo que se movió desde el corte), imagenes y control (candidatos = lo que el CRM ya tiene
   como venta de hoy: compras marcadas, pedidos web y del catálogo; otras_lineas).
   COMPUERTA: si `chats.chats_a_leer` es 0 y todo `control.candidatos` ya está en ya_registrado → «Sin novedad (HH:MM)» y termina.
   La corrida de las 21:45 nunca se salta.
2) Lee TODOS los /tmp/reporte/chats_XX.txt y /tmp/reporte/imagenes.md, y mira cada imagen con Read: en una captura de Yape/Plin
   anota monto, fecha, destinatario (Moises O.) y número de operación. **(v2)** Una captura con otro monto o de otro día NO baja el
   pedido a POR_VERIFICAR: es CONFIRMADO con «🚨 ATENCIÓN: …» y el detalle (monto visto, fecha). DNI, ubicación y direcciones en
   imagen sirven para completar el pedido. Si `control.otras_lineas` trae un número con chats activos:
   `python3 scripts/asesor/preparar.py api --dias 2 --linea N --salida /tmp/reporte_lN`, léelo y pon `lineas_revisadas: [N]`.
   Si un chat te deja duda: `python3 scripts/asesor/reporte.py chat <whatsapp> 60`.
3) Escribe /tmp/reporte/salida.json (solo estas claves; el sistema pone tipo, fechas, hora y origen):
   {"pedidos": [{"estado": "CONFIRMADO|POR_VERIFICAR|OTRO_DIA|INTENCION|DESCARTADO", "destino": "LIMA|PROVINCIA", "vendedora": "",
   "nombre": "", "whatsapp": "51…", "telefono": "", "dni": "", "direccion_o_agencia": "", "courier": "", "kits": 1, "empaque": "",
   "pago": "", "fecha_entrega": "AAAA-MM-DD", "nota": "", "tipo": "CAMBIO|REPOSICION (solo si aplica)", "motivo": "solo DESCARTADO"}],
    "incidencias": ["🚨 …"], "no_cuentan": [{"whatsapp": "", "motivo": ""}], "sin_marcar_compra": [{"whatsapp": "", "vendedora": "", "motivo": ""}],
    "saldos": [{"whatsapp": "", "nombre": "", "codigo": "TS-…", "monto": 69, "motivo": ""}], "quitar": [{"whatsapp": "", "motivo": ""}], "lineas_revisadas": []}
   - `pedidos`: SOLO lo nuevo o lo que cambió respecto a ya_registrado (el sistema lo suma por WhatsApp). Para sacar uno usa
     `quitar` con motivo; nunca se borra solo.
   - `vendedora` = la asesora del chat; si no hay, «(sin vendedora)». `fecha_entrega` = mañana para lo que sale mañana; la pedida si
     es OTRO_DIA.
   - PAGO **(v2, obligatorio)**: `pago` dice en texto lo que se pagó y lo que falta cobrar, con el monto: «Adelanto S/20 Yape 11-08
     13:01 (op 1234); saldo S/69», «Pagado S/89 por Yape (op …)», «Contraentrega S/89», «Efectivo exacto S/89», «Yape contraentrega
     S/69». Si el chat acordó un precio distinto (descuento, promo, otro artículo), el monto final va aquí. De este texto salen el
     saldo de Shalom y lo que cobra el motorizado de Dinsides.
   - EMPAQUE: el que empaca asume 1 kit normal. Todo lo distinto va en `empaque`: 2 kits, mazo u oráculo extra, otro modelo (Gold,
     Rider en español…), pedido del catálogo, collar o regalo prometido (líneas «📦 PROMETIDO» y mensajes V(auto: …) del día 7),
     lo que NO lleva (`kits: 0`, p. ej. «NO es kit: solo mazo Tarot Rider Waite de aprendizaje S/69»). Con precio cuando lo haya.
   - NOTA: SOLO lo que necesita el motorizado para entregar (otro número de contacto, a quién entregar, piso, portero, «llamar
     antes», horario pedido, discreción). Sin pagos, sin pin, sin apuntes internos (regla 5 de la v3, arriba). Lo que una persona
     debe resolver: «Confirmar: …». Lo que pida atención empieza con «🚨 ».
   - CUADRE: cada candidato de `control.candidatos` debe estar en `pedidos`, en `no_cuentan` con motivo concreto, o ya en
     ya_registrado. Lo que no expliques sale arriba del PDF en rojo.
   - META **(v2)**: si es venta según el criterio y el `embudo` del chat NO tiene `purchase`, va en `sin_marcar_compra`. El sistema la
     marca como compra en el CRM y le avisa a Meta (permiso del dueño 2026-11-09): tú solo la listas con el motivo.
   - Pago del saldo (captura de Yape o Plin, voucher de depósito BCP, o la vendedora que le da la clave tras «ya pagué») → `saldos`,
     con monto y cómo pagó. Sale en el reporte del dueño. Nunca marques pagado tú.
4) `python3 scripts/asesor/reporte.py enviar /tmp/reporte/salida.json`. Lee lo que imprime: avisos ℹ️ (destino, fecha, «provincia
   con adelanto visto → CONFIRMADO»), «⚠️ VERIFICAR» (promesas sin poner en `empaque`), «suenan a bot», «🧹 Agenda» (lo que el
   sistema cerró solo) y «🛍️ Compras marcadas». Si hay que corregir, corrige salida.json y vuelve a mandar (como mucho 2 veces).
   Si el envío falla por el Worker: `python3 scripts/asesor/reporte.py aviso "qué falló, en una línea"` y termina.
   En la corrida de las 23:45 `enviar` arma además el PDF «Saldos y reposiciones» y lo manda solo a Moi (línea «REPORTE DEL DUEÑO»).
   Si esa línea no sale en la última corrida de la noche: `python3 scripts/asesor/reporte.py enviar /tmp/reporte/salida.json --dueno`.
5) Respuesta final (máximo 8 líneas): corrida y fechas; ventas de hoy por vendedora (Lima / provincia); pedidos por registrar
   (confirmados, en rojo por revisar, por verificar, otros días, intención) y cuántos ya están registrados en el courier; saldos
   cobrados y reposiciones (solo el número: el detalle va a Moi); capturas miradas; cuadre con el CRM; compras marcadas; link del PDF.

Nunca mandes mensajes a clientes ni propongas textos. No hables de costos en dinero.
