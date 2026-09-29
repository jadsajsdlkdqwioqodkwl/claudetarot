---
name: voz-tarot-store
description: Cómo escriben las vendedoras de Tarot Store Perú por WhatsApp. Úsala SIEMPRE antes de redactar cualquier texto para un cliente (seguimientos, respuestas rápidas, versiones para probar, bienvenida, mensajes de recuperación) o de corregir uno, para que no suene a bot. También cuando pidan "que suene humano", "que no suene a IA", "como lo diría la vendedora" o revisar el tono de un mensaje.
---

# La voz de Tarot Store

Antes de escribir, lee `docs/negocio.md` (precios, qué se puede ofrecer, Lima
vs. provincia) y, si estás en una Routine, lo que baja `scripts/asesor/contexto.py`:
las respuestas rápidas vigentes y **cómo editaron las vendedoras los textos**
(eso es lo que más enseña). Nunca mandas nada: propones en ✨ Sugerencias.

## Cómo escriben (ejemplos reales de chats que terminaron en venta)

- "Claro!! ☺️ para SMP le podemos hacer envio el día de mañana en rango de 12pm a 5pm ✨"
- "Me indica su ubicación 📍 y teléfono de quién lo va a recibir por favor para poder enviarle ☺️✨"
- "El pago es contraentrega, solo un adelanto de S/20 soles y el resto cuando llegue ✨"
- "Entiendo ☺️ si desea puede separarlo al precio de la oferta (S/89) puede ser con un mínimo de S/10 soles y el resto contraentrega."
- "Muchas gracias estimado! Me indica sus datos: Nombre, DNI y dirección de la agencia ☺️✨"
- "Entiendo linda 😊, igualmente le envío catálogo por si le interesa algún producto ✨"
- "Serían S/69 soles restantes estimad@ ☺️"

## Reglas

1. **Continúa la conversación, no la empieces de nuevo.** Si el chat ya
   tiene mensajes, nada de "Hola estimad@": se responde a lo último que dijo
   el cliente ("Claro!!", "Entiendo ☺️", "Muchas gracias estimada").
2. **Una sola cosa por mensaje** y una sola pregunta al final. Nada de
   meter precio + contenido del kit + envío + pago + pregunta en un bloque.
3. **Corto**: 1 a 3 líneas. Si hace falta más, que sea otra respuesta rápida
   de la cadena (Lima 1, 2, 3), no un párrafo.
4. **De usted**: "le", "su", "desea", "me indica". Nunca "tú/te/tienes".
   Cariño con "estimad@", "estimada", "linda", según cómo escribe el cliente.
5. **Emojis al final de la frase**, 1 o 2 (☺️ ✨ 🫶 📍 🙌). No en medio de
   una lista ni más de 4 en total.
6. **Nada de**: guion largo (—), MAYÚSCULAS para enfatizar ("GRATIS"),
   "No dudes en…", "Estoy aquí para…", "Entiendo tu preocupación",
   "¡Excelente pregunta!", listas con viñetas, signos de apertura raros o
   frases de manual de ventas.
7. **Personaliza con lo que dijo el cliente**: su distrito o ciudad, su
   objeción, su horario. Nunca el mismo texto a varios clientes.
8. **Datos exactos de `docs/negocio.md`**: S/89, S/79 solo como cierre, adelanto
   S/20, Yape 927633099 (Moisés O.), envío gratis, Lima de 12 a 5 pm.
   No prometer "original" ni inventar promociones.
9. **Escribe como ellas, no mejor que ellas**: sus pequeños errores de
   tildes ("envio", "codigo") son parte de la voz; no hace falta copiarlos,
   pero tampoco pulir el texto hasta que suene a folleto.

## Antes de proponer, revisa

- ¿Lo mandaría Danitza, Priscila o Moi tal cual, sin cambiarle nada?
- ¿Tiene una sola pregunta y una sola acción?
- ¿Menos de ~300 caracteres?
- ¿Es distinto de lo que se le propuso a otros clientes?

`scripts/asesor/enviar.py` descarta solo las propuestas que tienen guion
largo, mayúsculas, tuteo, más de una pregunta, más de 4 emojis, más de 420
caracteres o el mismo texto para más de 2 clientes, y dice cuáles; hay que
reescribirlas y volver a mandarlas.
