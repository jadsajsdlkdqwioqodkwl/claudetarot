# -*- coding: utf-8 -*-
# Contenido del manual de la baraja española (32 páginas).
# Cada página: dict(size=pt, html=...). Las cartas se arman con card().

def card(nombre, img, texto):
    return (f'<div class="e"><img src="cards/{img}"><p><b>{nombre}:</b> {texto}</p></div>')

def h(t):
    return f'<p class="h">{t}</p>'

def p(t):
    return f'<p>{t}</p>'

OROS = [
    ("As de Oros", "Aoros.png", "Golpe de suerte, dinero que llega, regalo, contrato importante. La mejor carta para el bolsillo. Acepta lo que llega. Inv: Oportunidad perdida, pago que se demora."),
    ("Dos de Oros", "2oros.png", "Equilibrio, dinero que va y viene, elegir entre dos opciones económicas. Ordena tus cuentas antes de decidir. Inv: Desorden, gastar de más."),
    ("Tres de Oros", "3oros.png", "Trabajo bien hecho y reconocido, habilidad, un ingreso extra, ayuda de un socio. Muestra lo que sabes hacer. Inv: Esfuerzo sin recompensa."),
    ("Cuatro de Oros", "4oros.png", "Estabilidad, ahorro, seguridad material; también miedo a soltar lo que tienes. Guarda, pero no te cierres. Inv: Tacañería o pérdida por aferrarse."),
    ("Cinco de Oros", "5oros.png", "Gasto inesperado, carencia pasajera, preocupación por dinero o salud. Pide ayuda: siempre llega. Inv: Recuperación, salir del bache."),
    ("Seis de Oros", "6oros.png", "Generosidad, pago que recibes, deuda que se salda, un favor devuelto. Da y recibe con justicia. Inv: Deudas, abuso de la confianza."),
    ("Siete de Oros", "7oros.png", "Paciencia, inversión que madura, esperar la cosecha del trabajo. No arranques el fruto verde. Inv: Impaciencia, poco fruto."),
    ("Ocho de Oros", "8oros.png", "Trabajo constante, aprender un oficio, dedicación, perfeccionar lo que haces. Practica a diario. Inv: Rutina, falta de ambición."),
    ("Nueve de Oros", "9oros.png", "Abundancia, independencia económica, éxito merecido, darte un gusto. Disfruta lo que lograste. Inv: Dependencia, gastos excesivos."),
    ("Sota de Oros (10)", "Soros.png", "Joven práctico y estudioso, noticia de dinero o trabajo, oferta laboral, inicio de estudios. Escucha la propuesta. Inv: Pereza, joven interesado."),
    ("Caballo de Oros (11)", "Coros.png", "Dinero en movimiento, noticia de negocio, viaje por trabajo, hombre joven trabajador. Muévete, no esperes sentado. Inv: Pagos que se atrasan."),
    ("Rey de Oros (12)", "Roros.png", "Hombre maduro con dinero, jefe, empresario, protección material, éxito consolidado. Busca su consejo. Inv: Avaricia, corrupción."),
]

COPAS = [
    ("As de Copas", "Acopas.png", "Nuevo amor, felicidad en el hogar, inicio emocional, embarazo o nacimiento. Abre el corazón. Inv: Bloqueo emocional, tristeza."),
    ("Dos de Copas", "2copas.png", "Pareja, unión, reconciliación, atracción mutua, acuerdo entre dos. Conversa con sinceridad. Inv: Ruptura, desencuentro."),
    ("Tres de Copas", "3copas.png", "Celebración, fiesta, amistades, buena noticia en la familia. Comparte tu alegría. Inv: Excesos, chismes."),
    ("Cuatro de Copas", "4copas.png", "Apatía, aburrimiento, no valorar lo que tienes, rechazar una oferta. Mira lo que te están ofreciendo. Inv: Despertar, nueva motivación."),
    ("Cinco de Copas", "5copas.png", "Pérdida, duelo, decepción amorosa; aún queda algo por rescatar. Llora y luego voltea a ver lo que queda. Inv: Aceptación, superar el dolor."),
    ("Seis de Copas", "6copas.png", "Recuerdos, nostalgia, un amor del pasado que vuelve, inocencia, niños. Recuerda sin quedarte atrás. Inv: Vivir en el pasado."),
    ("Siete de Copas", "7copas.png", "Ilusiones, fantasías, muchas opciones, confusión del corazón. Elige con los pies en la tierra. Inv: Claridad, elección realista."),
    ("Ocho de Copas", "8copas.png", "Dejar atrás, alejarse de lo que ya no llena, buscar algo más profundo. Suelta sin culpa. Inv: Miedo al cambio."),
    ("Nueve de Copas", "9copas.png", "Deseo cumplido, satisfacción, bienestar, gratitud. La carta del \"sí\" en el amor. Agradece. Inv: Vanidad, insatisfacción."),
    ("Sota de Copas (10)", "Scopas.png", "Joven sensible y soñador, mensaje de amor, declaración, noticia feliz. Responde con el corazón. Inv: Inmadurez, capricho."),
    ("Caballo de Copas (11)", "Ccopas.png", "Pretendiente, propuesta romántica, invitación, hombre joven romántico. Déjate querer, sin perder el piso. Inv: Engaño, promesas vacías."),
    ("Rey de Copas (12)", "Rcopas.png", "Hombre maduro afectuoso, consejero, figura paterna, generoso. Apóyate en quien te cuida. Inv: Manipulación, frialdad."),
]

ESPADAS = [
    ("As de Espadas", "Aespadas.png", "Fuerza, decisión, claridad, triunfo después de una lucha. Puede indicar un corte necesario. Decide de una vez. Inv: Confusión, violencia."),
    ("Dos de Espadas", "2espadas.png", "Indecisión, bloqueo, tregua, dos caminos y ninguna elección. Quítate la venda y mira. Inv: Decisión forzada."),
    ("Tres de Espadas", "3espadas.png", "Dolor, separación, traición, corazón roto, llanto necesario. Permítete sentir. Inv: Sanación, perdón."),
    ("Cuatro de Espadas", "4espadas.png", "Descanso obligado, recuperación, pausa, enfermedad leve, meditación. Para y recupera fuerzas. Inv: Regreso a la actividad."),
    ("Cinco de Espadas", "5espadas.png", "Discusión, conflicto, ganar perdiendo, orgullo herido. No pelees por tener la razón. Inv: Reconciliación, olvidar rencores."),
    ("Seis de Espadas", "6espadas.png", "Viaje, cambio, alejarse de los problemas, mejora lenta pero segura. Avanza aunque sea despacio. Inv: Resistencia al cambio."),
    ("Siete de Espadas", "7espadas.png", "Engaño, astucia, robo, secretos, alguien actúa a escondidas. Cuida tus cosas y tus palabras. Inv: Confesión, se descubre la verdad."),
    ("Ocho de Espadas", "8espadas.png", "Sentirse atrapado, miedo, limitaciones que uno mismo se pone. La salida existe: búscala. Inv: Liberación, ver la salida."),
    ("Nueve de Espadas", "9espadas.png", "Ansiedad, insomnio, preocupación, culpa, estrés mental. No lo cargues solo. Inv: Esperanza, buscar ayuda."),
    ("Sota de Espadas (10)", "Sespadas.png", "Joven vigilante o chismoso, espía, noticia desagradable, persona curiosa. Cuidado con lo que cuentas. Inv: Calumnia, hablar de más."),
    ("Caballo de Espadas (11)", "Cespadas.png", "Acción rápida, pelea, llegada repentina de un problema, hombre joven impulsivo. Respira antes de reaccionar. Inv: Agresividad."),
    ("Rey de Espadas (12)", "Respadas.png", "Hombre de autoridad, juez, abogado, militar, justicia, lógica fría. Actúa con la ley y la razón. Inv: Tiranía, crueldad."),
]

BASTOS = [
    ("As de Bastos", "Abastos.png", "Inicio de un proyecto, chispa creativa, energía, nueva idea con fuerza. Empieza hoy. Inv: Retrasos, falta de motivación."),
    ("Dos de Bastos", "2bastos.png", "Planificación, elegir entre dos caminos, sociedad, salir de la zona de confort. Planea y atrévete. Inv: Miedo a lo desconocido."),
    ("Tres de Bastos", "3bastos.png", "Expansión, viaje, negocio que crece, tus esfuerzos empiezan a dar fruto. Mira más lejos. Inv: Obstáculos en el camino."),
    ("Cuatro de Bastos", "4bastos.png", "Celebración, hogar feliz, matrimonio o fiesta, estabilidad lograda. Celebra con los tuyos. Inv: Conflictos familiares leves."),
    ("Cinco de Bastos", "5bastos.png", "Competencia, rivalidad, discusiones sin importancia, luchas de ego. No gastes energía en peleas tontas. Inv: Evitar el conflicto, paz."),
    ("Seis de Bastos", "6bastos.png", "Victoria, reconocimiento público, buenas noticias, orgullo merecido. Recibe el aplauso con humildad. Inv: Caída en desgracia, ego herido."),
    ("Siete de Bastos", "7bastos.png", "Defensa, perseverancia, mantener tu posición ante rivales. Sostén lo que es tuyo. Inv: Rendirse, sentirse abrumado."),
    ("Ocho de Bastos", "8bastos.png", "Rapidez, noticias, mensajes, viaje corto, todo se acelera. Prepárate, que viene rápido. Inv: Retrasos frustrantes."),
    ("Nueve de Bastos", "9bastos.png", "Resistencia, la última batalla, cansancio; no te rindas ahora. Falta poco. Inv: Agotamiento total."),
    ("Sota de Bastos (10)", "Sbastos.png", "Joven entusiasta, mensaje de trabajo, noticia rápida, espíritu aventurero. Di que sí a lo nuevo. Inv: Malas noticias, inmadurez."),
    ("Caballo de Bastos (11)", "Cbastos.png", "Viaje, mudanza, cambio de trabajo, hombre joven aventurero y apasionado. Muévete con cabeza. Inv: Imprudencia."),
    ("Rey de Bastos (12)", "Rbastos.png", "Hombre maduro emprendedor, líder honesto, trabajador, visionario. Lidera con el ejemplo. Inv: Tiranía, impulsividad."),
]


def cards(lst, a, b):
    return "".join(card(*c) for c in lst[a:b])


PAGES = {}

PAGES[2] = dict(size=9.96, html=
    h("TU PRIMERA LECTURA") +
    '<p class="h ind">1.&nbsp;&nbsp;&nbsp;Preparación:</p>' +
    p("Respira profundo tres veces para despejar tu mente.") +
    p("Baraja pensando en tu consulta. No hay reglas. Puedes hacer \"montoncitos\", estilo casino, etc. Lo importante es tu intención.") +
    p("Corta el mazo en dos o tres partes y vuelve a unirlo.") +
    '<p class="h ind">2.&nbsp;&nbsp;&nbsp;La Pregunta:</p>' +
    p("La baraja orienta, no sentencia.") +
    p("<b>Evita:</b> Preguntas de \"Sí/No\" (\"¿Me llamará?\")."))

PAGES[3] = dict(size=9.96, html=
    p("<b>Pregunta:</b> Empieza con \"Qué\" o \"Cómo\" (\"¿Qué actitud debo tomar hoy?\", \"¿Cómo mejoro esta situación?\").") +
    h("3. La Tirada") +
    p("<b>Tirada Clásica (3 cartas):</b> Ideal para ver la evolución de cualquier tema.") +
    p("Carta 1 (Izquierda): Pasado (Origen del problema).") +
    p("Carta 2 (Centro): Presente (La energía actual).") +
    p("Carta 3 (Derecha): Futuro (Dirección).") +
    p("Encuentras más tiradas en las páginas 24 a 26."))

PAGES[4] = dict(size=9.96, html=
    p("Si la carta sale invertida <b>(Inv)</b> puedes revisar su significado inverso en la guía.") +
    h("4. Interpretación") +
    p("Antes de leer los significados en este manual, mira la carta: el palo te dice el tema y el número, cuánta fuerza tiene. Tu intuición es el primer mensaje.") +
    h("5. LA BARAJA ESPAÑOLA (48 Cartas)") +
    p("No tiene arcanos mayores: todo el mensaje está en los cuatro palos. Cada palo tiene 12 cartas: del As al 9 y tres figuras (Sota 10, Caballo 11 y Rey 12)."))

PAGES[5] = dict(size=9.96, html=
    p("<b>Oros:</b> dinero, trabajo y lo material.") +
    p("<b>Copas:</b> amor, familia y emociones.") +
    p("<b>Espadas:</b> conflictos, mente y obstáculos.") +
    p("<b>Bastos:</b> acción, proyectos y viajes.") +
    p("<b>Las figuras</b> (Sota, Caballo y Rey) son personas o noticias: míralas en la página 22.") +
    p("<b>Tip de lectura:</b> Si tu baraja es de 40 cartas (sin 8 ni 9), lee igual: solo salta esas cartas. Fíjate qué palo se repite más en la tirada: ese es el tema que domina tu consulta."))

PAGES[6] = dict(size=8.52, html=h("SIGNIFICADOS: OROS (Dinero y Tierra)") + cards(OROS, 0, 3))
PAGES[7] = dict(size=9, html=cards(OROS, 3, 6))
PAGES[8] = dict(size=9, html=cards(OROS, 6, 9))
PAGES[9] = dict(size=9, html=cards(OROS, 9, 12))
PAGES[10] = dict(size=9, html=h("COPAS (Amor y Agua)") + cards(COPAS, 0, 3))
PAGES[11] = dict(size=9, html=cards(COPAS, 3, 6))
PAGES[12] = dict(size=9, html=cards(COPAS, 6, 9))
PAGES[13] = dict(size=9, html=cards(COPAS, 9, 12))
PAGES[14] = dict(size=9, html=h("ESPADAS (Mente y Aire)") + cards(ESPADAS, 0, 3))
PAGES[15] = dict(size=9, html=cards(ESPADAS, 3, 6))
PAGES[16] = dict(size=9, html=cards(ESPADAS, 6, 9))
PAGES[17] = dict(size=9, html=cards(ESPADAS, 9, 12))
PAGES[18] = dict(size=9, html=h("BASTOS (Acción y Fuego)") + cards(BASTOS, 0, 3))
PAGES[19] = dict(size=9, html=cards(BASTOS, 3, 6))
PAGES[20] = dict(size=9, html=cards(BASTOS, 6, 9))
PAGES[21] = dict(size=9, html=cards(BASTOS, 9, 12))

PAGES[22] = dict(size=9, html=
    h("LAS FIGURAS: ¿QUIÉN ES QUIÉN?") +
    p("<b>Sota (10):</b> persona joven de cualquier sexo, estudiante, hijo o hija; también un mensaje.") +
    p("<b>Caballo (11):</b> persona joven adulta en movimiento: llegada, viaje, cambio o pretendiente.") +
    p("<b>Rey (12):</b> persona madura con autoridad: padre, jefe, pareja, consejero.") +
    p("<b>El palo te dice cómo es:</b> Oros, práctica; Copas, cariñosa; Espadas, seria o conflictiva; Bastos, activa y viajera.") +
    p("<b>Tu carta:</b> elige la figura que más se parece a ti; las cartas que caen cerca de ella hablan de tus asuntos."))

PAGES[23] = dict(size=9, html=
    h("LOS NÚMEROS: CUÁNTA FUERZA") +
    p("El número marca la etapa del tema que indica el palo.") +
    p("<b>As:</b> inicio, semilla, oportunidad. <b>2:</b> unión, decisión, pareja. <b>3:</b> crecimiento, primer resultado. <b>4:</b> estabilidad, base firme. <b>5:</b> cambio, pérdida o conflicto. <b>6:</b> armonía, equilibrio, ayuda. <b>7:</b> reflexión, prueba, esfuerzo. <b>8:</b> movimiento, avance, trabajo. <b>9:</b> culminación, logro, cierre de etapa. <b>Figuras:</b> personas o noticias.") +
    p("<b>Truco rápido:</b> palo = tema (dinero, amor, problemas, acción) + número = etapa. Ejemplo: 5 de Copas = cambio o pérdida en el amor; 9 de Oros = logro en el dinero."))

PAGES[24] = dict(size=9, html=
    h("MÁS TIRADAS") +
    p("<b>Tirada Sí/No (3 cartas):</b> Baraja, corta y saca tres cartas. Cuenta los palos: mayoría de Oros o Copas = sí; mayoría de Espadas = no; mayoría de Bastos = sí, pero con esfuerzo o demora. Un As refuerza la respuesta; el 3 o el 9 de Espadas piden cuidado.") +
    p("<b>Tirada de la Cruz (5 cartas):</b>") +
    p("1 (centro): la situación actual.") +
    p("2 (izquierda): lo que se opone o te frena.") +
    p("3 (arriba): tu mejor opción, el consejo.") +
    p("4 (abajo): la raíz, lo que no ves.") +
    p("5 (derecha): el resultado probable."))

PAGES[25] = dict(size=9, html=
    p("<b>Tirada de los 4 Palos (4 cartas):</b> Para un panorama general del mes. Saca cuatro cartas en fila: 1 dinero y trabajo, 2 amor y familia, 3 obstáculos y salud, 4 proyectos y viajes. Lee cada carta en su tema, sin importar el palo que salga: si en \"amor\" cae un Oros, el dinero influye en tu relación.") +
    p("<b>Tirada de la Semana (7 cartas):</b> una carta por día, de lunes a domingo, puestas en fila. Anota lo que salió y revisa el domingo qué tan cerca estuvo: es la mejor práctica para aprender.") +
    p("<b>Consejo:</b> en cualquier tirada, la carta que más te llame la atención al voltearla es la clave del mensaje."))

PAGES[26] = dict(size=9, html=
    p("<b>Tirada del Amor (5 cartas):</b>") +
    p("1: tú en la relación. 2: la otra persona. 3: lo que los une. 4: lo que los separa. 5: a dónde va la relación.") +
    p("Si no hay pareja, la carta 2 muestra a quien viene en camino.") +
    p("<b>Tirada del Trabajo (3 cartas):</b> 1: mi situación laboral; 2: lo que debo cambiar; 3: resultado en tres meses. Aquí las Espadas son obstáculos y los Oros, resultados concretos.") +
    p("<b>Carta del día (1 carta):</b> cada mañana saca una carta y pregúntate \"¿qué energía me acompaña hoy?\". En una semana ya conocerás la baraja."))

PAGES[27] = dict(size=9, html=
    h("COMBINACIONES QUE HABLAN") +
    p("Cuando dos cartas salen juntas (lado a lado), se potencian:") +
    p("<b>As de Oros + Rey de Oros:</b> negocio exitoso, gran apoyo económico.") +
    p("<b>As de Copas + Sota de Copas:</b> noticia de amor, embarazo o nacimiento.") +
    p("<b>2 de Copas + 4 de Bastos:</b> compromiso, boda, unión estable.") +
    p("<b>3 de Espadas + Caballo de Espadas:</b> ruptura repentina, pelea fuerte.") +
    p("<b>9 de Espadas + 5 de Oros:</b> preocupación por dinero o salud.") +
    p("<b>8 de Bastos + Caballo de Bastos:</b> viaje inminente, mudanza."))

PAGES[28] = dict(size=9, html=
    p("<b>6 de Copas + Caballo de Copas:</b> regreso de un amor del pasado.") +
    p("<b>7 de Espadas + Sota de Espadas:</b> chisme, traición, alguien habla a tus espaldas.") +
    p("<b>As de Bastos + 3 de Bastos:</b> proyecto que despega y crece.") +
    p("<b>Rey de Espadas + 2 de Espadas:</b> trámite legal o decisión que depende de otro.") +
    p("<b>9 de Copas + 9 de Oros:</b> plenitud, deseo cumplido en amor y dinero.") +
    p("<b>Varias figuras juntas:</b> reunión, familia, gente opinando sobre tu tema.") +
    p("<b>Tres o más cartas del mismo palo:</b> ese tema domina tu vida ahora.") +
    p("<b>Varios Ases:</b> gran inicio, cambio de etapa."))

PAGES[29] = dict(size=9, html=
    h("¿CUÁNDO PASARÁ?") +
    p("Para estimar tiempos, mira el palo de la carta que responde:") +
    p("<b>Bastos:</b> días (todo es rápido). <b>Oros:</b> semanas. <b>Copas:</b> meses. <b>Espadas:</b> se demora o hay bloqueo.") +
    p("El número indica la cantidad: 3 de Bastos = unos tres días; 5 de Oros = unas cinco semanas.") +
    p("<b>Las estaciones:</b> Bastos primavera, Copas verano, Oros otoño, Espadas invierno.") +
    p("Toma los tiempos como orientación: la baraja marca tendencias, no fechas exactas."))

PAGES[30] = dict(size=9, html=
    h("CONSEJOS PARA LEER MEJOR") +
    p("Pregunta una sola vez. Repetir la tirada \"a ver si sale mejor\" confunde el mensaje.") +
    p("No leas con miedo ni con rabia: las cartas reflejan tu estado. Si estás alterado, espera.") +
    p("Lee primero el conjunto: ¿qué palo domina?, ¿hay figuras?, ¿hay Ases? Luego, carta por carta.") +
    p("Las cartas \"feas\" (3, 5 y 9 de Espadas) avisan, no condenan: muestran lo que puedes cambiar.") +
    p("Lleva un diario: anota fecha, pregunta, cartas y qué pasó después. Así aprendes tu propio lenguaje con la baraja."))

PAGES[31] = dict(size=9, html=
    h("CUIDA TU BARAJA") +
    p("Guárdala en una tela o bolsa propia, lejos de la humedad. No la prestes para jugar.") +
    p("<b>Limpieza:</b> pásala por humo de palo santo o incienso, o déjala una noche junto a un cuarzo. Hazlo al estrenarla y cuando sientas lecturas confusas.") +
    p("<b>Cierre:</b> al terminar, agradece, junta el mazo y guárdalo. Lo que leíste queda ahí; tu día sigue.") +
    p("<b>Recuerda:</b> la baraja orienta, tú decides. Cualquier duda, escríbenos (contacto en la contraportada)."))
