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
cuenta desde el último mensaje del cliente, y si responde, el reloj vuelve a
0. Lo hacen los equipos de WhatsApp que más venden: según Dashly/ChatDaddy,
las secuencias por comportamiento convierten 30–50 % más que las por tiempo,
y lo sano en WhatsApp son 5–10 mensajes en 14–30 días.

### A. No compró (etapa 2 o más)

| Toque | Cuándo | A quién | Costo | Mensaje (plantilla, botones) |
|---|---|---|---|---|
| Ventana (ya existe) | 4–12 h | Todos | Gratis | Seguimientos de respuestas rápidas y sugerencias, máx. 2 sin respuesta |
| **Día 2** | 40–66 h de silencio | Etapa ≥ 2, lead de < 70 h | **Gratis** (72 h del anuncio) | "Hola {{1}} ☺️ le cuento que cada carta del kit trae su significado impreso, así puede hacer su primera lectura desde el primer día ✨ ¿Le separo el suyo?" · [Sí, sepárelo] [Tengo una duda] |
| **Día 7** | 7 días de silencio | Etapa ≥ 3 | Pagado | "Hola {{1}} ☺️ esta semana salieron kits a todo el Perú con envío gratis, y en Lima se paga recién al recibir 🫶 ¿Le gustaría que le separe uno?" · [Sí, quiero el mío] [Tengo una duda] |
| **Día 14** | 7 días después del de día 7 | Si salió el de día 7 | Pagado | "Hola {{1}} ☺️ para que se anime le podemos dejar su kit de tarot en S/79 con envío gratis ✨ ¿Se lo separo?" · [Sí, lo quiero] [Ahora no] |
| **Día 30** | 16 días después | Si salió el de día 14 | Pagado | "Hola {{1}} ☺️ no quiero incomodarle, ¿le sigue interesando el kit de tarot o cierro su consulta?" · [Aún me interesa] [Cerrar consulta] |

Por qué así:
- **Día 2** cae justo cuando se apaga el 96 % de las compras y todavía es
  gratis. Ataca la objeción más común ("no sé leer tarot") con lo que el
  cliente aún no sabe.
- **Día 7**: prueba social y riesgo cero (envío gratis, contraentrega en Lima).
- **Día 14**: la herramienta de cierre que permite `negocio.md` para quien se
  enfrió: S/79. No se combina con el collar.
- **Día 30**: el mensaje de "cierro su consulta" (breakup) es el que más
  responde de toda la cadena. El botón "Cerrar consulta" lo saca para siempre.

### B. Ya compró

| Toque | Cuándo | Mensaje | Para qué |
|---|---|---|---|
| **Día 7** | 7 días tras la compra | "¿Qué tal le va con su kit? Si gusta le mando una tirada sencilla para practicar esta semana ✨" · [Sí, mándemela] [Todo bien, gracias] | Abre la ventana gratis de 24 h, pide foto o reseña y detecta reclamos a tiempo |
| **Día 14** | 7 días después | "A varias clientas les gustó sumar el mazo The Classic Tarot para practicar con otro diseño, está en S/69 ✨ ¿Le cuento más?" · [Sí, cuénteme] [Ahora no] | Venta cruzada (también oráculos y collares S/19 a mano) |
| **Día 30** | 16 días después | "Gracias por confiar en nosotros. Si alguna amiga quiere aprender tarot, puede escribirnos de su parte y la atendemos con cariño ✨" | Referidos, sin promoción |

**Pregunta para el dueño**: ¿se puede ofrecer un collar de regalo a la clienta
y a la amiga que llegue de su parte? No está en `negocio.md`; si dices que
sí, se agrega al texto del día 30.

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

- `src/lib/toques.js`: el motor. Las plantillas `toque_d2`, `toque_d7`,
  `toque_d14`, `toque_d30`, `toque_post7`, `toque_post14` y `toque_post30`
  (Marketing, es_PE) **se crean solas en Meta** la primera vez que les toca a
  alguien.
- `migrations/0043_crm_v43.sql`: tabla `toques`.
- `src/lib/plantillas.js`: aprobada/idioma/{{1}} de cada plantilla, compartido
  con el pedido web.
- **Falta prenderlo** (no se conectó: es envío automático de mensajes pagados
  y queda a decisión del dueño):
  1. Aplicar `migrations/0043_crm_v43.sql`.
  2. En `src/index.js`, dentro del cron de cada minuto, llamar a
     `procesarToques(env)` en los minutos `% 5 === 2` (su propia ejecución,
     por el tope de 50 consultas a D1).
  3. En `wrangler.jsonc`: `"TOQUES": "d2,d7,d14,d30,post7,post14,post30"` y
     `"TOQUES_MAX_DIA": "40"`.

Fuentes: [Dashly — WhatsApp lead nurturing](https://www.dashly.io/blog/whatsapp-lead-nurturing/),
[ChatDaddy — WhatsApp Lead Nurturing](https://chatdaddy.tech/blog/whatsapp-lead-nurturing),
[WATI — WhatsApp drip campaign](https://www.wati.io/blog/whatsapp-drip-campaign),
[Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
