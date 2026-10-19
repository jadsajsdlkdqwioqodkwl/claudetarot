# Tarot Store Perú — reglas para Claude (Routines y sesiones)

> Antes de mover, renombrar, borrar o recrear un archivo, documento, hoja o
> Routine, lee `docs/MAPA.md` (qué se conecta con qué y qué no se toca).
> Todo cambio al workflow actualiza `docs/MAPA.md` en el mismo commit.
> Toda Routine nueva, borrada o cambiada (hora, prompt, conectores) se anota en
> `docs/MAPA.md` y en `docs/routines.md` (sus prompts), para poder recrearlas.
> **Cada respuesta que cambie código o CRM termina con el link de vista previa del Worker** (formato y advertencias en `docs/MAPA.md`, «Regla: cada respuesta de código lleva el link de vista previa»).
> **En el MAPA no se remueve nada** (regla del dueño): solo se AGREGA o se corrige.
> Nunca se borra ni se acorta lo ya escrito; si algo se quitó del sistema, se anota
> que se quitó (y cuándo), conservando su historia.

## Reglas de interfaz del CRM (del dueño, no se negocian)

- **Sin emojis en la interfaz, siempre iconos.** Todo lo que se ve en el CRM (botones, badges, títulos, avisos, selects, cronómetros) usa los iconos SVG de `public/crm/icons.js` (`icon("nombre")`); si falta uno, se agrega ahí. Los emojis solo valen dentro del texto que se le escribe a un cliente y en el selector de emojis del chat. `npm run check` falla si aparece uno en la interfaz.
- **No borrar ni esconder funciones por cuenta propia.** Si algo se ve de más, se pregunta. Lo que se mueve de lugar (por ejemplo el cronómetro de la ventana de 24 h, que va al lado del nombre y el teléfono del cliente, no en una franja) se deja donde el dueño lo tenía. Si el dueño dice que algo está deprecado, se quita solo eso y se avisa qué más depende de ello.
- **Nada de opciones fijas que el dueño debería poder elegir** (por ejemplo, cuántos botones lleva una plantilla): se ofrece la elección.

## Si vas a proponer textos para clientes (asesor, director CRO, semanal)

1. Lee `docs/negocio.md` (reglas fijas del negocio) y corre
   `scripts/asesor/contexto.py`: respuestas rápidas vigentes (en su orden),
   bienvenida, pruebas en curso, **cómo editaron las vendedoras los textos**,
   frases que acompañan las ventas, memoria y qué pasó con lo que propusiste.
2. Usa la skill **voz-tarot-store** para todo texto que vea un cliente. Las
   demás skills de `.claude/skills/` (ver su README) son criterio de análisis:
   objeciones, cierre, seguimiento, pruebas A/B, CRO, psicología, oferta.
   Seguimientos y envíos a varios chats: cada mensaje aporta algo nuevo (no
   "¿sigue interesad@?") y va solo a los chats de su destino (Lima o
   provincia); ver reglas 10–12 de voz-tarot-store.
   Antes de un seguimiento, diagnostica qué lo frena (desconfianza, falta de
   información, precio, tiempo) y ponlo en `objecion`; al que calló tras el
   pedido de cierre, primero dale espacio para contar su duda, no lo
   empujes. Otras salidas para ese cliente van en `idea`; si no están en
   negocio.md, pregúntale al dueño en `preguntas` (reglas 13–16 de
   voz-tarot-store).
   Opciones 2 y 3: para las respuestas rápidas de "Dónde proponer opciones
   2 y 3" en contexto.py, propón `variantes` (no respuestas rápidas nuevas).
3. **Nunca mandas mensajes a clientes.** Todo va a ✨ Sugerencias vía
   `scripts/asesor/enviar.py`; una persona lo aprueba. No llamas a ninguna
   API de IA.
4. `enviar.py` descarta lo que suena a bot y lo lista: reescríbelo y vuelve a
   mandarlo.
5. Saldos: si un cliente de provincia mandó la captura del pago del saldo
   (Yape), ponlo en `saldos` de `salida.json` con su código TS-… y el monto
   que ves en la imagen. Nunca lo marques pagado tú: una persona lo confirma.
6. Pedido de provincia CONFIRMADO: mandó la captura del adelanto **o** la
   vendedora ya le confirmó el pedido ("gracias por la confianza", "le
   enviamos el comprobante"…: el Yape llegó aunque no haya captura en el chat),
   y dio nombre, DNI y agencia. No lo dejes en POR_CONFIRMAR por falta de captura.
7. EMPAQUE (importantísimo): el que empaca asume que TODO pedido es 1 kit
   normal y solo se guía del PDF. Todo lo que no sea eso va en `empaque` de
   cada pedido (y con "📦 " al inicio de la `nota`): 2 o más kits, mazo u
   oráculo extra, otro modelo, collar o regalo extra prometido, lo que NO
   lleva (ej. solo una carta de reposición, con `kits: 0`). Revisa el chat
   completo: lo que no esté en `empaque` no se empaca. La `nota` sigue con
   lo de entrega y cobro (saldo, horario, avisar antes, piso).
   Lee también los mensajes `V(auto: …)`: el toque del día 7 ("le regalamos
   un collar amuleto extra"), el de referidos y los seguimientos programados
   prometen extras. Todo chat con "📦 PROMETIDO" arriba (preparar.py, 21 días
   atrás) que compra lleva eso en `empaque`. Si se te pasa, `enviar.py` lo
   agrega con "⚠️ VERIFICAR" y lo lista: corrige el `empaque` y vuelve a mandar.
8. Reclamo que obliga a mandar algo (carta o mazo que faltó, cambio, llevarle
   algo con motorizado): va SIEMPRE como pedido con `tipo` REPOSICION o CAMBIO,
   dirección, `empaque` (qué llevar) y nota que empiece con "🚨 ", además de
   en `incidencias`. Toda nota que pida atención empieza con "🚨 ".
9. Telegram: no mandes avisos sueltos. `enviar.py` manda uno solo ("hay
   recomendaciones nuevas") y el PDF de pedidos al dueño. El informe del
   director queda en CRM → Reportes.

10. **Rescate de lead 1 (la única excepción a la regla 3, autorizada por el
   dueño):** a los contactos que no compraron se les agenda solo, por el
   Worker, el rescate 1 (`rescate_lead_1`) al final de su ventana gratis de 7
   días (`src/lib/rescate-lead.js`); eso no lo decides tú. TÚ revisas los chats
   PASADOS (ya fuera de esa ventana, escribieron hace más de 24 h y no
   compraron) y decides a quién mandarle ese mismo rescate 1: ponlo en
   `rescates` de `salida.json` ([{whatsapp, motivo}]) y SALE SOLO, sin
   aprobación. Solo a quien tenga posibilidades reales de comprar: preguntó
   precio, dio distrito o ciudad, pidió datos de envío, dijo "luego/más tarde/te
   aviso", o quedó una duda sin resolver. NO a quien quería otra cosa, no era
   cliente, pidió que no lo escriban, ya compró, o se perdió por una razón que el
   rescate no arregla. Tope: 15 por envío y 30 por día; el Worker rechaza lo que
   no cumple (ya compró, bloqueado, killswitch del chat, ya recibió el rescate 1).

17. **Registro de pedidos (2026-10-18):** `enviar.py` guarda cada reporte de pedidos por fecha de
   despacho y SUMA las corridas (ninguna borra un pedido; para sacar uno usa `quitar`
   [{whatsapp, motivo}]). Todo pedido que sale otro día va `OTRO_DIA` con `fecha_entrega`
   AAAA-MM-DD: queda agendado en esa fecha. Un Lima confirmado con entrega en otro día no sale
   (también en el reporte de ventas). Ver: `python3 scripts/asesor/pedidos_estado.py ver AAAA-MM-DD`.
   **Ahorro de tokens, sin perder exactitud:** antes de leer chats corre `pedidos_estado.py ver
   AAAA-MM-DD` (lo ya registrado de esa fecha, agendados incluidos). El `salida.json` lleva SOLO lo
   nuevo o lo que cambió; `enviar.py` suma lo registrado y el PDF sale siempre completo. Lo agendado
   se repite solo en el reporte de su fecha; no lo vuelvas a deducir de los chats.

Más detalle: `docs/asesor.md`.

**Qué es una venta (regla del dueño, 2026-10-14):** Lima = el cliente pasó su dirección; provincia = el cliente mandó el adelanto. Una confirmación verbal de la vendedora sin eso es otra cosa o error de asesor, no cuenta como venta en ningún reporte.

**Reporte de ventas (22:00 y 23:30; desde el 2026-10-15 son solo dos corridas; el de las 21:00 se apagó el 2026-10-15 y las de 23:00 y 00:00 se quitaron ese día):** sale SIEMPRE como PDF con tablas (el formato de siempre, el mismo de pedidos) con `enviar.py salida.json` y `"tipo_reporte": "ventas"`; nunca como texto plano por `--informe`. Prueba: `python3 scripts/asesor/pruebas/test_pdf_ventas.py`.
Antes de armarlo, lee «Cómo hacer un buen reporte de ventas» al final de `docs/negocio.md` (leer todos los chats, cuadrar con el CRM, día y vendedora de la venta).
Cada corrida lee solo lo nuevo (`ventas_estado.py`) y mira las capturas (`imagenes.py`); `enviar.py` suma al estado del día. El PDF de ventas solo sale si cuadra con el sistema: `python3 scripts/asesor/control_ventas.py AAAA-MM-DD` y `enviar.py` lo exige (ver puntos 11–13 de esa sección). Prueba: `python3 scripts/asesor/pruebas/test_control_ventas.py`.

## Si vas a hacer anuncios / creativos

Usa la skill **creativos** (`.claude/skills/creativos/SKILL.md`): lote en
`creativos/lotes/`, render con `scripts/creativos/render.mjs` (Nano Banana,
`GEMINI_API_KEY`), feedback en la hoja y `creativos/reglas_aprendidas.md`.

## Prohibido en todo el repo: la API de Claude (regla del dueño, 2026-10-15)

NINGÚN script, Worker, Apps Script, documento ni Routine usa la API de Claude/Anthropic (ni su
clave, ni su SDK). Todo lo que necesita IA corre en una Routine o sesión de Claude Code con los
tokens del plan, y los scripts solo preparan datos (decidir qué es nuevo SIN gastar lectura).
`npm run check` falla si aparece una llamada a esa API. **Nunca hables de costos en dinero** (ni
dólares ni soles): el único gasto que importa es el uso de los tokens del plan del dueño. Lista de
llamadas de URO: `docs/uro/llamadas.md`.

## Si vas a tocar el código

- ⚠️ **NO TOCAR (regla del dueño, importantísima):** todo TEXTO que sale a
  un cliente lleva antes "escribiendo…" durante **1,5 s** (`pausaEnvio()` en
  `src/lib/crm-send.js`, `PAUSA_ENVIO_MS = 1500`). No se quita, no se acorta
  y todo envío nuevo lo llama antes de `mandarTexto()` / `mandarMediaGuardada()`.
  `npm run check` falla si falta en algún envío. Está garantizado dentro de
  `mandarTexto()`, `mandarMediaGuardada()` y `mandarConEscribiendo()`
  (plantilla): si nadie hizo la pausa, la hacen ellas. Fotos, videos,
  audios, documentos, catálogo y producto salen al toque, sin "escribiendo…"
  (`mandarMediaGuardada()`, `mandarAlToque()`).
  Nunca llames directo a `enviarTexto/enviarMedia/enviarTemplate/enviarCatalogo*/enviarProducto`.
  **Única excepción (dueño, 2026-10-14): «escribiendo…» EN VIVO.** Con el ajuste
  `escribiendo_vivo` (CRM → Equipo, prendido por defecto) el cliente ve
  «escribiendo…» mientras la vendedora teclea (`POST /api/crm/escribiendo`), y
  ese texto TECLEADO A MANO sale sin repetir la pausa, con 1 s entre mensajes
  (`pausaEnvio(..., { vivo: true })`, solo desde `messages.js`). Respuestas
  rápidas, texto pegado, bienvenida, seguimientos y plantillas siguen con su pausa.

- `npm run check` y `npm run check:gs` antes de subir (el chequeo "la foto de
  la variante es una banda horizontal" ya fallaba antes).
- Las migraciones de D1 se aplican a mano (no las aplica el deploy).
- Varios productos y números de WhatsApp: `docs/productos-y-numeros.md`. Todo
  envío a un chat sale por el número de ese chat (`envDeConversacion`, ya
  dentro de `crm-send.js`); los callbacks de `mandarConEscribiendo()` /
  `mandarAlToque()` reciben ese `env` como argumento: úsalo, no el de afuera.
- Costos de WhatsApp: `docs/whatsapp-ventanas-y-costos.md`.

## Herramientas del equipo (Claude Code)

Esta sección solo añade reglas de trabajo; no cambia lo anterior.

- **Código primero con CodeGraph:** antes de `grep` o de leer archivos completos,
  usa la herramienta MCP `codegraph_explore` con los nombres de símbolos o
  archivos. Solo si no alcanza, recurre a `grep` o a leer el archivo.
- **Memoria de sesiones:** claude-mem guarda decisiones entre sesiones. Consúltala
  antes de rehacer algo que ya se discutió.
- **Menor código posible:** antes de escribir código nuevo, revisa en este orden:
  (1) si se resuelve con configuración o un comando existente, (2) si hay una función
  nativa o de la librería estándar, (3) si ya existe algo reutilizable en el repo.
  Evita dependencias nuevas salvo que sean necesarias.
- **Investigación externa:** para documentación fuera del repo, Reddit, X o GitHub,
  usa `agent-reach` (`agent-reach doctor` muestra qué canales funcionan).
- **Seguridad:** las skills de Strix (`.agents/skills/`) son solo para auditorías
  autorizadas. No las ejecutes contra el sitio en vivo sin autorización explícita.
- **Arranque:** `.claude/hooks/session-start.sh` instala CodeGraph e indexa el repo
  al iniciar una sesión. Es idempotente.
