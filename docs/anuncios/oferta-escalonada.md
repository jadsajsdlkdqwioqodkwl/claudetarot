# Oferta escalonada del Kit Tarot — análisis de voz del cliente (2026-10-19)

Estrategia de oferta (método $100M Offers) construida desde los chats reales.
Hechos = contados en los chats. Patrones = repetidos pero con sesgo posible.
Interpretaciones e hipótesis van marcadas. Sin nombres, teléfonos ni direcciones.
Las citas son literales (con sus errores de escritura); cada una sale de un chat distinto.

## 1. Alcance y calidad de los datos

**Qué se analizó**
- Libro «TAROT CHATS - VENTAS CRM»: 27 pestañas diarias (22-09 a 18-10-2026), columnas Fecha, WhatsApp, Contacto, Quién (Cliente/Vendedor), Vendedor, Tipo, Mensaje, Origen/Título del anuncio, Notas, Asesora. Más una Sheet1 de plantilla.
- El contenido se leyó por el mismo origen que alimenta esas pestañas (API de chats del Worker, `preparar.py api --dias 30`): **907 chats**, agrupados por cliente (un cliente = un chat, no una fila). Etiqueta de compra = la marcada en el CRM (`purchase`): **124 chats compradores (13,7 %)**, 783 no.
- Lectura: se leyeron completos los **771 mensajes sustanciales de clientes** (≥ 28 caracteres, sin el saludo del anuncio ni datos de entrega) y se contó el resto (mensajes cortos, botones LIMA/PROVINCIA, frecuencias por tema con expresiones regulares). Lo que dijeron las vendedoras se usó para contexto (ofertas hechas, precios dichos), no se leyó línea por línea.

**Lo que NO se pudo o no se hizo**
- Audios (26 mensajes `[audio]`) e imágenes (capturas de pago, fotos de cartas): el texto no los trae; no se transcribieron.
- Las pestañas del libro «Ventas Tarot» están vacías (plantilla de empaque); «Pedidos Tarot Kit» no se usó para el ticket.
- **No hay costos** (kit, impresión, packaging, courier, costo por chat/compra). Toda la economía de la sección 8 son escenarios ilustrativos.
- Las compras marcadas en el CRM pueden quedarse cortas (ya se dijo en el brief). Los conteos por tema son por palabras clave: sobre-cuentan frases genéricas y sub-cuentan jerga. Leer el número como orden de magnitud.
- 30 días, un solo producto principal (el kit de S/89): no se puede medir recompra ni upsell real, casi no hay datos de eso.

## 2. Resumen ejecutivo

1. **El embudo pierde más antes de la conversación que en las objeciones.** 231 chats (25 %) escriben un solo mensaje y 279 (31 %) dos (casi siempre el saludo del anuncio + el botón LIMA/PROVINCIA). Mediana de mensajes del cliente: 11,5 en compradores vs 2 en no compradores.
2. **Provincia manda y convierte menos.** Entre los chats que dijeron claramente su destino: Lima 140 (47 compraron, ~34 %), provincia 265 (53, ~20 %). El adelanto de S/20 a un desconocido es la fricción de confianza más visible («Cómo te voy a pagar yo por adelantado mi no confío»).
3. **El precio se pregunta mucho (187 chats) pero casi nunca se rechaza.** Quien dice «caro» es raro. Lo que sí aparece: falta de efectivo en ese momento («fin de mes», «me pagan el jueves», 15 chats, 1 compró). Se resuelve con tiempo/separación, no con descuento. Los chats donde se ofreció S/79 (49) compraron 5 (~10 %), por debajo de la media, aunque hay sesgo (se ofrece a los que dudan).
4. **Lo que el cliente quiere es poder aprender sin saber nada y no equivocarse.** Piden guía: manual físico, libro, curso, video, «cómo aprendo», incluso compradores ya con el kit en mano pidiendo cómo descifrar. Esa es la palanca de valor con más respaldo.
5. **Hay fricción post-compra que daña la promesa de la oferta:** ~10 chats (9 compradores) protestan porque «el envío es gratis» y la agencia les cobra flete (S/8) o porque tarda. Cualquier oferta nueva debe redactar el envío con exactitud.
6. **El interés en accesorios extra es débil.** Collar (13 chats) se valora como regalo del kit, no como producto aparte; tapete casi no se menciona (6); oráculos 7; clases/curso 13. «Leer a otros / profesional» = 0 señales en esta ventana; brujería/amarres 4 (otro público, no el objetivo).
7. **Recomendación:** probar primero una oferta principal «Kit Guiado» (kit + clases grabadas cortas + guía de tiradas de consulta rápida + bolsa), mantener el kit de S/89 como entrada/control, y dejar el premium como hipótesis hasta cotizar y validar con una muestra pequeña.

## 3. Tabla VoC: deseos, dolores, objeciones y motivaciones

Chats = cuántos de los 907 mencionan el tema (compradores entre paréntesis). Fuente: pestañas diarias 22-09 a 18-10.

| Tipo | Hallazgo | Chats | Nivel |
|---|---|---|---|
| Deseo | Aprender desde cero a leerse solo | decenas (no cuantificable bien por palabras) | Patrón |
| Deseo | Manual/libro físico con significados en español | 23 (10) | Patrón |
| Deseo | Curso, clases o videos | 13 (2) | Patrón minoritario |
| Dolor | No saber usar el kit al recibirlo | 6 (3) + 1 comprador ya con el kit | Patrón débil |
| Dolor | «Envío gratis» que termina con cobro en agencia | 10 (9) | Hecho (compradores) |
| Dolor | Demora / «no llega» / clave de retiro | 15 (12) | Hecho |
| Objeción | Precio: preguntan cuánto cuesta | 187 (29) | Pregunta, no objeción |
| Objeción | No tengo plata ahora / a fin de mes | 15 (1) | Patrón, ~2 % |
| Objeción | Desconfianza (adelanto, estafa, «es copia») | 14 (5) | Patrón en provincia |
| Objeción | Calidad, material, tamaño de la carta | 15 (4) | Patrón |
| Objeción | Tienda física / ir a ver en persona | 10 (2) | Patrón |
| Objeción | ¿Está en español / con letras? | 16 (6) | Patrón |
| Interés | Otras barajas (española de 40 cartas, oráculos, otro tarot) | 14 (4) | Patrón minoritario |
| Interés | Collar/amuleto como pieza deseada | 13 (4) | Patrón |
| Interés | Comprar para regalar / varios / por mayor | 12 (4) | Patrón minoritario |
| Motivación (compra) | Compradores preguntan logística concreta (agencia, saldo, día de entrega, hora) | mediana 11,5 msgs | Hecho |
| Motivación | Referencias e Instagram mostrados | 337 chats los recibieron, 67 compraron | Los 67 no prueban causa |

## 4. Citas literales representativas

Deseos y aprendizaje
- «Yo nunca he tenido unas cartas.» / «Y no tengo idea pero si me gustaría aprender.»
- «Quiero aprender leer la carta por primera vez»
- «lo quiero tarot para principiante con sus letras para poder así aprender»
- «Y como aprendo hacer útil el tarot» / «Y algún vídeo para poder ver»
- «Lo que me interesa es recibir información sobre el curso de tarot» → «Oooh que penita. Lo que necesito es el curso. Cartas tengo.»
- «Pensé que era clases virtuales»
- «Quiero con todo su manual fesico»
- «Y voy aprender y después iré viendo otras cartas para comprar»
- Comprador con el kit en la mano: «Ya lo recoji. Endicame..como debo desifrar.o.envia.on.modelo.o.video»

Miedos y dudas
- «Será me da miedo no aprender derrepente con una guía es diferente»
- «Solo q no atraere espíritus negativos»
- «Para principiante debo saber el udo de cada cosa para hscerlo.»
- «Qué quiere decir respuestas sí y no impresos»
- «Saquene de una duda las cosas claras, Que es lo que realmente llevs» (confusión con las fotos de packs del anuncio)

Confianza y pago
- «Cómo te voy a pagar yo por adelantado mi no confío»
- «Desde tu información empieza la desconfianza tienes que ser más claro te estoy preguntando el precio y no puedes decir, eso y pides adelanto»
- «Lo importante es qe no sea estafa»
- «quien me garantiza que realmente me enviarán , disculpe la desconfianza pero con todo lo que sucede ahora»
- «Todos dicen que es gratis y después cobran el envio»
- «Acabo de recibirlo pero dijeron que el envío era gratis y tuve q pagar»
- «El manual que muestran es más grande» (expectativa vs producto)

Dinero y tiempo
- «Hola qué tal porfavor lo haré recién la otra semana aún no me pagan»
- «Sí es que recién el viernes me van a pagar»
- «Aya será para otra oportunidad no puedo yapear ni plin estoy lejos trabajando»
- «Saliendo del trabajo lo hago»

Después de recibir / satisfacción
- «Llegó super rápido. Muchísimas gracias. … el kit está hermoso y perfecto para empezar.»
- «Hola,me encanta las cartas del tarot, gracias por los regalos»
- «Acaba de llegar mi pedido y mi hija, se lo quedó, quisiera saber si para el 31 de este mes … me podrían traer otro igual»
- «si hacen cursos virtuales igual me avisa» (compradora)
- «shalom … yo voy a recoger y luego le voy a recomendar con muchos mas»

Otros públicos (minoritarios)
- «Tiene el de 40 cartas españolas? Tiene las arras y su significado?»
- «Mejor sería con el tarot de Marcella es lo mejor»
- «Y venden las cartas sin significado y aparte el significado»
- «Solo quiero el mazo con el significado, no me interesa lo demás y todavía tengo que buscar clases, porque la posición en la que sale es imortantisimo»

## 5. Segmentos (con respaldo)

| Segmento | Respaldo | Deseo | Problema / objeción | Sensibilidad al precio | Producto adecuado |
|---|---|---|---|---|---|
| A. Principiante absoluto, Lima | mayoría de los 47 compradores Lima | empezar ya, pago al recibir | horario de entrega, hora, vuelto | baja | Kit actual; guía como diferenciador |
| B. Principiante, provincia | 265 chats, ~20 % compra | aprender y recibir por agencia | adelanto a desconocido, flete, demora, clave de retiro | media (deposita S/20 pero el saldo pesa) | Kit con confianza reforzada (fotos de envío, seguimiento); no subirle el adelanto |
| C. Quiere clase/curso | 13 chats, 2 compradores | método, ver a alguien enseñar | «pensé que era clases» | desconocida | Clases grabadas como bono o venta posterior |
| D. Sin dinero este momento | 15 chats, 1 compró | comprar luego | fecha de pago | alta, temporal | Separar con S/10 / recontacto el día de pago, no descuento |
| E. Regalo / varios | 12 chats | dar el kit a hija, amiga | formato de regalo | media | 2 kits S/149; opcional empaque regalo |
| F. Otra baraja / otro uso (española, oráculo, brujería) | 14 + 4 chats | otra cosa | no es lo que vendemos | n/d | No es objetivo; guardar como lista de espera |
| G. Mundo de la lectura a terceros / profesional | 0 señales | — | — | — | **No hay base para diseñar una oferta aquí.** |

Hipótesis (sin respaldo suficiente): lectores que ya tienen mazo y no saben interpretarlo (apenas 3 mensajes), compradores de accesorios por estética (2 en el brief).

## 6. Oportunidades priorizadas

Criterio: respaldo en datos, potencial comercial, facilidad, coste, riesgo.

| # | Oportunidad | Respaldo | Potencial | Facilidad | Riesgo |
|---|---|---|---|---|---|
| 1 | Clases grabadas cortas «tu primera lectura» (bono digital, entrega inmediata por WhatsApp, cubre la espera de agencia) | 13 chats pidiendo curso/video + compradores sin saber descifrar | alto | media (producir 1 vez; coste de tiempo) | requiere que alguien sepa enseñar; no prometer resultados |
| 2 | Guía de tiradas/consulta rápida imprimible | «cuántas cartas se ponen en la mesa», «ritual para tirar la carta» | medio-alto | alta (PDF) | bajo |
| 3 | Aclarar el envío en la promesa (gratis a la agencia; flete S/X al recoger, o absorberlo) | ~10 chats de reclamo | alto en reputación y recompra | alta | requiere decisión del dueño |
| 4 | Confianza en provincia (video de despacho, boleta, seguimiento TS) | 14 chats de desconfianza | alto | ya existe parte | bajo |
| 5 | Bolsa de organza/terciopelo | 1 comprador pidió ver la bolsa; otro cita «la bolsa para guardar» | bajo-medio | alta | bajo |
| 6 | Libro/manual ampliado impreso | 23 chats piden libro/manual | medio | media (impresión por volumen) | coste; no confundir con el manual ya incluido |
| 7 | Venta posterior del curso a quien ya compró | 1–2 compradoras lo pidieron | medio | media | hay que esperar a que exista el curso |
| 8 | Collar de nudos de bruja | 0 señales de demanda de eso; brujería aparece en 4 chats de otro público | bajo | — | choca con el posicionamiento del brief («evitar lenguaje espiritual/místico») |

## 7. Tres ofertas escalonadas

Todos los precios son hipótesis a probar; el entry es el kit real vigente (`docs/negocio.md`). No se tocan descuentos ni el adelanto de S/20 sin decisión del dueño.

### Oferta 1 · Entrada — «Kit Tarot de Aprendizaje» (lo actual)
1. Nombre: Kit Tarot de Aprendizaje.
2. Cliente ideal: principiante absoluto que ya decidió, sobre todo Lima.
3. Deseo: empezar hoy, sin complicarse.
4. Problema: no sabe por dónde empezar; no quiere memorizar.
5. Físico: 78 cartas con significados, manual en español, tapete, collar amuleto de regalo.
6. Bonos: ninguno nuevo.
7. Justificación: es el producto que ya convierte (13,7 % de los chats, 34 % en Lima).
8. Objeciones que resuelve: «¿viene en español?», «¿qué trae?», «sin memorizar».
9. Promesa: lees desde el primer día.
10. Precio: **S/89** (S/149 por 2).
11–12. Costo incremental: 0 (es la base). Margen: ver sección 8.
13. Riesgos: la promesa «envío gratis» genera reclamos en agencia; unas fotos de anuncio muestran más piezas que las que llegan (la clienta pidió aclarar «qué realmente lleva»).

### Oferta 2 · Principal — «Kit Guiado: tu primera lectura en 7 días»
1. Nombre sugerido (a probar con el equipo): Kit Guiado Tarot.
2. Cliente ideal: principiante con miedo a no aprender, que pide curso/video/libro (segmentos A, B, C).
3. Deseo: aprender de verdad, con alguien que le enseñe.
4. Problema: «me da miedo no aprender», «cómo aprendo hacer útil el tarot».
5. Físico: lo del kit + bolsa de organza + guía de tiradas de consulta rápida impresa (una hoja).
6. Digital: 5–7 clases grabadas cortas por WhatsApp (entrega el mismo día de la compra: llena los 3–7 días de espera de agencia en provincia) + PDF de tiradas.
7. Justificación por componente: clases ← 13 chats piden curso/video; guía de tiradas ← preguntas de cuántas cartas poner y cómo hacer la tirada; bolsa ← protección, 2 menciones; todo suma «probabilidad percibida de aprender» y reduce esfuerzo.
8. Objeciones: «¿podré aprender?», «¿ustedes dan clases?», espera del paquete.
9. Promesa: «Llegas a tu primera lectura guiada en 7 días» (no prometer nada más allá; no inventar resultados).
10. Precio recomendado: **S/119** (rango a probar S/109–129).
11. Coste incremental: bolsa + impresión de la guía + producción de clases (se amortiza); **sin cotizar**.
12. Margen: sección 8.
13. Riesgos: producir las clases lleva tiempo y exige un instructor creíble; el adelanto de S/20 sobre un total más alto hace el saldo más pesado en provincia (hay que probar si baja la conversión).

### Oferta 3 · Premium — «Kit Guiado Plus»
1. Nombre: Kit Guiado Plus.
2. Cliente ideal: quien más se beneficia es el principiante muy motivado, o quien lo compra para aprender junto con otra persona (hija, amiga). **Hipótesis**, sin segmento grande respaldado.
3. Deseo: aprender con más soporte y quedarse con material de práctica.
4. Problema: dudas durante la práctica («cómo debo descifrar»).
5. Físico: todo lo de la oferta 2 + libro/manual ampliado impreso (si se cotiza en volumen) + diario/reto de práctica de 21 días.
6. Digital: clases + una sesión grabada de resolución de dudas comunes; opcional acompañamiento por WhatsApp para la primera tirada (limitar el alcance, tiene coste de horas de vendedora).
7. Justificación: libro/manual ← 23 chats; práctica ← compradores sin saber cómo continuar; acompañamiento ← comprador que pidió ayuda tras recibir.
8. Objeciones: «¿y si me quedo con dudas?».
9. Promesa: aprendes con material para seguir un mes.
10. Precio: **S/159** (rango S/149–169; debe percibirse mejor que «2 kits S/149», que resuelve regalo).
11. Coste incremental: libro impreso + diario + horas de soporte: **sin cotizar**.
12. Margen: sección 8.
13. Riesgos: poca demanda real documentada de un premium; capacidad de soporte; no obliga a todos (se ofrece solo a quien pregunta por libro/curso/soporte).

No incluidos a propósito: collar de nudos de bruja (sin demanda, contradice posicionamiento), manteles múltiples (el tapete casi no se menciona), segundos collares como producto (ya se usan como cierre/regalo).

## 8. Economía unitaria (escenarios, no datos reales)

**Datos conocidos:** precios (S/89, 2 kits S/149, S/79 con descuento, S/49 Classic); comisión de asesoras 10 % por venta; adelanto de provincia S/20; conversión 13,7 % de chats a compra marcada.
**Pendiente (pedir al dueño):** costo puesto del kit (mazo+manual+tapete+collar+empaque), costo de courier asumido en Lima y provincia, costo por chat o por compra de anuncios, merma/devolución, cuánto cuesta producir y editar las clases, cotización de libro, bolsa y diario.

Fórmula: margen antes de anuncios = precio × 0,90 − costo de la oferta. Máximo CAC permitido = ese margen. Con 13,7 % de compra por chat, cada S/1 de costo por chat equivale a ~S/7,3 de CAC.

**Escenario ilustrativo (supuesto: costo del kit puesto = S/35; no es dato):**

| Oferta | Precio | Costo supuesto | Margen antes de anuncios | Conversión mínima vs entrada para igualar el beneficio por chat |
|---|---|---|---|---|
| 1 Kit actual | 89 | 35 | 45,1 | 100 % (base) |
| 2 Kit Guiado | 119 | 43 (+8 de bolsa/impresión, ilustrativo) | 64,1 | 70 % |
| 3 Plus | 159 | 61 (+26 de libro, diario, soporte, ilustrativo) | 82,1 | 55 % |

Lectura: si el costo real del kit es parecido, la oferta 2 gana mientras su conversión no caiga más de ~30 % frente al kit solo; la 3 gana mientras no caiga más de ~45 %. Un costo por chat de S/3 implica CAC de ~S/22 (ilustrativo), lejos del margen en los tres casos. Cambia todo con los costos reales y con cuánta gente elija cada oferta.

## 9. Escalera de valor

1. Antes de la compra: precio (89) → pregunta «¿qué trae?» → oferta 2 como mejora cuando pregunta por libro/curso/aprender. No empujar a quien ya pidió el kit básico.
2. Después de elegir el mazo: ofrecer una sola mejora relevante (clases) en el cierre, no una lista.
3. Quien ya compró: clases como venta posterior, Classic a S/49 (ya existe), 2.º kit para regalo (caso real: «mi hija se lo quedó… otro igual»).
4. Espera de agencia: entregar contenido digital el mismo día como valor inmediato.
5. Recompra: poca base hoy; hipótesis (referidos con collar, ya aprobado).

## 10. Recomendación y hipótesis a validar

**Probar primero la Oferta 2.** Es la que más palancas del VoC toca (aprender sin miedo, curso/video, libro/guía) con coste marginal bajo en lo digital, y no obliga a cambiar el producto base.

Hipótesis (cada una con cómo medirla):
- H1: ofrecer el Kit Guiado a S/119 a la mitad de los chats que lleguen a «¿qué trae?» (alternando por chat) no baja la conversión más de 30 %. Medir en CRM: compras por chat en cada brazo.
- H2: la mitad de quienes pregunten por libro/curso eligen la oferta 2 sobre el kit solo.
- H3: aclarar el flete reduce los reclamos post-compra (contar chats de reclamo por 100 envíos).
- H4: el contenido digital el mismo día baja los «no llega» y las consultas de seguimiento.
- H5 (premium): al menos 5 % de los compradores de la oferta 2 pide libro/soporte antes de ofrecerlo.

Tamaño de muestra: con ~900 chats al mes y ~124 compras, una prueba de 2 brazos tarda varias semanas en distinguir diferencias menores de 30 %; planear 4–6 semanas.

**Datos que pido al dueño:** costos de la sección 8 (kit, courier, anuncios, bolsa, libro, diario), quién grabaría las clases y cuánto tiempo toma, y si el envío gratis se mantiene o se aclara el flete.

## Bitácora de este análisis
- 2026-10-19 · chats del 22-09 al 18-10 (907 chats, 124 compras CRM) · primer análisis de oferta escalonada. Resultados en el brief (Google Doc y copia).
