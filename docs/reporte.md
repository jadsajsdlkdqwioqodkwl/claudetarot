# Reporte «Pedidos y ventas» — cómo funciona HOY (registro práctico)

> Estado ACTUAL. Se reescribe cuando cambia algo; la historia está en `docs/MAPA.md` y los prompts en `docs/routines.md`.
> Última revisión: 2026-11-02 (dueño: un solo reporte unificado, criterio liberal, memoria en la hoja «Pedidos auto»).

## Qué es
Un solo PDF por la noche, para Moi y Danitza, que junta lo que antes eran dos reportes (ventas 22:00/23:30 y el cierre
de pedidos de las 22:30): las **ventas de HOY** (por vendedora, Lima y provincia) y los **pedidos que salen MAÑANA**
(empaque, incidencias, confirmados, por verificar, otros días, agenda pendiente, descartados con motivo, pedidos web).

- Corridas: **21:45 · 22:30 · 23:45** (Lima). Cada una suma a la anterior; la primera lee hoy y ayer completos, las
  siguientes solo los chats con movimiento desde el corte anterior. Si no hay nada nuevo, responde «Sin novedad».
- Routines (dos cron, una sola sesión fija de Sonnet `session_017wTF8ZruCb5hT61H2LkhRX`, «Reporte de pedidos y ventas
  (sesión fija)»): `trig_016KfxjJWbHhxrEehCxH9Mri` (`CRON_TZ=America/Lima 45 21,23 * * *`) y
  `trig_017dC3qg4T65tGRG7JXcq2hE` (`CRON_TZ=America/Lima 30 22 * * *`). Mismo prompt (`docs/routines.md`, 2026-11-02).
  El dueño también puede darle «Run now» en claude.ai: va a la misma sesión, con su historial.
- Reemplaza a: «Asesor — reporte de ventas (22:00)» `trig_01XkT6T8HZstc4YDvVwZHyXP` y «… (23:30, cierre)»
  `trig_011ZpgQqhVKEnzhDG89RJqjq` (apagadas 2026-11-02, no borradas) y al cierre de las 22:30 de «Asesor — mensajes y
  cierre» `trig_01PN2ZZaL1MzG9AMB8Nj6PoS`, que ahora se llama «Asesor — mensajes (11:30 · 16:30)», cron `30 11,16`,
  y manda siempre con `--solo-mensajes`.

## Criterio (del dueño, 2026-11-02): LIBERAL, lo verifica una persona
| Estado | Cuándo | Dónde sale |
|---|---|---|
| CONFIRMADO | Lima: dio dirección. Provincia: captura del adelanto (o la vendedora ya le confirmó) + nombre, DNI y agencia | ✅ Lima / Provincia confirmados (cuentan como venta) |
| POR_VERIFICAR (= POR_CONFIRMAR) | Huele a venta pero falta algo: «ya yapeé» sin captura, captura de otro día/monto, dirección a medias, sin destino claro | 🟡 POR VERIFICAR — confírmalo en el chat antes de empacar |
| OTRO_DIA + `fecha_entrega` | Pidió otra fecha (incluye Lima confirmado con entrega en otro día: el sistema lo mueve solo) | 📅 Otros días + queda en la agenda |
| INTENCION | Preguntó precio / dijo que compra sin dar nada | 🔥 Intención |
| DESCARTADO + `motivo` | Se revisó y no es venta | 🗂️ Descartados con motivo (nunca se esconde) |
| tipo CAMBIO / REPOSICION | Reclamo que obliga a mandar algo | 🚨 Salen en este despacho |

Lo que el CRM tiene como venta (compra marcada, pedido web o de catálogo) y el reporte no explica ya **no frena el envío**:
sale arriba del PDF, en rojo («EL CRM TIENE COMO VENTA Y EL REPORTE NO LO EXPLICA»), para que una persona lo mire.

## La memoria (por qué Katia Reyes ya no se pierde)
Caso real: Katia Reyes (942 739 488) compró el 30/10 para entrega el lunes 2/11. Salió en el reporte del 30 como «Otros
días» y quedó agendada en el registro del 2/11, pero los reportes del 31/10 y 1/11 no la mostraban: un pedido para otro
día desaparecía hasta su fecha. Ahora:
1. **Registro por fecha de despacho** (`pedidos-estado/FECHA.json` en el Worker, `pedidos_estado.py`): cada corrida suma,
   nada se borra solo (`quitar` con motivo), y guarda el `corte` para que la siguiente lea solo lo nuevo.
2. **Pestaña «Pedidos auto»** del libro «Pedidos Tarot Kit» (`GET/POST /api/asesor/pedidos-sheet`,
   `src/api/asesor-pedidos-sheet.js`): una fila por pedido (fecha venta, entrega, nombre, WhatsApp, destino, estado,
   vendedora, dirección/agencia, kits, empaque, pago, nota, reporte, actualizado, **Enviado**). El sistema hace upsert
   por WhatsApp entre las filas sin «Enviado». **La columna «Enviado» la escribe una persona** (un «sí» o la fecha) y el
   sistema nunca la toca.
3. **Agenda pendiente en cada reporte**: toda fila sin «Enviado» (atrasadas, de hoy, futuras, sin fecha) sale en la
   sección «📌 AGENDA PENDIENTE» de cada PDF hasta que alguien marque la fila. Las atrasadas salen con 🚨.

## Dónde está cada cosa
- `scripts/asesor/reporte.py`: `preparar` (fechas, registro previo, agenda de la hoja, chats de `preparar.py`, capturas
  de `imagenes.py`, control del CRM), `enviar salida.json` (completa tipo/fechas/hora/origen y llama a `enviar.py`),
  `ver [FECHA]`, `chat <whatsapp> [N]`, `aviso "texto"` (Telegram al dueño si no pudo salir).
- `scripts/asesor/enviar.py`: `tipo_reporte: "unificado"` → `normalizar_unificado` (sinónimos de estado, DESCARTADO →
  `descartados`, Lima con otra fecha → OTRO_DIA, sin destino → por verificar, vendedora vacía → «(sin vendedora)»),
  cuadre con `control_ventas` sin frenar, `agenda_sheet` / `guardar_en_sheet`, PDF `pedidos-y-ventas-FECHA-HHMM.pdf`,
  Telegram a dueño + Danitza (`REPORTE_AGENTES`), registro con `pedidos_estado.registrar` + corte.
- Prueba: `python3 scripts/asesor/pruebas/test_pdf_unificado.py` (y siguen `test_pdf_ventas.py`, `test_pedidos_estado.py`).
- El formato viejo (`tipo_reporte: "ventas"` y el de pedidos de las 10:30) sigue funcionando igual.

## Qué ya NO pasa
- Dos PDFs distintos por la noche (ventas solo al dueño + cierre de pedidos). Ahora uno, a los dos.
- Un reporte que no sale porque «no cuadra con el CRM»: sale igual y lo que falta va en rojo.
- Un pedido para dentro de una semana o un mes que desaparece de los reportes intermedios.
- `sys.exit` por un pedido sin vendedora o sin destino: se completa o se manda a verificar.

## Primera corrida real (2026-11-01 22:30 Lima) y lo que se ajustó
Salió bien: PDF a los dos, 25 pedidos, hoja con 22 filas, 2 agendados. Ajustes: el cuadre con el CRM se hace después de
sumar lo registrado (lo explicado en una corrida vale para las siguientes), el origen no repite la hora, y una fila con
nota de relleno («ya registrada…») no pisa lo registrado. Cada reenvío de `reporte.py enviar` manda otro PDF por
Telegram: la Routine solo reenvía si corrigió algo (máximo 2 veces).
