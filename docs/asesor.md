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

**Nada llama a la API de Claude** (se cobra por uso aparte del plan). Lo que
queda de IA corre en las Routines con el plan. El Apps Script ya no la usa
(se quitaron el análisis diario y el botón "Sacar pedidos (Claude)"): si en
sus Propiedades del script quedó `ANTHROPIC_API_KEY`, bórrala.

Endpoints del bot (cabecera `x-asesor-clave`): `/api/asesor/chats`, `/contexto`,
`/sugerencias`, `/avisos`, `/ventas`, `/memoria`, `/analisis`, `/resumen`.
Scripts en `scripts/asesor/`. Skills en `.claude/skills/` (ver su README).

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
- **En un solo mensaje**: en una respuesta de una cadena (grupo "Lima", n.º 1,
  2, 3…) el botón "+ En un solo mensaje" arma una versión de la n.º 1 que junta
  la cadena. En el primer paso de la bienvenida arma una versión que
  reemplaza toda la secuencia, con una foto o video opcional (se elige entre
  los de la bienvenida). Así se mide si 1 mensaje cierra más que 8.
- **Ediciones**: cuando una vendedora cambia el texto antes de mandarlo, se
  guarda lo que mandó (`variante_usos.texto_enviado`). El director las lee
  en `contexto.py` y son la fuente de las próximas versiones.

## Grupos de respuestas rápidas

Cada respuesta rápida tiene `grupo` (su cadena o tipo: Lima, Provincia,
Objeciones, Confirmación…) y su número dentro del grupo. El panel del chat
las muestra agrupadas en ese orden; al buscar, sale el grupo al lado.

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

**Llega solo por Telegram** (sin configurar nada): los lunes desde las 9:00
el Worker arma el resumen, lo guarda como página en CRM → Reportes y le manda
al dueño un mensaje con lo principal y el botón "Ver resumen completo". Y
cada día, si una prueba ya tiene ganadora, avisa una vez por Telegram.
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
