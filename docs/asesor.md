# Asesor de ventas (Routines de Claude + Worker)

## Cómo está armado

| Pieza | Dónde corre | Costo |
|---|---|---|
| Guardar chats, seguimientos programados, carrito (apagado) | Worker, cron `*/5` | Cloudflare |
| Export de chats a la hoja de Google | Worker, cron `*/10` | Cloudflare (solo para humanos; el bot ya no la usa) |
| Leer chats, clasificar pedidos, redactar mensajes, leer boletas | Routines 11:30 · 16:30 · 21:00 · 22:30 | Plan de Claude |
| Director CRO (embudo, experimentos, respuestas rápidas nuevas) | Routine 7:52 | Plan de Claude |
| Aprobar / enviar / programar | CRM → ✨ Sugerencias | — |

Endpoints del bot (cabecera `x-asesor-clave`): `/api/asesor/chats`, `/contexto`,
`/sugerencias`, `/avisos`, `/ventas`, `/memoria`. Scripts en `scripts/asesor/`.

## Cómo aprende sin editar `negocio.md`

`negocio.md` queda solo para las reglas fijas (precios, qué se puede ofrecer).
Lo demás se alimenta solo y llega en cada corrida por `contexto.py`:

1. **Respuestas rápidas vigentes**: se leen en vivo del CRM.
2. **Qué pasó con cada propuesta**: aprobada o descartada y por quién.
3. **Correcciones humanas**: `texto_original` vs. lo que se aprobó. El bot
   imita el "después".
4. **Resultado**: si el cliente respondió en 24 h y si terminó en compra
   (`meta_tags` purchase).
5. **Memoria**: lecciones con evidencia que las corridas anotan y retiran
   (`memoria.py`, tabla `asesor_memoria`). El director CRO anota 1–3 por
   día y el asesor hasta 2 por corrida.

## Revisión (29/09): hecho y pendiente

Hecho:
- Los chats se leen directo de D1. Antes se bajaba la hoja por Drive con 10
  minutos de retraso y se decodificaba el base64. Ahora tarda 0,6 s, sin Drive
  y sin la dependencia de openpyxl.
- A las 11:30 y 16:30 solo se leen los chats que se movieron
  (`--activos-horas`), con menos tokens por corrida.
- Se encontró la causa de los envíos fallidos: Cloudflare bloqueaba el
  User-Agent de Python (1010).
- Las sugerencias se guardan antes de avisar por Telegram.
- Ciclo de aprendizaje (arriba).

Siguiente, en orden de impacto:
1. **Detección de ventas sin IA, en el Worker.** Las señales claras (mandó
   ubicación, mandó imagen justo después de que le pidieron el adelanto, dio
   DNI) pueden marcar "Venta posible" en el momento, en el cron `*/5`. El bot
   solo confirmaría los dudosos: menos lectura y el CRM al día.
2. **Pedidos en D1 en lugar de JSON en Drive.** La corrida de las 22:30 hoy
   baja el archivo de las 21:00. Con una tabla `asesor_pedidos` (fecha,
   cliente, estado, nota) las corridas trabajarían por diferencia y el PDF
   saldría del Worker.
3. **Unir 21:00 y 22:30** cuando la 1 esté lista: con la base al día, una
   sola corrida a las 22:30 alcanza. La de las 21:00 existe porque el reporte
   tarda.
4. **Etiquetar Venta/Interés automáticamente** desde la clasificación del bot
   (hoy solo sugiere): evita que se pierdan ventas no marcadas.
5. **Plantilla utility de envío** (`PLANTILLA_ENVIO`) para mandar el link de
   la boleta fuera de las 24 h.
6. **Olva** en Ventas y en la página de seguimiento.
7. **Apagar el export a Sheets** si nadie del equipo lo lee: ahorra escrituras
   cada 10 minutos.
