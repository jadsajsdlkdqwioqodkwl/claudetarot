# Estados de envío desde Shalom Pro y el panel de Lima — proyecto pendiente (notas y arquitectura)

> Pedido del dueño, 2026-11-02 (noche): «no lo voy a hacer ahorita, pero que la arquitectura esté activada y las notas
> estén ahí para mañana o pasado mañana». Estado: **arquitectura lista, Routine NO creada todavía.**

## El problema
Hoy el estado de un pedido sale solo de lo que el cliente escribe por WhatsApp. Muchas veces le entregan el pedido y
nunca escribe: el CRM, la hoja «Pedidos auto» y la pestaña Ventas se quedan en «pendiente». El dueño sí ve el estado
real en dos paneles web: **Shalom Pro** (provincia: cada envío con su número de orden, código de seguimiento y estado
«en agencia / entregado / pendiente de recojo») y **el panel del courier de Lima** (el dueño lo llamó «Insights» /
«incides.com»: **confirmar el nombre y la URL exacta el día que se arme**).

## Qué queremos
Una Routine **activable a mano** («Run now»), pensada para correr con **Claude Cowork en la computadora del dueño**
(el navegador local, con su sesión iniciada), que:
1. Abra Shalom Pro y el panel de Lima.
2. Lea los envíos del día (y los de los últimos 3 días que sigan sin estado final).
3. Cruce cada envío con el sistema (número de orden / DNI / nombre / teléfono) y actualice:
   - Pestaña **Ventas** (provincia): `ventas.py estado --dni … --estado "En camino|En destino|Pagado|Cancelado"`
     (ya existe; es el mismo estado que ve el cliente en su link de seguimiento).
   - Pestaña **«Pedidos auto»**: columna «Enviado» con `reporte.py enviado <whatsapp> "sí AAAA-MM-DD Shalom|Lima"`
     (listo desde 2026-11-02; deja de salir en la agenda pendiente del reporte nocturno).
   - CRM: etiqueta del chat (`POST /api/asesor/mandar` tipo `etiqueta`, ya existe) para «entregado» / «en agencia» /
     «devuelto», sin mandar ningún mensaje al cliente.
4. Deje un resumen (Telegram al dueño con `reporte.py aviso` o una página en CRM → Reportes): entregados, en agencia,
   devueltos, los que no encontró en el sistema y los que el sistema tiene y el panel no (para control de lo que entra
   y sale del negocio).

## Decisiones ya tomadas
- **Nada de contraseñas en el repo, en Routines ni en variables de entorno de la nube.** Cowork usa el Chrome del dueño
  con la sesión ya iniciada; si el panel pide login, Cowork **se detiene y le pide al dueño que inicie sesión** y luego
  sigue. No se intenta «iniciar sesión por él» ni guardar cookies.
- **Solo lectura en los paneles.** La Routine no crea ni edita envíos en Shalom ni en el courier: lee estados y los copia
  al sistema. Lo que no cuadre se lista, no se adivina.
- **Nunca se escribe al cliente.** Si un estado merece un mensaje (por ejemplo «ya está en agencia»), va a ✨ Sugerencias
  por `enviar.py` o lo decide la Routine de boletas; esta solo actualiza estados.
- **Idempotente:** correrla dos veces el mismo día no duplica nada (los estados se sobreescriben con el mismo valor; la
  columna «Enviado» no se vuelve a tocar si ya tiene algo).
- Modelo: Sonnet alcanza (es cruzar listas), con una sesión fija propia como las de boletas y del reporte.

## Piezas que ya existen (no hay que construirlas)
| Pieza | Dónde | Para qué |
|---|---|---|
| `ventas.py estado` | `scripts/asesor/ventas.py` → `POST /api/asesor/ventas` | estado de una venta de provincia por DNI |
| `boletas.py buscar --dni/--apellido/--telefono` | `scripts/asesor/boletas.py` | encontrar el chat y la venta de un envío de Shalom |
| `reporte.py enviado` / `GET /api/asesor/pedidos-sheet` | `scripts/asesor/reporte.py`, `src/api/asesor-pedidos-sheet.js` | leer la agenda pendiente y cerrar filas |
| `POST /api/asesor/mandar` tipo `etiqueta` | `src/api/asesor-mandar.js` | etiquetar el chat sin escribirle |
| `reporte.py aviso` | `scripts/asesor/reporte.py` | resumen corto al dueño por Telegram |
| Cowork + navegador local | skills `anthropic-skills:chrome-browser` / `computer-use` | abrir los paneles con la sesión del dueño |

## Lo que falta construir (el día del proyecto)
1. Un script `scripts/asesor/estados.py` con: `pendientes` (lo que el sistema espera que esté en camino: Ventas sin
   estado final + «Pedidos auto» sin «Enviado» de los últimos N días), `cruzar <archivo.json>` (recibe lo que Cowork
   leyó de los paneles, por orden/DNI/teléfono, y aplica los tres cambios de arriba) y `resumen`.
2. El prompt de la Routine (manual, sin cron) con los pasos: pedir login si hace falta → leer Shalom Pro → leer el
   panel de Lima → escribir `/tmp/estados/leido.json` → `estados.py cruzar` → `estados.py resumen`.
3. Confirmar con el dueño la URL del panel de Lima y qué estados muestra cada panel (para el mapa de estados).
4. Opcional: pestaña «Movimientos» en el libro (fecha, pedido, salió/llegó/devuelto, cobro) para el control de lo que
   entra y sale; si se hace, va por el mismo endpoint de hojas del Worker.

## Dudas abiertas para el dueño
- ¿Cowork corre en la computadora del dueño (navegador local con su sesión) o en la nube? En la nube no hay sesión
  iniciada y haría falta un login cada vez: por eso la propuesta es local y manual.
- ¿Qué estado de Shalom equivale a «cobrar saldo»? (hoy el cobro se cierra cuando se manda el código de 4 dígitos; ver
  `docs/boletas.md`). Si «entregado» en Shalom debe cerrar el cobro solo, hay que decirlo.
- ¿Devoluciones: se marcan en Ventas como «Cancelado» o quieren otro estado?
