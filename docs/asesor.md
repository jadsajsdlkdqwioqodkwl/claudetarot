# Asesor de ventas (Routines de Claude + Worker)

## Cómo está armado

| Pieza | Dónde corre | Costo |
|---|---|---|
| Guardar chats, seguimientos programados, carrito (apagado) | Worker, cron `*/5` | Cloudflare |
| Export de chats a la hoja de Google | Worker, cron `*/10` | Cloudflare (solo para humanos; el bot ya no la usa) |
| Leer chats, clasificar pedidos, redactar mensajes, leer boletas | Routines 11:30 · 16:30 · 21:00 · 22:30 | Plan de Claude |
| Director CRO (embudo, pruebas de mensajes, respuestas rápidas nuevas) | Routine 7:52 | Plan de Claude |
| Coaching y voz del cliente (semanal) | Routine lunes 7:37 | Plan de Claude |
| Etapa del embudo de cada chat, reparto de versiones en prueba | Worker, cron `*/5` | Cloudflare (sin IA) |
| Resumen semanal por correo | Apps Script (`resumenSemanal`) → `GET /api/asesor/resumen` | Gratis (Gmail + Worker, sin IA) |
| Aprobar / enviar / programar / decidir pruebas | CRM → ✨ Sugerencias y ⚡ editar respuesta | — |

**Telegram, lo único que sale**: el PDF de pedidos al dueño y **un solo aviso**
al equipo y al dueño, "✨ Hay N recomendaciones listas para revisar y enviar",
como mucho uno por hora (`src/lib/crm-avisos.js`). Antes llegaba un mensaje
por cada propuesta, los trozos del informe y el resumen: ya no. El informe
del director queda en CRM → Reportes.

**Cómo escribe el bot**: `CLAUDE.md` (lo lee cada Routine) le pide leer
`docs/negocio.md`, `contexto.py` y la skill `voz-tarot-store` (ejemplos
reales de las vendedoras). `enviar.py` descarta y lista las propuestas con
tics de bot (guion largo, MAYÚSCULAS, tuteo, más de una pregunta, más de 4
emojis, más de 420 caracteres, el mismo texto a más de 2 clientes).

**Nada llama a la API de Claude** (se cobra por uso aparte del plan). Lo que
queda de IA corre en las Routines con el plan. El Apps Script ya no la usa
(se quitaron el análisis diario y el botón "Sacar pedidos (Claude)"): si en
sus Propiedades del script quedó `ANTHROPIC_API_KEY`, bórrala.

Endpoints del bot (cabecera `x-asesor-clave`): `/api/asesor/chats`, `/contexto`,
`/sugerencias`, `/avisos`, `/ventas`, `/memoria`, `/analisis`, `/resumen`.
Scripts en `scripts/asesor/`. Skills en `.claude/skills/` (ver su README).

## Crons del Worker y el tope de 50 consultas

El plan gratis de Cloudflare corta cada ejecución en **50 consultas a D1** y
50 llamadas externas. Por eso cada cron hace poco y con consultas en lote:

| Cron | Qué hace |
|---|---|
| `*/5` | Seguimientos vencidos: los reserva (pendiente → enviando) y manda hasta 12 por pasada, ~2 consultas cada uno. Lo reservado hace más de 15 min sin salir queda fallido (nunca se reenvía a ciegas). Carrito abandonado (apagado si no hay `CARRITO_AUTO_HORAS`), de a 8. |
| `*/10` | Export de chats a la hoja de Google. |
| `*/15` | Link de envío automático, resumen semanal / pruebas listas (una vez al día; esa pasada no hace más), etapa del embudo (3 consultas) y frases (≈4). |

## Link de seguimiento (a mano)

Ya **no sale solo**. En el panel derecho del chat, "Link de seguimiento del
pedido" → **🔗 Preparar el link**: busca su venta abierta en la pestaña
Ventas por el celular, arma el texto con la respuesta rápida **"Link de
envío"** (`{link}` y `{nombre}` ya puestos), la vendedora lo revisa, lo
edita si quiere y lo manda (`/api/crm/link-envio`). También se puede mandar
desde Links de Shalom. Queda anotado en `envio_links` como enviado. El cron
cancela cualquier link automático que hubiera quedado programado.

## Saldo desde la captura

El asesor ve las imágenes de los chats. Si un cliente de provincia mandó la
captura del pago del saldo, la propone en `saldos` de `salida.json` (con el
código TS-… si lo sabe; si no, se busca por el celular en Ventas). Aparece en
✨ Sugerencias como "💸 Pagó el saldo", con la conversación y la foto, solo
para quien maneja Shalom. **Confirmar saldo pagado** deja el saldo en 0 y la
página del cliente le muestra su clave. Nunca se marca solo.

## Pruebas de mensajes (respuestas rápidas y bienvenida)

- El director CRO **no crea respuestas rápidas parecidas**: propone
  `variantes` en `salida.json` (`ref_tipo` + `ref_id`, los ids salen en
  `contexto.py`) con la hipótesis en `motivo`. Llegan a ✨ Sugerencias solo
  para el admin ("🧪 Probarla").
- El Worker reparte qué versión sale: en la bienvenida, al mandarla; en las
  respuestas rápidas, cuando la vendedora la elige (con `/` o con ⚡ en el
  chat), su texto aparece en el cuadro y ella lo manda o lo edita como
  siempre. Debajo de cada respuesta con versiones hay botones **1·2·3** (1 =
  la original), y encima del cuadro también, para cambiar de versión con un
  toque. Lo elegido a mano queda anotado (`a_mano`) y no cuenta para el
  reparto ni para los números de la prueba: la vendedora elige según el
  cliente y la comparación dejaría de ser pareja. Mide "avanzó de etapa", "respondió en 24 h", "cerró" y si la
  editaron. Menos de 20 usos por versión = reparto parejo; después, muestreo
  de Thompson con piso de 10 % (`src/lib/crm-variantes.js`).
- Decide el admin: ⚡ → editar la respuesta (o Bienvenida → editar paso) →
  "Quedarse con esta". El texto viejo queda guardado y la cuenta de la
  original vuelve a 0 cada vez que su texto cambia.
- Máximo 3 versiones en prueba por mensaje.
- **Todo el equipo** puede ver, agregar y editar versiones (⚡ → lápiz de la
  respuesta). Editar crea una versión nueva que se mide desde 0. Cerrar la
  prueba y quitar versiones: solo el admin.
- **En un solo mensaje**: en una respuesta rápida, "+ En un solo mensaje"
  parte de su texto y se le suman los que van después con ⚡ Respuestas
  rápidas. En el primer paso de la bienvenida arma una versión que
  reemplaza toda la secuencia, con una foto o video opcional (se elige entre
  los de la bienvenida). Así se mide si 1 mensaje cierra más que 8.
- **Botones 1·2·3 en todos lados**: en el chat, en ⚡ Respuestas rápidas de
  Sugerencias, de los pasos de seguimiento, de la bienvenida y del comentario
  de una foto, y en el selector del seguimiento programado. Tocar la
  respuesta pone la 1; tocar un número pone esa versión.
- **Opciones 2 y 3 del director**: `contexto.py` lista las respuestas más
  usadas sin prueba, primero las que menos hacen avanzar el chat
  (`candidatas_a_opciones`); ahí propone `variantes`.
- **Ediciones**: cuando una vendedora cambia el texto antes de mandarlo, se
  guarda lo que mandó (`variante_usos.texto_enviado`). El director las lee
  en `contexto.py` y son la fuente de las próximas versiones.

## Objeción, otra opción y preguntas al dueño

- Cada seguimiento propuesto trae `objecion` (lo que probablemente frena al
  cliente) e `idea` opcional ({ titulo, mensaje }: otra salida para ese
  cliente). En ✨ Sugerencias se ven arriba ("🧭 Lo que probablemente lo
  frena") y en una cajita "💡 Otra opción" con **Usar como mensaje** y
  **Agregar como paso**.
- `preguntas` en `salida.json`: el bot le pregunta al dueño algo que no está
  en negocio.md. Solo el admin la ve ("❓ El asesor te pregunta", con botones
  de opciones y un cuadro de respuesta). La respuesta queda en
  `asesor_memoria` (tema "respuesta del dueño") y en `contexto.py`.
- `contexto.py` → "Por qué no cierran": chats a los que se pidió el cierre
  y no cerraron (cuántos callaron), objeciones de los análisis por chat y
  cómo les fue a los seguimientos según la objeción que atacaban.
- Migración 0036.

## Orden de las respuestas rápidas

Ya no hay grupos: cada quien las ordena arrastrando del ⋮⋮ en el panel ⚡
del chat (mouse o dedo) y el orden queda para todo el equipo
(`PATCH /api/crm/quick-replies { ordenar: [ids] }`). Las nuevas van al final.

## Sugerencias que no se acumulan

- Una sugerencia para un chat se cierra sola (estado `obsoleta`, con el
  motivo) apenas se le escribe al cliente por cualquier lado, si ya compró o
  si se cerró su ventana de 24 h (`src/lib/crm-sugerencias.js`, corre antes
  de listar, de contar y en `contexto.py`).
- Al darle Enviar desaparece al toque (si falla, vuelve con el aviso). Si
  otra persona ya la resolvió, se quita.
- Cada tarjeta muestra el cronómetro de la ventana y los seguimientos que ese
  chat ya tiene programados; aprobarla cancela los automáticos pendientes.
- El cronómetro también está en la cabecera de cada chat.

## Sin envíos en bloque

- Una respuesta rápida que el bot propone "para varios chats" ya no se manda
  a todos de una: en ✨ Sugerencias cada chat tiene **Leer chat**; se abren
  sus últimos mensajes, se ajusta el texto para ese cliente y recién ahí
  **Mandárselo**. "Guardar respuesta rápida" solo la guarda.
- Las sugerencias ya no se programan para más tarde: se leen y se envían.
- Mensaje masivo (admin) y "Seleccionar" varios chats para aplicarles una
  secuencia: apagados.

## Seguimientos sin choques

- **Una sola cadena por chat.** Programar un seguimiento a mano (o aplicar
  una secuencia) cancela los automáticos pendientes (bienvenida, respuesta
  rápida, sugerencias) y la misma secuencia si ya estaba. Una respuesta
  rápida con seguimiento no agrega su cadena si ya hay uno programado a mano.
- **Escribirle cancela** también el seguimiento de respuesta rápida pendiente
  (antes seguía y se juntaba con lo que escribía la vendedora).
- En el cron, a lo programado por el sistema: no se le manda a quien ya
  compró (etapa 5), no se repite un texto que ya le llegó en 2 días, sale uno
  por chat por pasada y, si alguien le escribió hace menos de 30 min, espera.
- Tope: **2 automáticos seguidos sin respuesta** (antes 4).
- El mismo texto no se puede programar dos veces para el mismo chat.

## Envíos a varios chats: Lima o provincia

Una sugerencia de respuesta rápida con destinatarios (o un seguimiento) que
habla de adelanto/Shalom/Olva/agencia solo va a chats de provincia; una de
ubicación/motorizado/"al recibir", solo a Lima (`src/lib/crm-destino.js`: el
destino del chat es su última señal en 14 días). Se filtra al crearla y otra
vez al aprobarla (los saltados dicen por qué). Una sugerencia igual a otra
pendiente no se vuelve a crear.

## Qué palabras venden (sin IA)

El cron de 5 min parte cada mensaje del equipo en frases de 2–3 palabras
(`frases_uso`, `src/lib/crm-frases.js`) con la etapa en que estaba el chat.
El resumen y `contexto.py` muestran las frases con más y menos cierre
comparadas con el promedio, solo las dichas antes de pedir el cierre. Es
correlación: sirve para elegir qué probar.

## Análisis por chat (coaching)

El asesor (y la Routine semanal) puede mandar `analisis` en `salida.json`:
por chat, intención, resultado (ganado/perdido/abierto), motivo, objeción,
calidad 1–5, vendedora, upsell y una nota de coaching. Se guarda en
`chat_analisis` (uno por chat y día) y sale en el resumen semanal por
vendedora. No avisa a nadie.

## Routine semanal (lunes) — prompt sugerido

> Trabaja en el repo claudetarot. Usa las skills customer-research,
> objection-pattern-learning, conversation-quality-scoring,
> win-loss-reason-extraction, sales-process-optimization y
> follow-up-discipline (.claude/skills). Tú nunca mandas mensajes a clientes.
> 1. `ASESOR_CLAVE=… python3 scripts/asesor/contexto.py --salida /tmp/sem/negocio.md`
>    y `python3 scripts/asesor/embudo.py api --dias 7 --salida /tmp/sem`.
> 2. Lee negocio.md, embudo.json, perdidos.txt y sin_respuesta.txt.
> 3. Escribe /tmp/sem/salida.json con `origen: "semanal"`, `analisis` (un
>    registro por chat que llegó a etapa 3+ esta semana, con nota de coaching
>    concreta para la vendedora), hasta 3 `variantes` de respuestas rápidas o
>    de la bienvenida con su hipótesis, y respuestas rápidas nuevas solo para
>    objeciones que no tengan una. Envía con `scripts/asesor/enviar.py
>    /tmp/sem/salida.json --solo-mensajes`.
> 4. Revisa las ediciones de las vendedoras, las frases que venden y las
>    fotos/videos de cada mensaje (contexto.py): propone versiones con esas
>    palabras (escritas como ellas, cortas, sin "—" ni frases de manual) y
>    di qué foto o video conviene poner o quitar en la bienvenida y en cada
>    respuesta, describiéndola.
> 5. Escribe un informe de 250 palabras (voz del cliente: palabras que usan,
>    por qué compran, por qué no; coaching por vendedora) y mándalo con
>    `enviar.py --informe`. Anota 1–3 lecciones con `memoria.py`.

Al director CRO diario (7:52) conviene sumarle el paso 4 en su prompt.

## Resumen por correo sin gastar tokens

**Dónde se ve**: los lunes desde las 9:00 el Worker lo guarda como página en
**CRM → Reportes** (sin avisar). Cuando una prueba ya tiene ganadora, entra a
✨ Sugerencias (solo admin) como "🧪 Prueba lista" para decidir con un toque.
Además, opcional, por correo:

Lo arma el Worker con datos de D1 (`GET /api/asesor/resumen?dias=7`): embudo
vs. la semana anterior, pruebas en curso (y cuáles ya se pueden decidir),
respuestas rápidas más usadas, equipo con coaching, objeciones, sugerencias y
el último informe del director CRO (ya escrito; `enviar.py --informe` lo
guarda entero). El Apps Script de la hoja de chats lo manda por Gmail los
lunes 9:00: en `ASESOR.gs`, Propiedades del script `REPORTE_EMAIL` y
`ASESOR_CLAVE`, y volver a correr **Asesor → Activar automatismos** (o
**Mandar resumen semanal por correo (ahora)** para probar).

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

Hecho (29/09, segunda vuelta):
- Etapa del embudo por chat en el Worker (`conversations.etapa`, cron `*/5`,
  mismas reglas que `embudo.py`). Base para medir las pruebas.
- Pruebas de mensajes, análisis por chat y resumen semanal por correo (arriba).
- Correcciones: el webhook ya no duplica mensajes cuando Meta reintenta; lo
  programado desde una sugerencia se cancela si una vendedora escribe a mano;
  tope de 4 seguimientos automáticos seguidos sin respuesta (sumando todas
  las fuentes); "compraron" solo cuenta compras posteriores a la sugerencia;
  `contexto.py` ya no se cae con respuestas rápidas sin texto.

Siguiente, en orden de impacto:
1. **Marcar "Venta posible" desde la etapa 5**, para que no se pierdan
   ventas sin etiquetar (hoy la etapa existe pero no toca las etiquetas ni
   la CAPI).
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
