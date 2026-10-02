# Plan de seguimientos (toques) — Tarot Store Perú

Armado el 2026-10-02 con los datos reales del CRM (D1: 1 015 chats y 14 623
mensajes desde el 22/09) y las skills follow-up-discipline,
re-engagement-sequencing, ghost-recovery-sequences y voz-tarot-store.

## Lo que dicen tus datos

| Dato | Valor | Qué significa |
|---|---|---|
| Compras (Purchase enviado a Meta) | 74 | |
| Compran en < 2 h desde su primer mensaje | 46 % | La venta se gana en caliente |
| Compran en < 12 h | 80 % | |
| Compran en < 24 h | 88 % | |
| Compran en < 3 días | 96 % | Después del día 3 casi nadie compra solo |
| Respuesta en 24 h a un seguimiento automático, 4–12 h después del último mensaje del cliente | 14 % | El mejor momento para el seguimiento dentro de la ventana |
| Lo mismo, a < 4 h / 12–20 h / 20–24 h | 9 % / 7 % / 7 % | |
| Mensajes mandados con más de 24 h de silencio del cliente | **2** | Hoy, del día 2 al 30, nadie le escribe a nadie |
| Volvieron a escribir tras ≥ 1 día de silencio | 52 chats | 38 de ellos tras un mensaje nuestro; 7 compraron después (6 tras un toque) |
| Chats que no compraron, por etapa | 2 conversó: 124 · 3 dijo destino: 73 · 4 le pidieron cierre: 167 | **~360 personas con intención real sin tocar** |
| Solo saludo del anuncio (etapa 1) | 544 | Frías: no se les gasta plantilla pagada |
| Vienen de anuncio Click-to-WhatsApp | 97 % | Las primeras 72 h, las plantillas son gratis |

Límite: son 10 días de historia, así que la cola de 7, 14 y 30 días todavía
no se puede medir. Por eso el plan trae un **grupo de control** (1 de cada 5
chats no recibe nada) para saber si los toques venden de verdad o solo
cuestan.

## El plan

Los toques van por **comportamiento**, no por calendario fijo: el día se
cuenta desde el último mensaje del cliente (o desde la compra), y si responde,
el reloj vuelve a 0. Según Dashly y ChatDaddy, las secuencias por
comportamiento convierten 30–50 % más que las por tiempo, y lo sano en
WhatsApp son 5–10 mensajes en 14–30 días.

### La escalera de ofertas (aprobada por el dueño el 02/10)

Regla de oro de recuperación (AsisteClick, eGrow): **el primer toque no regala
nada**, porque muchos compran solo con el recordatorio; el incentivo sube un
escalón por toque y **cada oferta reemplaza a la anterior, no se suman**. El
envío gratis y la contraentrega ya los tienes, así que no sirven de
incentivo: la escalera usa regalo, precio, bundle y compromiso mínimo.

| Escalón | Palanca | Por qué funciona | Costo para ti |
|---|---|---|---|
| Día 2 | **Valor**: "cada carta trae su significado" | Ataca la objeción n.º 1 ("no sé leer tarot") sin tocar el margen | 0 |
| Día 7 | **Regalo**: collar amuleto extra (S/19 de valor) "si lo separa esta semana" | Un regalo se percibe más valioso que S/10 de descuento y cuesta menos; plazo real | Costo del collar |
| Día 14 | **Precio o bundle**: kit S/79 **o** 2 kits S/149 "para regalar" (S/74,50 c/u) | Elección entre dos sí (no "¿sí o no?"); el bundle sube el ticket a S/149 | S/10 o margen del 2.º kit |
| Día 30 | **Compromiso mínimo**: separar con S/10 y recibirlo cuando quiera | Baja la barrera al mínimo; el "cierro su consulta" (breakup) es lo que más responde | 0 |

Clientes (ya compraron), sin descuento sobre el kit:

| Escalón | Palanca | Ticket |
|---|---|---|
| Día 7 | **Valor**: tirada de 3 cartas para practicar | Abre 24 h gratis; pide foto/reseña; detecta reclamos |
| Día 14 | **Precio de cliente**: The Classic S/49 en vez de S/69 (el precio de la web) | +S/49 |
| Día 30 | **Referidos**: la amiga que escriba de su parte y ella reciben un collar | Cliente nuevo por el costo de 2 collares |
| Día 60 | **Upgrade**: mazo Gold S/139 | +S/139 |

### A. No compró (etapa 2 o más)

| Toque | Cuándo | Plantilla | Mensaje | Botones |
|---|---|---|---|---|
| Ventana (ya existe) | 4–12 h | — | Seguimientos de respuestas rápidas y sugerencias, máx. 2 sin respuesta | — |
| **Día 2** (gratis: 72 h del anuncio) | 40–66 h de silencio, lead de < 70 h | `toque_d2` | Hola {{1}} ☺️ le cuento que cada carta del kit trae su significado impreso, así puede hacer su primera lectura desde el primer día ✨ ¿Le separo el suyo? | Sí, sepárelo · Tengo una duda |
| **Día 7** Lima | 7 días de silencio | `toque_d7_lima` | Hola {{1}} ☺️ si agenda su kit esta semana le regalamos un collar amuleto extra, y lo paga recién cuando el motorizado se lo entrega 🫶 ¿Se lo agendo? | Sí, agéndelo · Tengo una duda |
| **Día 7** provincia | 7 días de silencio | `toque_d7_provincia` | Hola {{1}} ☺️ si separa su kit esta semana le regalamos un collar amuleto extra 🫶 Con S/20 de adelanto se lo enviamos a su agencia y el resto lo paga al recoger. ¿Se lo separo? | Sí, sepárelo · Me da desconfianza |
| **Día 7** sin destino | 7 días de silencio | `toque_d7` | Hola {{1}} ☺️ si separa su kit esta semana le regalamos un collar amuleto extra, con envío gratis a todo el Perú 🫶 ¿Sería para Lima o para provincia? | Lima · Provincia |
| **Día 14** | 7 días tras el día 7 | `toque_d14` | Hola {{1}} ☺️ por estos 2 días le dejamos su kit en S/79, o 2 kits en S/149 si quiere regalarle uno a alguien especial ✨ ¿Cuál le separo? | 1 kit a S/79 · 2 kits a S/149 |
| **Día 30** | 16 días tras el día 14 | `toque_d30` | Hola {{1}} ☺️ no quiero incomodarle. Si aún le interesa, puede separar su kit con solo S/10 y lo recibe cuando usted quiera ✨ ¿Se lo dejo separado? | Sí, separarlo · Cerrar consulta |

El botón **"Me da desconfianza"** es a propósito: en provincia el silencio
después del adelanto casi siempre es desconfianza (negocio.md). El botón le da
permiso de decirlo y abre la ventana para que la vendedora mande fotos de
envíos reales o el Instagram (regla 14 de voz-tarot-store).

### B. Ya compró

| Toque | Cuándo | Plantilla | Mensaje | Botones |
|---|---|---|---|---|
| **Día 7** | 7 días tras la compra | `toque_post7` | Hola {{1}} ☺️ ¿qué tal le va con su kit? Si gusta le mando una tirada sencilla de 3 cartas para practicar esta semana ✨ | Sí, mándemela · Todo bien, gracias |
| **Día 14** | 7 días después | `toque_post14` | Hola {{1}} ☺️ como ya es cliente le dejamos el mazo The Classic Tarot en S/49 en vez de S/69, para practicar con otro diseño ✨ ¿Se lo envío? | Sí, lo quiero · Ahora no |
| **Día 30** | 16 días después | `toque_post30` | Hola {{1}} ☺️ si alguna amiga quiere aprender tarot y nos escribe de su parte, a las dos les regalamos un collar amuleto ✨ Solo reenvíele este mensaje 🫶 | Genial, lo comparto · Gracias |
| **Día 60** | 30 días después | `toque_post60` | Hola {{1}} ☺️ si ya domina sus cartas, el siguiente paso es el mazo Gold con bordes dorados, está en S/139 ✨ ¿Le mando fotos? | Sí, mándemelas · Ahora no |

### Qué responde la vendedora cuando tocan un botón

El botón abre 24 h de texto libre gratis. Al tocarlo, la conversación sube en
el CRM; la vendedora sigue con su voz de siempre:

| Botón | Respuesta de la vendedora |
|---|---|
| Sí, sepárelo / Sí, agéndelo / Sí, separarlo | Lima: "Claro!! ☺️ Me indica su ubicación 📍 y teléfono de quién lo va a recibir por favor ✨" · Provincia: "Muchas gracias! Me indica sus datos: nombre, DNI y agencia ☺️✨" (y el Yape de S/20) |
| Tengo una duda | "Claro ☺️ cuénteme, ¿qué le gustaría saber?" (y escuchar: no empujar) |
| Me da desconfianza | "Le entiendo ☺️ le paso fotos de los envíos de hoy por Shalom y nuestro Instagram para que nos conozca ✨" + fotos/video. Recién después, el adelanto |
| Lima / Provincia | Sigue la cadena Lima 1 o Provincia 1, recordándole el collar de regalo de esta semana |
| 1 kit a S/79 / 2 kits a S/149 | Pedir datos como arriba; anotar el precio en la nota del pedido (y "2 kits" en `empaque`) |
| Cerrar consulta | "Gracias por avisarnos ☺️ cualquier cosa aquí estamos ✨" (no vuelve a recibir toques) |
| Sí, mándemela (tirada) | Mandar la tirada de 3 cartas (pasado · presente · futuro) con una foto; pedir que mande la foto de la suya |
| Sí, lo quiero (Classic S/49) | Lima: agenda con motorizado; provincia: adelanto según negocio.md. `empaque`: "mazo The Classic Tarot" |
| Genial, lo comparto | "Gracias ☺️ cuando su amiga escriba, le guardamos su collar a las dos ✨" (anotar a quién refirió) |
| Sí, mándemelas (Gold) | Fotos del mazo Gold y precio S/139 |

Conviene guardar estas respuestas como respuestas rápidas en el CRM (⚡) con
el nombre del botón, para que la vendedora las mande con un toque.

### Reglas que no se rompen

- Un toque por chat y por tipo; la cadena 7 → 14 → 30 se corta si responde.
- No sale si alguien del equipo le escribió en las últimas 20 h, si tiene un
  seguimiento programado o si pidió que no le escriban ("Cerrar consulta",
  "no me interesa", "no gracias"…).
- Solo dentro de `HORARIO_ENVIO`, con su "escribiendo…" (`mandarConEscribiendo`).
- Tope de 40 plantillas pagadas por día (`TOQUES_MAX_DIA`).
- Grupo de control: chats con id múltiplo de 5. Se compara en
  `GET /api/asesor/toques`: enviados vs. control, % que respondió en 24 h y
  % que compró en 7 días. **Si a los 30 días el grupo que recibió toques no
  compra más que el control, se apaga ese toque.**
- Si en WhatsApp Manager baja la calidad del número (bloqueos), se apaga
  primero el toque de día 7 de leads.

### Costo

Las plantillas de marketing se cobran por mensaje según el país (ver el rate
card de Peru en WhatsApp Manager). Con el tope de 40 por día, en el peor caso
son 1 200 al mes. El día 2 sale gratis dentro de las 72 h del anuncio, y el
cliente que toca un botón abre 24 h de texto libre gratis para la vendedora.

## Cómo está hecho (y cómo prenderlo)

- `src/lib/toques.js`: el motor y los textos. Las 11 plantillas de arriba
  (Marketing, es_PE) **se crean solas en Meta** la primera vez que les toca a
  alguien; el día 7 elige la versión Lima, provincia o sin destino según el
  chat (`crm-destino.js`).
- `migrations/0043_crm_v43.sql`: tabla `toques`.
- `src/lib/plantillas.js`: aprobada/idioma/{{1}} de cada plantilla, compartido
  con el pedido web.
- **Falta prenderlo** (no se conectó: es envío automático de mensajes pagados
  y queda a decisión del dueño):
  1. Aplicar `migrations/0043_crm_v43.sql`.
  2. En `src/index.js`, dentro del cron de cada minuto, llamar a
     `procesarToques(env)` en los minutos `% 5 === 2` (su propia ejecución,
     por el tope de 50 consultas a D1).
  3. En `wrangler.jsonc`: `"TOQUES": "d2,d7,d14,d30,post7,post14,post30,post60"` y
     `"TOQUES_MAX_DIA": "40"`.

Fuentes: [AsisteClick — carritos abandonados por WhatsApp](https://asisteclick.com/en/blog/recuperar-carritos-abandonados-whatsapp/),
[eGrow — WhatsApp abandoned cart templates](https://www.egrow.com/en/blog/whatsapp-abandoned-cart-template-2026),
[Dashly — WhatsApp lead nurturing](https://www.dashly.io/blog/whatsapp-lead-nurturing/),
[ChatDaddy — WhatsApp Lead Nurturing](https://chatdaddy.tech/blog/whatsapp-lead-nurturing),
[WATI — WhatsApp drip campaign](https://www.wati.io/blog/whatsapp-drip-campaign),
[Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
