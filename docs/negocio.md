# Cómo funciona Tarot Store Perú (para el asesor y el director CRO)

Lo leen las Routines de Claude antes de proponer mensajes, respuestas rápidas o
experimentos. Si algo cambia en el negocio, se cambia aquí. Las respuestas
rápidas vigentes (el texto exacto que usan las vendedoras) se bajan en vivo con
`scripts/asesor/contexto.py`.

## Producto y precios
- **Kit Tarot de aprendizaje: S/89.** Incluye mazo Rider-Waite completo de 78
  cartas con los significados impresos (también chakras y numerología), manual
  ilustrado en español, tapete floral y collar amuleto de regalo.
- 2 kits: S/149.
- Otros: The Classic Tarot Rider Waite (solo mazo) S/49 en la web; por WhatsApp
  se han vendido Classic S/69 y Gold S/139, collares amuleto sueltos S/19 c/u y
  oráculos. Si el cliente pide algo fuera del kit, confirmarlo con la vendedora.
- El mazo **no es el Rider-Waite "original" de marca**: es un mazo de
  aprendizaje con significados. No prometer "original" (hubo un reclamo por eso).
- Envío **gratis** a Lima y provincia.

## Lima
- Contraentrega: paga al recibir con Yape, efectivo exacto o tarjeta.
- Se agenda de un día para otro; el motorizado entrega de 12 a 5 pm y llama
  antes. Los pedidos se registran hasta las 11 pm para salir al día siguiente.
- Para agendar hace falta: ubicación (📍 o dirección) y teléfono de quien recibe.
- Venta = dio dirección y quedó agendado.
- **Regla del dueño (2026-10-14):** en Lima la venta ocurre cuando el cliente pasa su dirección (y teléfono de quien recibe). Que la vendedora diga "confirmado" de palabra sin eso NO es venta: es otra cosa o error de asesor.

## Provincia
- Por Shalom u Olva (agencia que elija el cliente).
- Adelanto de **S/20** por Yape al 927633099 (Moisés O.); el resto lo paga al
  recoger. El adelanto cubre el envío y evita cancelaciones.
- Datos para despachar: nombre completo, DNI y agencia de destino.
- Venta = mandó el adelanto + sus datos.
- **Regla del dueño (2026-10-14):** en provincia la venta ocurre cuando el cliente manda el adelanto (captura, o la vendedora ya confirmó que llegó el Yape) más sus datos. Una confirmación verbal sin adelanto NO es venta: es otra cosa o error de asesor (va a POR_CONFIRMAR y a `incidencias`).
- Al día siguiente se le manda el comprobante; Shalom entrega una boleta días
  después. Clave de retiro de Shalom: 3114 (respaldo 3144 y 3143).
- Link de seguimiento `/TS-XXXXXXX`: se le manda el mismo día de la venta
  (dentro de las 24 h) y ahí aparece su boleta cuando sale.

## Herramientas de cierre que SÍ se pueden ofrecer
Úsalas cuando destraban una venta real, nunca de entrada a quien recién pregunta
ni a todos: si el cliente dijo "caro" o pidió rebaja, de inmediato; si se enfrió
después de que le pidieron el cierre, como último paso de una secuencia; y en
reprogramaciones.
- **Descuento de S/10**: kit a **S/79**.
- **Collar amuleto adicional** de regalo (además del que ya trae el kit).
- Separar un pedido para otra fecha con un adelanto mínimo de S/10.
No combinar las dos primeras en el mismo cliente sin que lo decida el dueño.
- **Escalera de los toques automáticos** (aprobada por el dueño el 02/10,
  `docs/plan-seguimientos.md`): día 7 collar extra "si lo separa esta semana";
  día 14 kit S/79 **o** 2 kits S/149; día 30 separar con S/10. Cada oferta
  reemplaza a la anterior. Si el cliente responde a un toque, se le respeta la
  oferta de ese toque.
- **Clientes que ya compraron**: The Classic Tarot a S/49 (precio de la web)
  en vez de S/69; mazo Gold S/139.
- **Referidos** (aprobado por el dueño el 02/10): si una amiga escribe de parte
  de una clienta y compra, las dos reciben un collar amuleto de regalo.
Cualquier otra promoción (2x1, más descuento, envío express) = decisión del dueño.

## Reglas de WhatsApp
- Texto libre solo dentro de las 24 h desde el último mensaje del cliente.
  Fuera de eso, solo plantillas aprobadas (se pagan).
- Seguimiento: como mucho 2 mensajes automáticos seguidos sin respuesta, una
  sola cadena por chat (se cancela sola si responde o si le escribimos); nada
  de mensajes masivos: cada chat se lee antes de escribirle.
- Estilo de las vendedoras: cálido, "estimad@", ☺️✨🫶, 2–3 líneas, una sola
  acción clara al final ("¿Para dónde lo desea? 📍").

## Objeciones frecuentes y cómo se responden hoy
- "¿Es confiable?" → perfil de Instagram con envíos reales y pago contraentrega.
- "¿Por qué adelanto?" → cubre el envío a la agencia y reserva el kit; el resto
  al recoger.
- "¿Puedo leerme a mí mismo?" → sí, el kit está hecho para aprender solo.
- "Hoy no puedo recibir" → se agenda para otro día o se separa con S/10.
- **Silencio después del adelanto (provincia)**: casi siempre es desconfianza
  de pagar antes a alguien que no conoce, o que no terminó de entender qué
  trae el kit. Primero se le da espacio ("¿le quedó alguna duda?", ofrecer
  fotos de envíos o el Instagram); después, si hace falta, la herramienta de
  cierre.
- "Estoy de viaje" / "a fin de mes" → separar con S/10 para esa fecha (se
  puede sumar el collar amuleto de regalo, no el descuento).
- **Cuándo cuenta el día de una venta (corregido 2026-10-14, igual que el CRM «Compra · día»):** el día del adelanto (provincia) o de la dirección (Lima). Si el adelanto llegó un día y los datos otro, cuenta el día del adelanto (Edon, Espinar: compra del 11/10 aunque pasó los datos el 13/10). La venta es de la ASESORA DEL CHAT en el CRM (campo `asesora` de meta.json), aunque otra vendedora haya hecho la confirmación final (Magali: chat de Jennifer, confirmó Danitza).

## Cómo hacer un buen reporte de ventas (aprendido el 2026-10-14, del dueño)
1. **Lee TODOS los chats con mensajes del día, uno por uno.** Filtrar por palabras («agendado», «DNI», «confianza depositada») deja ventas fuera: el primer reporte de ese día omitió todas las de Lima de la mañana.
2. **Cuadra la cuenta con el CRM.** Cada chat con embudo `purchase` y actividad ese día se explica: o es venta de hoy, o es compra de otro día (y se dice de cuál). Los dudosos se leen completos (adelanto de un día y datos de otro, cliente que suspende, saldos y boletas de ventas anteriores).
3. **Día de la venta** = día del adelanto (provincia) o de la dirección (Lima), como «Compra · día» del CRM. El adelanto de otro día NO suma hoy.
4. **Vendedora** = asesora del chat en el CRM (`asesora` en meta.json), aunque otra haya hecho la confirmación final.
5. **Venta sin lo mínimo no cuenta** (confirmación verbal sin dirección / sin adelanto): va a POR_CONFIRMAR e `incidencias`.
6. **Separa hoy de otros días** (`OTRO_DIA` con su fecha) y di cuántas salen para cuándo.
7. **Marca lo que cambia el despacho** en `nota`/`empaque`: sin dirección exacta ni teléfono de quien recibe, horario pedido, vuelto, baraja o extra distinto al kit, agencia no indicada, modelo por revisar.
8. **Verifica los números antes de enviar**: el total por vendedora, Lima/provincia y otro día debe sumar lo mismo; revisa la tabla del PDF y no repitas un número sin sumarlo.
9. **Formato:** siempre PDF con tablas por `enviar.py salida.json` (`tipo_reporte: "ventas"`), nunca texto plano ni `--informe`. Al responder, da el total, por vendedora, Lima/provincia y el link.
10. **Di qué no revisaste** (p. ej. si no se registraron en la pestaña Ventas o no hay saldos) en vez de callarlo.
11. **Cuadre automático con el sistema (2026-10-15).** Corre `control_ventas.py AAAA-MM-DD`: trae del Worker las compras marcadas en el CRM, los pedidos de la web y del catálogo y los chats activos por número de WhatsApp. Cada candidato va en `pedidos` (aunque sea OTRO_DIA o POR_CONFIRMAR) o en `no_cuentan` [{whatsapp, motivo}]; una venta confirmada que el CRM no conoce va en `sin_marcar_compra`. `enviar.py` NO envía el PDF si algo no cuadra (y tampoco si no puede consultar el Worker; solo en emergencia `--sin-control`, y se dice en el informe).
12. **Otros números de WhatsApp:** `preparar.py` lee por defecto solo Tarot Store. Si `control.json` muestra chats activos en otra línea, léelos con `--linea N` y pon `lineas_revisadas: [N]`.
13. **Imágenes y audios:** el transcript solo dice `[imagen]` o `[audio]`; la captura del adelanto o una dirección dictada no se ven. Para eso valen la confirmación de la vendedora («gracias por la confianza», «le enviamos el comprobante») y la compra marcada en el CRM; si hay imagen o audio del cliente y nada de eso, va a POR_CONFIRMAR con la nota «revisar imagen/audio», nunca se descarta.
14. **Capturas (2026-10-15):** `imagenes.py` baja las imágenes del cliente y se MIRAN con Read. Una captura confirma el adelanto solo si el monto (S/20), la fecha y hora (del día reportado), el destinatario (Moises O.) y el n.º de operación cuadran; si no, POR_CONFIRMAR con «🚨 revisar captura».
15. **Corridas que se complementan (desde el 2026-10-15 son 22:00 y 23:30; antes eran 22:00 · 23:00 · 00:00):** cada una lee solo lo nuevo desde la anterior y `enviar.py` suma todo al estado del día; el PDF siempre trae el día completo.
