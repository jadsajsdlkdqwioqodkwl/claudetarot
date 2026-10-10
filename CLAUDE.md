# Tarot Store Perú — reglas para Claude (Routines y sesiones)

> Antes de mover, renombrar, borrar o recrear un archivo, documento, hoja o
> Routine, lee `docs/MAPA.md` (qué se conecta con qué y qué no se toca).
> Todo cambio al workflow actualiza `docs/MAPA.md` en el mismo commit.

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

Más detalle: `docs/asesor.md`.

## Si vas a hacer anuncios / creativos

Usa la skill **creativos** (`.claude/skills/creativos/SKILL.md`): lote en
`creativos/lotes/`, render con `scripts/creativos/render.mjs` (Nano Banana,
`GEMINI_API_KEY`), feedback en la hoja y `creativos/reglas_aprendidas.md`.

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

- `npm run check` y `npm run check:gs` antes de subir (el chequeo "la foto de
  la variante es una banda horizontal" ya fallaba antes).
- Las migraciones de D1 se aplican a mano (no las aplica el deploy).
- Varios productos y números de WhatsApp: `docs/productos-y-numeros.md`. Todo
  envío a un chat sale por el número de ese chat (`envDeConversacion`, ya
  dentro de `crm-send.js`); los callbacks de `mandarConEscribiendo()` /
  `mandarAlToque()` reciben ese `env` como argumento: úsalo, no el de afuera.
- Costos de WhatsApp: `docs/whatsapp-ventanas-y-costos.md`.
