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
    ("0 El Loco (0. The Fool)", "p06_1.png", "Nuevos comienzos, fe ciega, espontaneidad. Tírate a la piscina. (Tip visual: el perrito advirtiendo). Inv: Imprudencia, riesgos tontos."),
    ("I El Mago (1. The Magician)", "p06_2.png", "Tienes el poder y las herramientas para manifestar lo que quieras. Acción. (Tip visual: el símbolo de infinito). Inv: Manipulación, trucos sucios."),
    ("II La Sacerdotisa (2. The High Priestess)", "p07_1.png", "Intuición, misterio, secretos. Escucha tu voz interior, no la lógica. (Tip visual: el pergamino oculto). Inv: Ignorar tus instintos, superficialidad."),
    ("III La Emperatriz (3. The Empress)", "p07_2.png", "Abundancia, fertilidad, belleza, creatividad. Disfruta de la naturaleza y el placer. (Tip visual: el trigo maduro). Inv: Bloqueo creativo, dependencia."),
    ("IV El Emperador (4. The Emperor)", "p07_3.png", "Estructura, autoridad, figura paterna, estabilidad. Pon orden y límites. (Tip visual: la armadura bajo la túnica). Inv: Tiranía, rigidez, falta de control."),
    ("V El Hierofante (5. The Hierophant)", "p08_2.png", "Tradición, enseñanza espiritual, conformismo, grupos. Sigue las reglas por ahora. <i>(Tip visual: las llaves cruzadas)</i>. Inv: Rebeldía, nuevas creencias."),
    ("VI Los Amantes (6. The Lovers)", "p08_3.png", "Amor, uniones profundas, decisiones importantes de valores. Elige con el corazón. <i>(Tip visual: el ángel guiando)</i>. Inv: Desarmonía, mala elección."),
    ("VII El Carro (7. The Chariot)", "p08_4.png", "Victoria, determinación, fuerza de voluntad. Avanza con control y enfoque. <i>(Tip visual: esfinges controladas)</i>. Inv: Falta de dirección, agresividad."),
    ("VIII Fuerza (8. Strength)", "p09_1.png", "Coraje, compasión, control suave. Domina a tu bestia interna con paciencia. (Tip visual: acariciando al león). Inv: Duda, debilidad, inseguridad."),
    ("IX El Ermitaño (9. The Hermit)", "p09_2.png", "Introspección, soledad necesaria, guía interior. Aléjate del ruido para ver la luz. (Tip visual: la lámpara encendida). Inv: Aislamiento excesivo, soledad triste."),
    ("X Rueda de la Fortuna (10. Wheel of Fortune)", "p09_3.png", "Cambios del destino, ciclos, buena suerte. Todo gira, aprovecha el momento. <i>(Tip visual: la rueda girando)</i>. Inv: Mala racha, resistencia al cambio."),
    ("XI Justicia (11. Justice)", "p10_1.png", "Verdad, causa y efecto, ley. Recibes lo que das. Sé honesto y objetivo. <i>(Tip visual: la balanza nivelada)</i>. Inv: Injusticia, deshonestidad."),
    ("XII El Colgado (12. The Hanged Man)", "p10_2.png", "Pausa, sacrificio, ver las cosas desde otra perspectiva. Suelta el control. <i>(Tip visual: halo luminoso)</i>. Inv: Estancamiento inútil, martirio."),
    ("XIII Muerte (13. Death)", "p10_3.png", "Transformación profunda, finales necesarios, renacimiento. Deja ir lo viejo. <i>(Tip visual: el sol amaneciendo al fondo)</i>. Inv: Resistencia al cambio, miedo."),
    ("XIV Templanza (14. Temperance)", "p11_1.png", "Equilibrio, paciencia, moderación, sanación. Mezcla tus opciones con calma. <i>(Tip visual: el agua fluyendo entre copas)</i>. Inv: Exceso, desequilibrio."),
    ("XV El Diablo (15. The Devil)", "p11_2.png", "Adicciones, materialismo, ataduras, sexualidad densa. Rompe tus cadenas mentales. (Tip visual: cadenas sueltas, puedes escapar). Inv: Liberación, romper vicios."),
    ("XVI La Torre (16. The Tower)", "p12_1.png", "Cambio repentino, caos, revelación chocante. Se rompen las falsas estructuras. (Tip visual: el rayo que limpia). Inv: Desastre evitado o retrasado."),
    ("XVII La Estrella (17. The Star)", "p12_2.png", "Esperanza, fe, inspiración, renovación. Después de la tormenta llega la calma. (Tip visual: la gran estrella brillante). Inv: Desánimo, falta de fe."),
    ("XVIII La Luna (18. The Moon)", "p12_3.png", "Ilusión, miedo, subconsciente, sueños. No todo es lo que parece, cuidado. (Tip visual: el cangrejo saliendo del agua). Inv: Se revelan secretos, claridad."),
    ("XIX El Sol (19. The Sun)", "p13_1.png", "Éxito, alegría, vitalidad, claridad total. Es la mejor carta. ¡Brilla! (Tip visual: el niño alegre). Inv: Tristeza temporal, duda."),
    ("XX El Juicio (20. Judgement)", "p13_2.png", "Renacer, llamado vocacional, despertar, perdón. Evalúa tu vida y eleva el nivel. (Tip visual: la trompeta sonando). Inv: Duda, no aprender la lección."),
    ("XXI El Mundo (21. The World)", "p13_3.png", "Realización, viaje, cierre de ciclo exitoso. Tienes el mundo a tus pies. (Tip visual: la corona de laureles). Inv: Falta de cierre, atajos."),
]

BASTOS = [
    ("As de Bastos (Ace of wands)", "p14_1.png", "Chispa creativa, nuevo comienzo apasionado, potencial puro. <i>(Tip visual: hojas brotando)</i>. Inv: Retrasos, falta de motivación."),
    ("Dos de Bastos (Two of wands)", "p15_1.png", "Planificación futura, decisiones, salir de la zona de confort. (Tip visual: mundo en la mano). Inv: Miedo a lo desconocido."),
    ("Tres de Bastos (Three of wands)", "p15_2.png", "Expansión, tus barcos llegan, visión a largo plazo. (Tip visual: barcos a lo lejos). Inv: Obstáculos en el comercio/viaje."),
    ("Cuatro de Bastos (Four of wands)", "p15_3.png", "Celebración, hogar feliz, armonía, matrimonio o fiesta. (Tip visual: guirnalda de flores). Inv: Conflictos familiares leves."),
    ("Cinco de Bastos (Five of wands)", "p16_2.png", "Competencia, conflictos de ego, luchas sin importancia. (Tip visual: bastos cruzados). Inv: Evitar el conflicto, paz."),
    ("Seis de Bastos (Six of wands)", "p16_3.png", "Victoria pública, reconocimiento, orgullo, éxito. (Tip visual: corona de laurel). Inv: Caída en desgracia, ego herido."),
    ("Siete de Bastos (Seven of wands)", "p16_4.png", "Defensa, perseverancia, mantener tu posición ante rivales. (Tip visual: posición elevada). Inv: Rendirse, sentirse abrumado."),
    ("Ocho de Bastos (Eight of wands)", "p17_1.png", "Velocidad, noticias rápidas, movimiento, flechazo. (Tip visual: bastos volando solos). Inv: Retrasos frustrantes, caos."),
    ("Nueve de Bastos (Nine of wands)", "p17_2.png", "Resiliencia, la última batalla, no te rindas aunque estés cansado. (Tip visual: hombre vendado). Inv: Agotamiento total."),
    ("Diez de Bastos (Ten of wands)", "p17_3.png", "Cargas pesadas, exceso de responsabilidad, estrés. (Tip visual: postura encorvada). Inv: Soltar la carga, colapso."),
    ("Sota de Bastos (Page of wands)", "p18_1.png", "Mensajero entusiasta, ideas nuevas, espíritu aventurero. (Tip visual: fascinación con el basto). Inv: Malas noticias, inmadurez."),
    ("Caballero de Bastos (Knight of wands)", "p18_2.png", "Acción impulsiva, aventura, pasión desbordada, viaje. (Tip visual: caballo encabritado). Inv: Imprudencia, agresividad."),
    ("Reina de Bastos (Queen of wands)", "p18_3.png", "Confianza, carisma, independencia, \"bruja\" poderosa. (Tip visual: gato negro). Inv: Celos, inseguridad."),
    ("Rey de Bastos (King of wands)", "p19_1.png", "Liderazgo visionario, emprendedor, honor y fuerza. <i>(Tip visual: salamandras)</i>. Inv: Tiranía, impulsividad."),
]

COPAS = [
    ("As de Copas (Ace of cups)", "p19_2.png", "Nuevo amor, desborde emocional, intuición, inicio espiritual. <i>(Tip visual: paloma de la paz)</i>. Inv: Bloqueo emocional, tristeza."),
    ("Dos de Copas (Two of cups)", "p19_3.png", "Unión, pareja, conexión profunda, atracción mutua. <i>(Tip visual: león rojo y caduceo)</i>. Inv: Ruptura, desconexión."),
    ("Tres de Copas (Three of cups)", "p20_1.png", "Amistad, celebración, comunidad, apoyo femenino. (Tip visual: mujeres brindando). Inv: Exceso, chismes, aislamiento."),
    ("Cuatro de Copas (Four of cups)", "p20_2.png", "Apatía, aburrimiento, ignorar oportunidades ofrecidas. (Tip visual: copa ofrecida desde la nube). Inv: Despertar, nueva motivación."),
    ("Cinco de Copas (Five of cups)", "p20_3.png", "Tristeza, pérdida, duelo, enfocarse en lo negativo. (Tip visual: copas derramadas). Inv: Aceptación, superar el dolor."),
    ("Seis de Copas (Six of cups)", "p21_1.png", "Nostalgia, recuerdos de la infancia, inocencia, reencuentros. (Tip visual: niños jugando). Inv: Vivir en el pasado."),
    ("Siete de Copas (Seven of cups)", "p21_2.png", "Ilusiones, muchas opciones, fantasía, confusión mental. (Tip visual: figuras en las nubes). Inv: Claridad, elección realista."),
    ("Ocho de Copas (Eight of cups)", "p21_3.png", "Dejar ir, buscar un significado mayor, abandonar lo que no sirve. (Tip visual: alejándose hacia la montaña). Inv: Miedo al cambio."),
    ("Nueve de Copas (Nine of cups)", "p22_1.png", "Deseos cumplidos, satisfacción personal, gratitud. (Tip visual: sonrisa de orgullo). Inv: Avaricia, insatisfacción."),
    ("Diez de Copas (Ten of cups)", "p22_2.png", "Armonía, familia feliz, plenitud emocional, felicidad duradera. (Tip visual: arcoíris en el cielo). Inv: Desarmonía, conflictos familiares, promesas rotas."),
    ("Sota de Copas (Page of cups)", "p22_3.png", "Mensaje intuitivo, soñador, inicio creativo o romántico. (Tip visual: pez saliendo de la copa). Inv: Bloqueo creativo."),
    ("Caballero de Copas (Knight of cups)", "p23_1.png", "Proposición romántica, idealismo, seguir al corazón. (Tip visual: avance tranquilo). Inv: Decepción, engaño."),
    ("Reina de Copas (Queen of cups)", "p23_2.png", "Compasión, intuición profunda, cuidado emocional, sanadora. (Tip visual: copa cerrada). Inv: Dependencia, manipulación."),
    ("Rey de Copas (King of cups)", "p23_3.png", "Equilibrio emocional, diplomacia, consejero sabio. (Tip visual: trono sobre agua revuelta). Inv: Frialdad, inestabilidad."),
]

ESPADAS = [
    ("As de Espadas (Ace of swords)", "p24_1.png", "Claridad mental absoluta, verdad, nueva idea brillante. (Tip visual: corona traspasada). Inv: Confusión, caos mental."),
    ("Dos de Espadas (Two of swords)", "p24_2.png", "Bloqueo, indecisión, negación de la verdad, ojos vendados. (Tip visual: luna creciente). Inv: Tomar una decisión forzada."),
    ("Tres de Espadas (Three of swords)", "p24_3.png", "Dolor, separación, corazón roto, tristeza necesaria. (Tip visual: lluvia y espadas). Inv: Sanación, perdón."),
    ("Cuatro de Espadas (Four of swords)", "p25_1.png", "Descanso obligado, recuperación, pausa mental, meditación. (Tip visual: postura de reposo). Inv: Regreso a la actividad."),
    ("Cinco de Espadas (Five of swords)", "p25_2.png", "Conflicto, victoria pírrica (ganar perdiendo), tensión. (Tip visual: sonrisa egoísta). Inv: Resolución, olvidar rencores."),
    ("Seis de Espadas (Six of swords)", "p25_3.png", "Transición, viaje hacia la calma, dejar atrás problemas. (Tip visual: aguas mansas al frente). Inv: Resistencia al cambio."),
    ("Siete de Espadas (Seven of swords)", "p26_1.png", "Estrategia, astucia, actuar con sigilo, posible engaño. (Tip visual: huida de puntillas). Inv: Confesión, revelación."),
    ("Ocho de Espadas (Eight of swords)", "p26_2.png", "Sentirse atrapado, victimismo, cárcel mental. (Tip visual: ataduras sueltas). Inv: Liberación, ver la salida."),
    ("Nueve de Espadas (Nine of swords)", "p26_3.png", "Ansiedad, insomnio, culpa, pesadillas, estrés mental. (Tip visual: despertando en la noche). Inv: Esperanza, buscar ayuda."),
    ("Diez de Espadas (Ten of swords)", "p27_1.png", "Final doloroso, traición, tocar fondo, fin de ciclo. (Tip visual: amanecer al fondo). Inv: Recuperación, renacer."),
    ("Sota de Espadas (Page of swords)", "p27_2.png", "Curiosidad, vigilancia, noticias, mente ágil, espía. (Tip visual: postura de alerta). Inv: Chismes, hablar de más."),
    ("Caballero de Espadas (Knight of swords)", "p27_3.png", "Acción rápida, ambición, directo al grano, intelecto. (Tip visual: árboles agitados). Inv: Impaciencia, agresividad."),
    ("Reina de Espadas (Queen of swords)", "p28_1.png", "Claridad, independencia, límites claros, objetividad. (Tip visual: mano levantada poniendo un alto). Inv: Amargura, frialdad."),
    ("Rey de Espadas (King of swords)", "p28_2.png", "Autoridad intelectual, verdad, justicia, lógica pura. (Tip visual: espada totalmente recta). Inv: Manipulación, crueldad."),
]

OROS = [
    ("As de Oros (Ace of pentacles)", "p28_3.png", "Oportunidad financiera, prosperidad, regalo, inicio sólido. (Tip visual: jardín exuberante). Inv: Oportunidad perdida."),
    ("Dos de Oros (Two of pentacles)", "p29_1.png", "Equilibrio, adaptación, malabarismo financiero/laboral. (Tip visual: símbolo de infinito). Inv: Desorganización."),
    ("Tres de Oros (Three of pentacles)", "p29_2.png", "Trabajo en equipo, colaboración, maestría, reconocimiento. (Tip visual: planos en el monasterio). Inv: Falta de cooperación."),
    ("Cuatro de Oros (Four of pentacles)", "p29_3.png", "Ahorro, seguridad, control, aferrarse a lo material. (Tip visual: abrazando la moneda). Inv: Avaricia o derroche."),
    ("Cinco de Oros (Five of pentacles)", "p29_4.png", "Dificultad económica, aislamiento, carencia, \"noche oscura\". <i>(Tip visual: ventana iluminada)</i>. Inv: Recuperación, ayuda."),
    ("Seis de Oros (Six of pentacles)", "p30_1.png", "Generosidad, dar y recibir, caridad, equilibrio justo. (Tip visual: la balanza). Inv: Deudas, egoísmo."),
    ("Siete de Oros (Seven of pentacles)", "p30_2.png", "Paciencia, evaluación, esperar la cosecha del trabajo. (Tip visual: observando el arbusto). Inv: Impaciencia, poco fruto."),
    ("Ocho de Oros (Eight of pentacles)", "p30_3.png", "Dedicación, aprendizaje, perfeccionismo, trabajo duro. (Tip visual: tallando monedas idénticas). Inv: Falta de ambición."),
    ("Nueve de Oros (Nine of pentacles)", "p30_4.png", "Lujo, independencia, autosuficiencia, éxito solitario. (Tip visual: halcón domado). Inv: Dependencia, gastos."),
    ("Diez de Oros (Ten of pentacles)", "p31_1.png", "Riqueza, legado familiar, seguridad a largo plazo, herencia. (Tip visual: tres generaciones y perros). Inv: Disputas familiares/dinero."),
    ("Sota de Oros (Page of pentacles)", "p31_2.png", "Oportunidad de estudio, inicio práctico, oferta laboral. <i>(Tip visual: concentración en la moneda)</i>. Inv: Pereza, falta de enfoque."),
    ("Caballero de Oros (Knight of pentacles)", "knight_pentacles.png", "Trabajo constante, responsabilidad, rutina productiva, avance lento pero seguro. <i>(Tip visual: caballo quieto, moneda en alto)</i>. Inv: Estancamiento, aburrimiento."),
    ("Reina de Oros (Queen of pentacles)", "p31_3.png", "Seguridad, practicidad, madre trabajadora, cuidado material. <i>(Tip visual: naturaleza floreciente)</i>. Inv: Descuido, dependencia."),
    ("Rey de Oros (King of pentacles)", "p31_4.png", "Abundancia máxima, éxito empresarial, seguridad, poder. <i>(Tip visual: túnica de racimos de uvas)</i>. Inv: Avaricia, corrupción."),
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
    p("El Tarot orienta, no sentencia.") +
    p("<b>Evita:</b> Preguntas de \"Sí/No\" (\"¿Me llamará?\")."))

PAGES[3] = dict(size=9.96, html=
    p("<b>Pregunta:</b> Empieza con \"Qué\" o \"Cómo\" (\"¿Qué actitud debo tomar hoy?\", \"¿Cómo mejoro esta situación?\").") +
    h("3. La Tirada") +
    p("<b>Tirada Clásica (3 cartas):</b> Ideal para ver la evolución de cualquier tema.") +
    p("Carta 1 (Izquierda): Pasado (Origen del problema).") +
    p("Carta 2 (Centro): Presente (La energía actual).") +
    p("Carta 3 (Derecha): Futuro (Dirección)."))

PAGES[4] = dict(size=9.96, html=
    p("Si la carta sale invertida <b>(Inv)</b> puedes revisar su significado inverso en la guía.") +
    h("4. Interpretación") +
    p("Antes de leer los significados en este manual, mira la imagen de la carta. Fíjate en los colores y qué te hace sentir. Tu intuición es el primer mensaje.") +
    h("5. LOS ARCANOS MAYORES (Primeras 22 Cartas)") +
    p("Representan los grandes hitos del destino y las lecciones espirituales profundas que tu alma debe aprender en esta vida."))

PAGES[5] = dict(size=9.96, html=
    p("Son la energía \"macro\" de la lectura, marcando eventos inevitables o cambios a largo plazo.") +
    p("<b>Tip de lectura:</b> Puedes barajar y consultar usando solo estas 22 cartas. Es el método más recomendado para principiantes cuando buscan respuestas sobre su propósito, lecciones de vida o situaciones que cambian el rumbo de su destino."))

PAGES[6] = dict(size=9, html=h("SIGNIFICADOS: ARCANOS MAYORES") + h("El Inicio del Viaje:") + cards(MAYORES, 0, 1) + h("Fase 1: El Mundo Físico (1 al 7)") + cards(MAYORES, 1, 2))
PAGES[7] = dict(size=9, html=cards(MAYORES, 2, 5))
PAGES[8] = dict(size=9, html=cards(MAYORES, 5, 8))
PAGES[9] = dict(size=8.52, html=h("Fase 2: El Mundo Interno (8 al 14)") + cards(MAYORES, 8, 11))
PAGES[10] = dict(size=9, html=cards(MAYORES, 11, 14))
PAGES[11] = dict(size=9.48, html=cards(MAYORES, 14, 15) + h("Fase 3: El Mundo Espiritual (15-21)") + cards(MAYORES, 15, 16))
PAGES[12] = dict(size=9, html=cards(MAYORES, 16, 19))
PAGES[13] = dict(size=9.48, html=cards(MAYORES, 19, 22))

PAGES[14] = dict(size=8.52, html=
    h("ARCANOS MENORES (56 Cartas)") +
    p("Las 56 cartas restantes se enfocan en los detalles del día a día, las personas que te rodean y las situaciones temporales que puedes cambiar con tus decisiones. Se les conoce como arcanos menores.") +
    h("BASTOS (Acción y Fuego)") + cards(BASTOS, 0, 2))
PAGES[15] = dict(size=9, html=cards(BASTOS, 2, 5))
PAGES[16] = dict(size=9, html=cards(BASTOS, 5, 8))
PAGES[17] = dict(size=9, html=cards(BASTOS, 8, 11))
PAGES[18] = dict(size=9, html=cards(BASTOS, 11, 14))
PAGES[19] = dict(size=9, html=h("COPAS (Emociones y Agua)") + cards(COPAS, 0, 3))
PAGES[20] = dict(size=9, html=cards(COPAS, 3, 6))
PAGES[21] = dict(size=9, html=cards(COPAS, 6, 9))
PAGES[22] = dict(size=9, html=cards(COPAS, 9, 12))
PAGES[23] = dict(size=9, html=cards(COPAS, 12, 14) + h("ESPADAS (Mente y Aire)") + cards(ESPADAS, 0, 1))
PAGES[24] = dict(size=9, html=cards(ESPADAS, 1, 4))
PAGES[25] = dict(size=9, html=cards(ESPADAS, 4, 7))
PAGES[26] = dict(size=9, html=cards(ESPADAS, 7, 10))
PAGES[27] = dict(size=9, html=cards(ESPADAS, 10, 13))
PAGES[28] = dict(size=9, html=cards(ESPADAS, 13, 14) + h("OROS (Lo Material y Tierra)") + cards(OROS, 0, 2))
PAGES[29] = dict(size=8.04, cls="c4", html=cards(OROS, 2, 6))
PAGES[30] = dict(size=8.04, cls="c4", html=cards(OROS, 6, 10))
PAGES[31] = dict(size=8.04, cls="c4", html=cards(OROS, 10, 14))
