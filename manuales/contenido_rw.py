# -*- coding: utf-8 -*-
# Manual Rider-Waite: texto extraído del PDF original, con el Caballero de
# Oros añadido (faltaba) y los arcanos menores corridos una carta para hacerle
# sitio. Corregidos: "Seis de Oros (two of pentacles)", "sowrds", encabezado
# "ESPADAS" repetido en la pág. 14 y la línea duplicada de la pág. 10.

IMG = "rwcards"


def card(nombre, img, texto):
    return f'<div class="e"><img src="{IMG}/{img}"><p><b>{nombre}:</b> {texto}</p></div>'


def h(t):
    return f'<p class="h">{t}</p>'


def p(t):
    return f'<p>{t}</p>'


MAYORES = [
    ("0 El Loco", "p06_1.png", "El paso que das sin tener todo resuelto: lo que otros no se atreven, o ir por la vida sin plan. Confía: el camino aparece al caminar. (Tip visual: el perrito advirtiendo). Inv: Saltar sin mirar, o nunca saltar."),
    ("I El Mago", "p06_2.png", "Ya tienes sobre la mesa lo que hace falta; lo que sobra son excusas. La carta del \"hazlo ahora\" y de quien convence hablando. (Tip visual: el símbolo de infinito). Inv: Hablar bonito sin hacer nada; encanto para sacar ventaja."),
    ("II La Sacerdotisa", "p07_1.png", "Hay algo que aún no se dice ni se muestra. Espera, observa y calla: la respuesta llega sola. Una mujer reservada que sabe más de lo que cuenta. (Tip visual: el pergamino oculto). Inv: Secretos que pesan; ignorar lo que ya sabes por dentro."),
    ("III La Emperatriz", "p07_2.png", "Algo está creciendo y necesita cuidado, no prisa: un proyecto, un vínculo, un cuerpo. Date gustos y descansa. (Tip visual: el trigo maduro). Inv: Dar hasta vaciarte; descuidar lo que depende de ti."),
    ("IV El Emperador", "p07_3.png", "Pon reglas, horarios y límites: el desorden se ordena con decisión. Un hombre mayor o un jefe influye en tu tema. (Tip visual: la armadura bajo la túnica). Inv: Mandar por miedo; dejar que decidan por ti."),
    ("V El Hierofante", "p08_2.png", "Lo que ya funciona para otros te sirve: un maestro, un curso, un consejo con experiencia. Trámites y promesas formales. (Tip visual: las llaves cruzadas). Inv: Reglas que ya no te sirven."),
    ("VI Los Amantes", "p08_3.png", "Una decisión del corazón que define quién eres. No es solo pareja: es elegir con qué y con quién te quedas. Atracción que se siente en el cuerpo. (Tip visual: el ángel guiando). Inv: Elegir por presión o costumbre."),
    ("VII El Carro", "p08_4.png", "Avanzas porque tomas las riendas, aunque las fuerzas tiren para lados distintos. Viajes, mudanzas, un auto. (Tip visual: esfinges controladas). Inv: Acelerar sin rumbo, o frenarte justo antes de llegar."),
    ("VIII Fuerza", "p09_1.png", "No se gana a empujones sino con suavidad: domas al impulso con ternura. Paciencia con alguien difícil, o contigo. Salud que se recupera. (Tip visual: acariciando al león). Inv: Explotar por todo, o dejar que te pasen por encima."),
    ("IX El Ermitaño", "p09_2.png", "Necesitas tiempo a solas para escucharte; el ruido de los demás no te deja pensar. Estudio, retiro, un consejero mayor. (Tip visual: la lámpara encendida). Inv: Encerrarte para no enfrentar; rechazar la ayuda que llega."),
    ("X Rueda de la Fortuna", "p09_3.png", "Un giro que no controlas: se cierra una etapa y empieza otra. Lo que sube baja y lo que bajó vuelve a subir. (Tip visual: la rueda girando). Inv: Resistirte al giro; repetir el mismo error en cada vuelta."),
    ("XI Justicia", "p10_1.png", "Cada cosa pesa lo que pesa: recibes el resultado exacto de lo que hiciste. Contratos, firmas, decidir con cabeza fría. (Tip visual: la balanza nivelada). Inv: Culpar a otros de lo propio; un resultado que llega torcido."),
    ("XII El Colgado", "p10_2.png", "Estás detenido, pero no perdido: desde ahí ves lo que nadie ve. Renunciar a algo para ganar otra cosa. (Tip visual: halo luminoso). Inv: Quedarte colgado por costumbre; sacrificarte por quien no lo valora."),
    ("XIII Muerte", "p10_3.png", "Algo termina para que puedas seguir: un trabajo, una etapa, una versión de ti. Duele soltar, pero lo que se va ya no tenía vida. (Tip visual: el sol amaneciendo al fondo). Inv: Aferrarte a lo que ya murió; el cierre se alarga."),
    ("XIV Templanza", "p11_1.png", "Ni todo ni nada: la medida justa. Mezclar, negociar, curar de a pocos. Alguien que te equilibra. (Tip visual: el agua fluyendo entre copas). Inv: Pasarte de la raya; mezclar lo que no combina."),
    ("XV El Diablo", "p11_2.png", "Lo que te ata lo elegiste tú y puedes soltarlo: un vicio, una relación tóxica, una deuda, un miedo. La cadena está floja. (Tip visual: cadenas sueltas, puedes escapar). Inv: Reconoces la trampa y empiezas a salir."),
    ("XVI La Torre", "p12_1.png", "Lo mal construido se viene abajo, y era necesario. Una verdad sale a la luz. Tras el susto, terreno limpio para edificar de nuevo. (Tip visual: el rayo que limpia). Inv: El derrumbe se evita o se posterga; temerlo es peor que vivirlo."),
    ("XVII La Estrella", "p12_2.png", "Después de lo difícil, respiras: algo o alguien te devuelve la fe. Cuida tu cuerpo, bebe agua, mira el cielo. (Tip visual: la gran estrella brillante). Inv: Perder la fe justo antes de que llegue lo bueno."),
    ("XVIII La Luna", "p12_3.png", "Las cosas no son como parecen: hay una parte escondida. Noches sin dormir, presentimientos, celos. (Tip visual: el cangrejo saliendo del agua). Inv: Lo escondido sale a la luz; vuelves a ver con claridad."),
    ("XIX El Sol", "p13_1.png", "Todo a la vista y todo bien: salud, un niño, un día simple que se disfruta entero. Brilla sin pedir permiso. (Tip visual: el niño alegre). Inv: Nubes pasajeras: el logro se demora o tú mismo le bajas el brillo."),
    ("XX El Juicio", "p13_2.png", "Un llamado que no puedes ignorar: cambiar de rumbo, reconciliarte, volver a empezar con lo aprendido. Lo pendiente vuelve a buscarte. (Tip visual: la trompeta sonando). Inv: Postergar la decisión; juzgarte con dureza."),
    ("XXI El Mundo", "p13_3.png", "Terminaste el ciclo completo y lo hiciste bien. Graduaciones, viajes al extranjero, metas cumplidas. Celebra antes de empezar lo que sigue. (Tip visual: la corona de laureles). Inv: Un cierre a medias; falta el último paso."),
]

BASTOS = [
    ("As de Bastos", "p14_1.png", "La idea que te quita el sueño y te empuja a levantarte. Es un impulso, no un resultado: hay que tomarlo antes de que se enfríe. (Tip visual: hojas brotando). Inv: El fuego se apaga por esperar demasiado o por dudar de ti."),
    ("Dos de Bastos", "p15_1.png", "Tienes el mundo en la mano y aun así miras lejos: lo logrado te quedó chico. Elegir entre lo seguro y lo que te llama. (Tip visual: mundo en la mano). Inv: Quedarte en el balcón mirando; quien decide por ti no es tú."),
    ("Tres de Bastos", "p15_2.png", "Lo que mandaste ya viene de vuelta; mientras tanto, mira el horizonte y prepara el siguiente paso. Negocios con gente de lejos. (Tip visual: barcos a lo lejos). Inv: Lo esperado se atrasa; revisa la estrategia."),
    ("Cuatro de Bastos", "p15_3.png", "Un techo propio, una mesa llena, un motivo para brindar. Lo construido se sostiene y se celebra con los tuyos. (Tip visual: guirnalda de flores). Inv: La fiesta sin ganas; pequeñas tensiones en casa que conviene hablar."),
    ("Cinco de Bastos", "p16_2.png", "Todos quieren tener la razón y nadie escucha: discusiones que no llegan a nada. A veces es competencia sana que te despierta. (Tip visual: bastos cruzados). Inv: Baja el tono y el ruido se apaga."),
    ("Seis de Bastos", "p16_3.png", "Te aplauden por algo que te costó: un ascenso, un premio, una noticia que querías contar. Recíbelo con la frente en alto y sin creértela. (Tip visual: corona de laurel). Inv: El aplauso no llega, o llega y te marea."),
    ("Siete de Bastos", "p16_4.png", "Estás arriba y por eso te disputan el lugar: defiende lo tuyo sin pedir disculpas. Críticas, alguien que quiere tu puesto. (Tip visual: posición elevada). Inv: Ceder por cansancio; sentir que no vale la pena."),
    ("Ocho de Bastos", "p17_1.png", "Todo se acelera: mensajes, respuestas, un amor a primera vista, un vuelo. Lo que estaba trabado se destraba de golpe. (Tip visual: bastos volando solos). Inv: Mensajes cruzados, demoras, un vuelo que no sale."),
    ("Nueve de Bastos", "p17_2.png", "Has aguantado mucho y por eso desconfías, pero falta poco. Cura la herida sin bajar la guardia del todo. (Tip visual: hombre vendado). Inv: Desconfiar de todos; rendirte a un paso de la meta."),
    ("Diez de Bastos", "p17_3.png", "Cargas lo que no te toca y nadie lo nota. Delegar no es fallar. Mira qué puedes soltar antes de que te doble la espalda. (Tip visual: postura encorvada). Inv: Soltas la carga, o te derrumbas con ella encima."),
    ("Sota de Bastos", "p18_1.png", "Llega un mensaje que te ilusiona: una oferta, una invitación, una idea que da ganas de contar. Alguien joven con chispa. (Tip visual: fascinación con el basto). Inv: Promesas que se desinflan en un día."),
    ("Caballero de Bastos", "p18_2.png", "Alguien entra en tu vida con fuerza y se va igual de rápido; o eres tú con ganas de irte a otra ciudad. Mucho impulso, poco plan. (Tip visual: caballo encabritado). Inv: Peleas por nada; un cambio que sale mal por apuro."),
    ("Reina de Bastos", "p18_3.png", "Una mujer que llena la sala: segura, cálida, con un ojo en el negocio y otro en su casa. Te pide que te muestres sin disculparte. (Tip visual: gato negro). Inv: Celos, exigencia, o esconder tu brillo para no incomodar."),
    ("Rey de Bastos", "p19_1.png", "Un hombre que arma proyectos y contagia a otros: jefe, mentor o padre. Te pide ver en grande y actuar. (Tip visual: salamandras). Inv: Autoritario, impaciente; habla mucho y ejecuta poco."),
]

COPAS = [
    ("As de Copas", "p19_2.png", "El corazón se abre otra vez: algo o alguien te conmueve de verdad. Un embarazo, una amistad que empieza, lágrimas de alivio. (Tip visual: paloma de la paz). Inv: Guardar lo que sientes hasta que se seca."),
    ("Dos de Copas", "p19_3.png", "Dos que se miran de igual a igual: reconciliación, un acuerdo, química mutua. Un socio o amigo con quien todo fluye. (Tip visual: león rojo y caduceo). Inv: Uno da y el otro recibe; la distancia que nadie nombra."),
    ("Tres de Copas", "p20_1.png", "Las amigas, la familia que se junta, el brindis que cierra una etapa. Apóyate en tu gente. (Tip visual: mujeres brindando). Inv: Fiestas de más; un tercero en la pareja; chismes."),
    ("Cuatro de Copas", "p20_2.png", "Te ofrecen algo y ni lo miras: el aburrimiento te tapa la vista. Lo que necesitas está a tu lado. (Tip visual: copa ofrecida desde la nube). Inv: Despiertas y aceptas lo que llega."),
    ("Cinco de Copas", "p20_3.png", "Lloras lo derramado y no ves las copas que siguen de pie. Permítete el duelo, pero date vuelta. (Tip visual: copas derramadas). Inv: Aceptar lo que fue y confiar en lo que queda."),
    ("Seis de Copas", "p21_1.png", "Alguien del pasado vuelve, o el pasado vuelve en ti: olores, lugares, un amor de la juventud. Lo simple y sincero cura. (Tip visual: niños jugando). Inv: Quedarte en lo que fue; idealizar algo que ya no es."),
    ("Siete de Copas", "p21_2.png", "Demasiadas puertas y ninguna abierta: fantaseas en vez de elegir. Una de esas copas tiene trampa. Pon los pies en la tierra. (Tip visual: figuras en las nubes). Inv: Se aclara la mente y escoges una sola cosa, la real."),
    ("Ocho de Copas", "p21_3.png", "Lo tenías casi todo y aun así te vas, porque adentro falta algo. Dejar un trabajo, una relación o una ciudad por buscar sentido. (Tip visual: alejándose hacia la montaña). Inv: Quedarte por miedo; irte sin cerrar."),
    ("Nueve de Copas", "p22_1.png", "Lo que pediste se concreta y te sientas a disfrutarlo. Un gusto bien ganado, sin culpa. (Tip visual: sonrisa de orgullo). Inv: Tienes todo y no te alcanza; presumir o pasarse."),
    ("Diez de Copas", "p22_2.png", "Un hogar donde da gusto estar: pareja, hijos, un acuerdo de paz en la familia. La sensación de haber llegado. (Tip visual: arcoíris en el cielo). Inv: Una familia que aparenta; promesas de hogar que no se cumplen."),
    ("Sota de Copas", "p22_3.png", "Una sorpresa tierna: un mensaje cariñoso, un sueño con aviso, ganas de crear algo. Alguien tierno e inexperto te busca. (Tip visual: pez saliendo de la copa). Inv: Caprichos; ignorar lo que el corazón avisa."),
    ("Caballero de Copas", "p23_1.png", "Llega alguien con flores en la mano, o eres tú llevando una propuesta sincera. Detalles, cartas, gestos bonitos. (Tip visual: avance tranquilo). Inv: Mucho gesto y poca sustancia; el galán que no cumple."),
    ("Reina de Copas", "p23_2.png", "La que escucha sin juzgar y sabe lo que sientes antes de que hables. Madre, terapeuta, amiga del alma. (Tip visual: copa cerrada). Inv: Absorber el dolor ajeno; vivir en la fantasía."),
    ("Rey de Copas", "p23_3.png", "Un hombre que siente mucho y lo controla con elegancia: consejero, padre presente, pareja tranquila. (Tip visual: trono sobre agua revuelta). Inv: Frialdad disfrazada de calma; manipular con lástima."),
]

ESPADAS = [
    ("As de Espadas", "p24_1.png", "De golpe lo ves claro y ya no puedes no verlo. Una decisión que corta, un diagnóstico, una verdad sin anestesia. (Tip visual: corona traspasada). Inv: Pensar en círculos; usar la palabra para herir."),
    ("Dos de Espadas", "p24_2.png", "Te tapas los ojos para no elegir, y el no elegir también decide. Una tregua que no puede durar. (Tip visual: luna creciente). Inv: La venda cae: eliges, aunque duela, o te lo imponen."),
    ("Tres de Espadas", "p24_3.png", "La puñalada que no esperabas: una ruptura, una mentira descubierta, palabras que no se borran. Llorar también limpia. (Tip visual: lluvia y espadas). Inv: La herida empieza a cerrar; perdonar para seguir."),
    ("Cuatro de Espadas", "p25_1.png", "Cuerpo y mente te piden una pausa, y si no la tomas te la impone la salud. Retiro, silencio, apagar el teléfono. (Tip visual: postura de reposo). Inv: Vuelves a la actividad; o te niegas a parar y te cuesta más caro."),
    ("Cinco de Espadas", "p25_2.png", "Ganaste la discusión y perdiste a la persona. Orgullo, humillaciones, alguien que juega sucio. Pregúntate qué vale más. (Tip visual: sonrisa egoísta). Inv: Soltar el rencor y hacer las paces, aunque nadie pida perdón."),
    ("Seis de Espadas", "p25_3.png", "Te alejas de la orilla difícil con lo puesto; no es huir, es cruzar. Mudanzas, viajes para sanar, mejoría lenta. (Tip visual: aguas mansas al frente). Inv: Querer irte sin moverte; cargar el problema al otro lado."),
    ("Siete de Espadas", "p26_1.png", "Alguien se lleva algo tuyo a escondidas, o tú actúas por detrás para evitar un enfrentamiento. Revisa contratos y contraseñas. (Tip visual: huida de puntillas). Inv: El engaño se descubre; confiesa antes."),
    ("Ocho de Espadas", "p26_2.png", "La cárcel es mental: las ataduras están flojas y la puerta a un paso, pero no te atreves a mirar. Pide ayuda para ver. (Tip visual: ataduras sueltas). Inv: Te quitas la venda; vuelves a mandar en tu cabeza."),
    ("Nueve de Espadas", "p26_3.png", "Las tres de la mañana y la cabeza dando vueltas: el problema de día es la mitad de grande. Habla con alguien; no lo cargues solo. (Tip visual: despertando en la noche). Inv: Amanece; buscas ayuda y el peso se reparte."),
    ("Diez de Espadas", "p27_1.png", "Tocaste fondo y por eso ya no puedes caer más. Lo peor pasó. Deja que ese capítulo muera del todo. (Tip visual: amanecer al fondo). Inv: Levantarte con las cicatrices puestas; el final tarda en aceptarse."),
    ("Sota de Espadas", "p27_2.png", "Alguien vigila y pregunta de más: un joven listo, un rumor que corre, un mensaje que exige respuesta. Piensa antes de contestar. (Tip visual: postura de alerta). Inv: Hablar de más, espiar, defenderte de ataques que no existen."),
    ("Caballero de Espadas", "p27_3.png", "Entra como un vendaval: dice lo que piensa y actúa antes de medir. Discusiones, decisiones a toda velocidad, alguien que llega a imponer. (Tip visual: árboles agitados). Inv: Agresividad sin dirección."),
    ("Reina de Espadas", "p28_1.png", "Una mujer que aprendió a base de pérdidas y ya no se deja engañar. Pone límites con una sola frase. Viuda, divorciada o muy independiente. (Tip visual: mano levantada poniendo un alto). Inv: Amargura; cerrarse por miedo a sufrir."),
    ("Rey de Espadas", "p28_2.png", "El juez, el abogado, el médico: autoridad que decide con la cabeza y sin favoritismos. Reglas claras y palabras exactas. (Tip visual: espada totalmente recta). Inv: Abusar del poder; crueldad disfrazada de lógica."),
]

OROS = [
    ("As de Oros", "p28_3.png", "Te ponen una semilla en la mano: una oferta, un pago, un terreno, una idea de negocio. Lo que siembres aquí da fruto. (Tip visual: jardín exuberante). Inv: Se te escapa por no actuar, o por confiar mal."),
    ("Dos de Oros", "p29_1.png", "Dos trabajos, dos cuentas, dos amores: haces malabares y de momento no se cae nada. Mantén el ritmo pero decide pronto. (Tip visual: símbolo de infinito). Inv: Se cae una pelota; cuentas que no cuadran, agenda que desborda."),
    ("Tres de Oros", "p29_2.png", "Tu trabajo lo ven y lo valoran los que saben: un contrato, un reconocimiento del jefe, un equipo que funciona. (Tip visual: planos en el monasterio). Inv: Nadie coopera, trabajo sin reconocimiento, hacerlo a medias."),
    ("Cuatro de Oros", "p29_3.png", "Guardas con fuerza lo que te costó, y está bien, pero también estás apretando a las personas. Suelta un poco la mano. (Tip visual: abrazando la moneda). Inv: Gastar por ansiedad o cerrarte tanto que nada entra."),
    ("Cinco de Oros", "p29_4.png", "La noche fría: falta plata, salud o compañía, y la puerta con luz está ahí pero no la ves. Pide ayuda antes de creer que no hay. (Tip visual: ventana iluminada). Inv: Vuelves a entrar en calor; un apoyo inesperado."),
    ("Seis de Oros", "p30_1.png", "Hoy das o hoy recibes: un préstamo, un favor, un aumento, una donación. Mira si la balanza está pareja. (Tip visual: la balanza). Inv: Deudas que atan, caridad con condiciones, abusar de quien ayuda."),
    ("Siete de Oros", "p30_2.png", "Ya sembraste; ahora toca mirar el arbusto y esperar. Evalúa si vale seguir invirtiendo tiempo y dinero aquí. (Tip visual: observando el arbusto). Inv: Impaciencia que arranca el fruto verde; un esfuerzo con poco retorno."),
    ("Ocho de Oros", "p30_3.png", "Repetir hasta que salga perfecto: un curso, un oficio, un detalle que mejoras cada día. Lo que entra, entra por constancia. (Tip visual: tallando monedas idénticas). Inv: Hacer por hacer; mucho esfuerzo para poco pago."),
    ("Nueve de Oros", "p30_4.png", "Te lo ganaste solo y puedes disfrutarlo sin pedir permiso: tu casa, tu jardín, tu tiempo. Comodidad con elegancia. (Tip visual: halcón domado). Inv: Depender del dinero de otro; aparentar lo que no se tiene."),
    ("Diez de Oros", "p31_1.png", "Lo que dejas a los que vienen: casa propia, empresa familiar, herencia, un apellido. Decisiones que duran generaciones. (Tip visual: tres generaciones y perros). Inv: Peleas por la herencia; familia unida solo por dinero."),
    ("Sota de Oros", "p31_2.png", "Un chico con ganas de aprender, o tú frente a una beca o un primer puesto. Empieza por lo pequeño. (Tip visual: concentración en la moneda). Inv: Flojera, abandonar las clases, un proyecto que no arranca."),
    ("Caballero de Oros", "knight_pentacles.png", "Avanza despacio pero no se detiene: el que cumple, paga puntual y aparece todos los días. Resultados por método, no por chispa. (Tip visual: caballo quieto, moneda en alto). Inv: Quedarte quieto por costumbre; aburrimiento disfrazado de deber."),
    ("Reina de Oros", "p31_3.png", "La que hace rendir el sueldo, cuida la casa y además emprende. Resuelve y tiene los pies en el suelo. (Tip visual: naturaleza floreciente). Inv: Descuidarte por cuidar a todos."),
    ("Rey de Oros", "p31_4.png", "El hombre que levantó lo suyo ladrillo a ladrillo y lo cuida. Jefe, inversionista, padre proveedor. Piensa a largo plazo. (Tip visual: túnica de racimos de uvas). Inv: Tacaño; medir todo en plata."),
]


# ---- Paginación: secuencia plana con cortes de página ("|") ----------------
# Cartas a 4 por página (8,04 pt, miniaturas de 30 pt) para liberar las
# páginas 26-31 para la guía del principiante.
H = lambda t: ("h", t)
P = lambda t: ("p", t)
C = lambda lst, i: ("c", lst[i])
BR = "|"

SEQ = [
    H("SIGNIFICADOS: ARCANOS MAYORES"), H("Fase 1: El Mundo Físico (0 al 7)"), C(MAYORES, 0), C(MAYORES, 1), C(MAYORES, 2), BR,
    C(MAYORES, 3), C(MAYORES, 4), C(MAYORES, 5), C(MAYORES, 6), BR,
    C(MAYORES, 7), H("Fase 2: El Mundo Interno (8 al 14)"), C(MAYORES, 8), C(MAYORES, 9), BR,
    C(MAYORES, 10), C(MAYORES, 11), C(MAYORES, 12), C(MAYORES, 13), BR,
    C(MAYORES, 14), H("Fase 3: El Mundo Espiritual (15 al 21)"), C(MAYORES, 15), C(MAYORES, 16), BR,
    C(MAYORES, 17), C(MAYORES, 18), C(MAYORES, 19), C(MAYORES, 20), BR,
    C(MAYORES, 21), H("ARCANOS MENORES (56 Cartas)"),
    P("Hablan del día a día: las personas que te rodean y las situaciones que puedes cambiar con tus decisiones. Cada palo tiene 10 números y 4 figuras (Sota, Caballero, Reina y Rey)."),
    H("BASTOS (Acción y Fuego)"), C(BASTOS, 0), BR,
    C(BASTOS, 1), C(BASTOS, 2), C(BASTOS, 3), C(BASTOS, 4), BR,
    C(BASTOS, 5), C(BASTOS, 6), C(BASTOS, 7), C(BASTOS, 8), BR,
    C(BASTOS, 9), C(BASTOS, 10), C(BASTOS, 11), C(BASTOS, 12), BR,
    C(BASTOS, 13), H("COPAS (Emociones y Agua)"), C(COPAS, 0), C(COPAS, 1), BR,
    C(COPAS, 2), C(COPAS, 3), C(COPAS, 4), C(COPAS, 5), BR,
    C(COPAS, 6), C(COPAS, 7), C(COPAS, 8), C(COPAS, 9), BR,
    C(COPAS, 10), C(COPAS, 11), C(COPAS, 12), C(COPAS, 13), BR,
    H("ESPADAS (Mente y Aire)"), C(ESPADAS, 0), C(ESPADAS, 1), C(ESPADAS, 2), BR,
    C(ESPADAS, 3), C(ESPADAS, 4), C(ESPADAS, 5), C(ESPADAS, 6), BR,
    C(ESPADAS, 7), C(ESPADAS, 8), C(ESPADAS, 9), BR,
    C(ESPADAS, 10), C(ESPADAS, 11), C(ESPADAS, 12), BR,
    C(ESPADAS, 13), H("OROS (Lo Material y Tierra)"), C(OROS, 0), C(OROS, 1), BR,
    C(OROS, 2), C(OROS, 3), C(OROS, 4), C(OROS, 5), BR,
    C(OROS, 6), C(OROS, 7), C(OROS, 8), C(OROS, 9), BR,
    C(OROS, 10), C(OROS, 11), C(OROS, 12), C(OROS, 13),
]

PAGES = {}

PAGES[2] = dict(size=9.96, html=
    h("TU PRIMERA LECTURA") +
    '<p class="h ind">1.&nbsp;&nbsp;&nbsp;Preparación:</p>' +
    p("Respira profundo tres veces para despejar tu mente.") +
    p("Baraja pensando en tu consulta. No hay reglas. Puedes hacer \"montoncitos\", estilo casino, etc. Lo importante es tu intención.") +
    p("Corta el mazo en dos o tres partes y vuelve a unirlo.") +
    '<p class="h ind">2.&nbsp;&nbsp;&nbsp;La Pregunta:</p>' +
    p("El Tarot orienta, no sentencia.") +
    p("<b>Evita:</b> Preguntas de \"Sí/No\" (\"¿Me llamará?\")."))

PAGES[3] = dict(size=9.96, html=
    p("<b>Pregunta:</b> Empieza con \"Qué\" o \"Cómo\" (\"¿Qué actitud debo tomar hoy?\", \"¿Cómo mejoro esta situación?\").") +
    h("3. La Tirada") +
    p("<b>Tirada Clásica (3 cartas):</b> Ideal para ver la evolución de cualquier tema.") +
    p("Carta 1 (Izquierda): Pasado (Origen del problema).") +
    p("Carta 2 (Centro): Presente (La energía actual).") +
    p("Carta 3 (Derecha): Futuro (Dirección).") +
    p("Más tiradas en la página 31."))

PAGES[4] = dict(size=9.96, html=
    p("Si la carta sale invertida <b>(Inv)</b> lee las palabras clave que vienen al revés en la parte de arriba de la carta, o el \"Inv\" de esta guía.") +
    h("4. Interpretación") +
    p("Antes de leer los significados en este manual, mira la imagen de la carta. Fíjate en los colores y qué te hace sentir. Tu intuición es el primer mensaje.") +
    p("Tu mazo trae ayudas impresas en cada carta: palabras clave, número, chakra, planeta, signo y Sí/No. En las páginas 28 a 30 te explicamos cómo usarlas."))

PAGES[5] = dict(size=8.52, cls="g", html=
    h("5. LOS ARCANOS MAYORES (Primeras 22 Cartas)") +
    p("Representan los grandes hitos del destino y las lecciones espirituales profundas que tu alma debe aprender en esta vida. Son la energía \"macro\" de la lectura, marcando eventos inevitables o cambios a largo plazo.") +
    p("<b>Tip de lectura:</b> Puedes barajar y consultar usando solo estas 22 cartas. Es el método más recomendado para principiantes cuando buscan respuestas sobre su propósito, lecciones de vida o situaciones que cambian el rumbo de su destino.") +
    p("<b>Lee el conjunto antes que cada carta:</b> muchos arcanos mayores = el tema es de destino, no de detalles. Muchas cartas de un mismo palo = ese es el verdadero tema. Varias figuras = hay más personas involucradas. Varias invertidas = el bloqueo está dentro de ti."))

# páginas 6..27: cartas
pg = 6; buf = []
for it in SEQ + [BR]:
    if it == BR:
        PAGES[pg] = dict(size=7.9, cls="c4", html="".join(buf)); pg += 1; buf = []
    elif it[0] == "h":
        buf.append(h(it[1]))
    elif it[0] == "p":
        buf.append(p(it[1]))
    else:
        buf.append(card(*it[1]))
assert pg == 28, pg

PAGES[28] = dict(cls="g", size=8.52, html=
    h("QUÉ TRAE CADA CARTA DE TU MAZO") +
    p("<b>Palabras clave (abajo):</b> el significado resumido. Léelas primero. El significado largo está en el folleto del mazo y el \"Tip visual\" en esta guía.") +
    p("<b>Palabras al revés (arriba):</b> el significado si la carta sale invertida. Gira la carta.") +
    p("<b>Número grande:</b> su numerología (pág. 29).") +
    p("<b>Símbolo de color:</b> el chakra que activa (pág. 30).") +
    p("<b>Símbolos negros:</b> planeta y signo zodiacal (pág. 30).") +
    p("<b>Sí / No / El Quizá:</b> la respuesta rápida de la carta (pág. 31).") +
    p("<b>Franja lateral:</b> afirmación. Léela en voz alta al cerrar.") +
    p("<b>Fondo:</b> el elemento: fuego, agua, aire o tierra (pág. 30)."))

PAGES[29] = dict(cls="g", size=8.52, html=
    h("NUMEROLOGÍA: EL NÚMERO DE LA CARTA") +
    p("El número dice en qué etapa está el tema; el palo o el arcano dice de qué trata.") +
    p("<b>1 / As:</b> inicio, semilla. <b>2:</b> unión, decisión. <b>3:</b> crecimiento, creatividad. <b>4:</b> estabilidad, base. <b>5:</b> cambio, conflicto. <b>6:</b> armonía, ayuda. <b>7:</b> reflexión, prueba. <b>8:</b> poder, movimiento. <b>9:</b> culminación. <b>10:</b> cierre de ciclo y nuevo comienzo.") +
    p("<b>Arcanos mayores (11 al 21):</b> suma los dígitos: 14 = 1 + 4 = 5 (cambio). <b>0 El Loco:</b> potencial puro.") +
    p("<b>Figuras:</b> personas o actitudes. Sota = aprender, noticia. Caballero = actuar, movimiento. Reina = sentir, cuidar. Rey = dominar, decidir.") +
    p("<b>Truco:</b> un número repetido en la tirada es el mensaje central."))

PAGES[30] = dict(cls="g", size=7.7, html=
    h("CHAKRA, PLANETA Y SIGNO EN LA LECTURA") +
    p("El mazo trae dos cartas de referencia (planetas y chakras) que no entran en la tirada: tenlas al lado.") +
    p("<b>Chakra = qué parte de tu vida se mueve.</b> Usa la frase de la tabla: \"Yo tengo\" (raíz) habla de lo que necesitas asegurar; \"Yo siento\", de placer y deseo; \"Yo puedo\", de tu voluntad; \"Yo amo\", de vínculos; \"Yo hablo\", de algo que debes decir; \"Ya veo\", de una intuición; \"Lo sé\", de un aprendizaje de vida. Si dos cartas comparten chakra, ahí está el nudo.") +
    p("<b>Planeta = cuándo y con qué ritmo.</b> Luna: días. Mercurio: semanas. Venus y Marte: uno o dos meses. Sol: una estación. Júpiter: un año. Saturno: lento, con esfuerzo. Urano: de golpe. Neptuno: sin fecha aún. Plutón: cuando sueltes algo.") +
    p("<b>Signo = el elemento.</b> Fuego (Aries, Leo, Sagitario): actúa. Agua (Cáncer, Escorpio, Piscis): siente. Aire (Géminis, Libra, Acuario): habla. Tierra (Tauro, Virgo, Capricornio): construye. Si sale tu signo, la carta te habla a ti."))

PAGES[31] = dict(cls="g", size=8.04, html=
    h("TIRADAS SIMPLES") +
    p("<b>Sí / No (1 carta):</b> piensa la pregunta, baraja y saca una carta. Lee la palabra impresa: Sí, No o El Quizá. \"El Quizá\" = depende de ti; saca otra carta para ver de qué.") +
    p("<b>Carta del día (1 carta):</b> cada mañana, \"¿qué energía me acompaña hoy?\". Lee sus palabras clave y repite su afirmación.") +
    p("<b>Cruz (5 cartas):</b> 1 (centro) la situación; 2 (izquierda) lo que te frena; 3 (arriba) el consejo; 4 (abajo) la raíz, lo que no ves; 5 (derecha) el resultado probable.") +
    p("<b>Amor (5 cartas):</b> 1 tú; 2 la otra persona; 3 lo que los une; 4 lo que los separa; 5 hacia dónde va.") +
    p("<b>Trabajo (3 cartas):</b> 1 mi situación; 2 lo que debo cambiar; 3 resultado en tres meses. Cuando domines estas, pasa a las tiradas de 7 cartas del folleto (Herradura y Pájaro Volador).") +
    p("<b>Consejo:</b> pregunta una sola vez. Las cartas \"feas\" avisan, no condenan."))
