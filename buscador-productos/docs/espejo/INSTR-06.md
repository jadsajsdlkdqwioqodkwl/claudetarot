# INSTR 06 — Comandos del buscador: BUSCA AÉREO, RANKEA, FILTRA, ALIBABA, DESCUBRE y MEJORA

Versión 4.3 · 2026-11-03 (v4.3, D-041: el script de carga es ahora Recetas E44 (calcado del extractor que sí pasa el filtro de Chrome; E43 queda de reserva); el prefiltro sale de la carga (lo hace el triage de RANKEA); un rechazo del filtro de Chrome se resuelve con read_page y nunca con una pregunta al dueño; si AF es mayor o igual que AG no hay días pendientes y se usa la ventana completa. v4.2, PURGA D-040: una carga = navegar + script CARGA de Recetas E43 (7 campos por producto en TSV, ya prefiltrado) + 2 escrituras; el chat lee solo las 10 primeras filas del plan, con los unix de la ventana listos; Config!B108 = 15. v4.1: login de PiPiAds con clic en «Iniciar sesión» y cuenta guardada; ventana angosta del plan no se paga; FILTRA aérea ligera D37 v3.6 con B105 = 80). v4.0 · 2026-11-02. Reescritura completa, SIN SUBAGENTES. La copia v3.35 está archivada en la carpeta de versiones (ID 1JnemgdN05s1BUUZdooAMgUo3AswKYtjmYv-L0WSKU1c) y conserva íntegro el detalle de BUSCA general W1/W2 (sus secciones 2.1 a 2.7), que sigue vigente para quien corra BUSCA sin AÉREO. Evidencia del cambio: decisión D-038 del repo; Sesiones 2026-10-15 a 2026-10-24: ninguna corrida con orquestador y subagentes llegó al cierre, y cada subagente gastaba unos 120 mil tokens solo en arrancar.

## 0. Cómo trabaja todo comando

1) Un comando por chat, y el chat hace el trabajo él mismo. No se usan subagentes (Agent o Task) en ningún comando: ni para cargar, ni para rankear, ni para validar. El chat trabaja en lotes chicos, escribe en la hoja al cerrar cada lote y sigue con el siguiente.
2) La memoria es la hoja. Todo el estado vive en Config, Log BUSCA, Plan carga, Crudo, Cola RANKEA y Productos. «sigue» retoma en el mismo chat; un chat nuevo con el mismo comando retoma desde la hoja. Nada depende de la memoria del chat.
3) Arranque mínimo: lee solo lo que dice la sección de tu comando. No abras INSTR 03 ni 04 (lo que hace falta de ellos ya está en Recetas D37 y D39), ni la pestaña Recetas entera, ni rangos amplios de Sesiones, Mejoras, Crudo o Productos (un rango de más de 60 mil caracteres revienta la herramienta).
4) Registro y punto de control: escribe tu sesión en Sesiones!A{Config!B101} con el ID de Config!B102 más el comando (update_values, nunca append) y en H «INICIO: …». Después de cada lote sobrescribe H con el estado acumulado (lotes, créditos, filas, productos, pendientes, NECESITA AL DUEÑO). Así el chat puede cortarse en cualquier momento sin perder nada.
5) Paradas válidas, las únicas: (a) el dueño dijo parar; (b) presupuesto agotado (PiPiAds Config!B91; Firecrawl B28, B76, B89); (c) la lista de trabajo quedó vacía; (d) el contexto está de verdad lleno (respuestas cortadas o aviso del sistema). NO son paradas: «no cabe», «pool bajo», «datos estimados», «es largo», un límite ya conocido de una herramienta, ni haber terminado un lote. Nunca preguntes «¿sigo o corto?» ni pidas confirmación: asume lo razonable, anótalo y sigue.
6) Lo que necesita al dueño nunca frena. LOGIN DE PIPIADS: si pipiads.com muestra «Iniciar sesión», haz clic en ese botón y acepta la cuenta guardada del navegador (nunca tipees usuario ni contraseña); si tras el clic sigue sin sesión, anótalo en NECESITA AL DUEÑO y sigue con lo que no usa PiPiAds. Captcha de Alibaba: no lo toques ni lo esquives. Chrome ausente u ocupado: intenta una pestaña propia; si no, sigue con lo que no usa Chrome.
7) Regla maestra «todo suma»: lo que se pagó o se encontró se guarda en Crudo con su carril y su motivo; solo se descarta lo que no sirve de ninguna forma (app, servicio, duplicado, marca sin producto genérico). Nunca borres, ordenes ni muevas filas. Nunca escribas columnas con fórmula (Productos AG:AH, AM:AR, AW, AX, AY, BC, BF, BG; Crudo P:Q; Sesiones I:N; Excluidos E; Log BUSCA S:AH; Laboratorio H) ni las pestañas Top, Oportunidades, Aéreo, Rankings, Guía y Revisión.
8) Dos versiones de cada comando: sin AÉREO trabaja lo general (Registro distinto de Ninguno; Cola con Carril distinto de A); con AÉREO solo lo aéreo (P = Ninguno; Carril = A). Listas calculadas en Config: ALIBABA B95/B96, FILTRA B97/B98 (con el ✅ de Revisión) y B104 (aéreo sin esperar el ✅, mientras B106 = Sí), RANKEA B99/B100.
9) Escritura: por lote, en una llamada por bloque contiguo; celdas sueltas donde haya fórmulas vecinas (en Productos nunca un rango que cruce AT:AU). Números como números; fechas y textos que empiecen con =, + o − llevan apóstrofo.
10) Cierre: línea final en Sesiones!H, la entrega de tu sección, «Recomendaciones y cuellos de botella» (máximo 5, con evidencia, también como filas de Mejoras) y «Siguiente paso: abre un chat nuevo y escribe <comando>».

## 1. BUSCA AÉREO (cargas en PiPiAds; es también la fase 1 de INICIA AEREO, INSTR 08)

Qué es: pagar créditos solo donde hay producto nuevo y guardarlo todo en Crudo. Chrome es obligatorio: como primera acción prueba Claude in Chrome; si no responde, anota «Sin Chrome» en Sesiones!H y pasa a lo que no lo necesita (dentro de INICIA AEREO: RANKEA, FILTRA, DESCUBRE).

Lee, y nada más: Config!B92:B93, B103, B108; de Recetas SOLO E44 (script CARGA MÍNIMA: se corre en cada carga; no leas E31 ni E43, no hacen falta); Plan carga Q1:AH12 (10 próximas cargas con los unix de la ventana en AF, AG y AH) y AJ1:AS6 (hallazgos de Exploración sin integrar). No leas D34 ni las filas 31 a 33 ni 40 de Recetas.

URL DE UNA CARGA (plantilla fija): https://www.pipiads.com/es/tiktok-shop-product?time=30&search_type=1&current_page=1&page_size=20&sort=3&sort_type=desc&region=<REGIÓN>&sales_volume_min=<B92>&video_count_min=<B93>&price_usd_min=<8 o piso de subbanda>&price_usd_max=<80 o techo>&categorize=<ID>&found_time_start=<unix desde>&found_time_end=<unix hasta>.

SECUENCIA DE UNA CARGA: (1) siguiente fila del plan; (2) navega a la URL; (3) corre el script CARGA MÍNIMA (E44): devuelve TOTAL, FILAS y una línea por producto (sin prefiltro: lo decide el triage de RANKEA); si el filtro de Chrome lo rechaza, lee la tabla con read_page o get_page_text y arma las 7 columnas tú (el id está en el link /tiktok-shop-product/<id>), sin preguntar nada; si AF es mayor o igual que AG la fila no tiene días pendientes y la carga va con AH..AG partida por subbanda de precio (8-12, 12-16, 16-20, 20-25, 25-30, 30-40, 40-55, 55-80), empezando por la que no figure en Log BUSCA!V; (4) fila del Log (L = TOTAL, M = FILAS); (5) filas en Crudo en una llamada; (6) cada 5 cargas, Sesiones!H. ERR: recarga y repite hasta 3 veces; KEYS: usa esas claves y anótalo en Mejoras. Tres llamadas por carga.

El plan lo da la hoja, no tu memoria. Orden de cargas:
 a) Hallazgos de Exploración con veredicto Confirmada o Parcial y columna K vacía: una carga por hallazgo con su receta (columna F de Exploración). Al usarlo escribe en Exploración K «Integrada AAAA-MM-DD <sesión>»; si no da filas nuevas en dos cargas, «Agotada».
 b) La lista «Próximas cargas» de Plan carga (columnas Q:AE), de arriba hacia abajo: combinaciones región · subcategoría con ventana pendiente de 7 días o más, o con restante sin leer, ordenadas por productos por 100 créditos. Regla de exploración: de cada 3 cargas, al menos 1 va a una combinación con 0 créditos gastados (nunca leída), para que el ranking aprenda.
 c) Nunca repitas una clave que ya esté en Log BUSCA!V. Nunca pagues una banda cuyo piso de ventas sea menor que Config!B92: solo el Juez baja B92.

Reglas de la carga: una subcategoría por carga; ventas B92, videos B93, precio 8-80, sort 3; ventana pendiente (AF..AG) si hay días pendientes, o completa (AH..AG) partida por subbanda de precio si hay restante sin leer. Paginar NO funciona (current_page=2 devuelve la página 1): si el total pasa de 20, parte la ventana en trozos de 14, 7 y 3 días, y solo después por precio (8-12, 12-16, 16-20, 20-25, 25-30, 30-40, 40-55, 55-80). Cada trozo es una carga y una fila del Log. Cada carga cuesta min(total, 20) créditos. VENTANA ANGOSTA (M-109): nunca pagues una ventana pendiente de menos de 14 días; con restante sin leer, la carga va sobre la ventana completa (desde hoy − B71) partida por subbanda de precio. Una ventana que da 0 no agota la combinación. La fecha que muestra la interfaz no siempre respeta la ventana: se escribe igual, Crudo!P decide.

Qué escribes por carga, en dos llamadas:
 • Log BUSCA!A{B103}:R{B103} (relee Config!B103 antes de cada carga y confirma que A está vacía; nunca una fila fija): A fecha, B sesión, C región, D nombre corto, E ID de categorize, F precio (8a80 o la subbanda), G ventas mínimas, H videos mínimos, I y J ventana, K código «A|tts|<nombre>-<banda>-d<desde>-<hasta>|<región>|ft..<hasta>», L total_count, M créditos, N «s/d», O cuántas cayeron en el prefiltro, P y Q quitados a mano (normalmente 0 y vacío), R una línea de aprendizaje.
 • Crudo, primera fila libre (lee Crudo!A:A; appendDimension de 500 si faltan filas), UNA llamada update_values sobre A{f}:U{f2} con TODAS las líneas del TSV (también prefiltro y repetidas): A sesión, B «A», C «PiPiAds TikTok Shop · <nombre> · <región> · <banda>», D código sin «A|», E id con apóstrofo, F link, G título tal cual, H tienda, I/J/K «s/d», L fecha con apóstrofo, M región, N vacío, O ventas, P y Q null, R «Pendiente», S vacío, T videos, U imagen.

Ritmo y control: cada 5 cargas lee el contador de créditos (D31 punto 1) y actualiza Sesiones!H (cargas, créditos = suma de Log M de la sesión, filas, NECESITA AL DUEÑO). Para cuando se cumpla una parada de la sección 0; cuando Plan carga no tenga ninguna fila con Siguiente = Sí (entonces corre EXPLORA, INSTR 07, o deja «pool cubierto» en H); o, dentro de INICIA AEREO, al llegar a Config!B108 cargas en este chat.

Entrega: cargas, créditos y filas en Crudo; las 3 mejores y las 3 peores combinaciones del Log; qué combinaciones quedan con Siguiente = Sí; hallazgos de Exploración integrados.

BUSCA general (carriles W1 y W2): mismas reglas de escritura y de parada; las combinaciones, el filtro de ganador (Config B60:B72) y las fuentes están en la copia v3.35, secciones 2.1 a 2.7, que siguen vigentes para ese comando.

## 2. RANKEA y RANKEA AÉREO (sin Chrome; Meta MCP es gratis)

Lee: Config!B16, B37, B99 o B100, B101:B102, B109; Recetas D41 (triage) y D39 (pre-chequeo, filtro aéreo, pilares y columnas de Productos: es tu instrucción completa, no abras INSTR 03); de la Cola RANKEA solo las columnas y filas que D41 y D39 te piden, y solo tu carril.

Paso 1, triage (D41): por rangos de unas 100 filas de Crudo, lee Crudo R:S del rango, decide cada Pendiente de tu carril: Preseleccionado (S = tipo genérico; el mismo texto para las filas del mismo producto) o Descartado (S = motivo), y escribe el rango R:S en una sola llamada. Repite hasta que no queden Pendiente.

Paso 2, puntaje (D39): toma los grupos Preseleccionado de a Config!B109 por lote (hoy 5), de mayor ventas en 30 días a menor. Antes de buscar nada, marca «ya en Productos» los tipos que ya existan en Productos!D:D. Por grupo: pre-chequeo en Meta PE (máximo 2 frases, limit 8 y 5), filtro aéreo, puntaje y escritura inmediata de su fila en Productos (ID = el siguiente AAMMDD-A-NNN del día; fila = la última con dato en A más 1; el precio M y el peso O son estimaciones por diseño: se escriben igual) y de Crudo R:S de sus filas. Sobreexplotado: fila en Excluidos A:D. Al cerrar cada lote, Sesiones!H.

Origen Descubrimiento: si la pestaña Descubrimiento tiene filas con Estado «Candidato», son grupos más (D39 v6): se puntúan igual y se marcan M:N de esa pestaña.

Parada: Config!B100 (o B99) en 0 y sin Candidatos, o una parada de la sección 0. Entrega: filas triadas por motivo, grupos Sobreexplotado con sus anunciantes, productos nuevos con puntaje y estrellas, top 10, y «Tu reporte está en Top y en Aéreo por lotes».

## 3. FILTRA y FILTRA AÉREO (validación en Meta Perú)

Lee: Config!B16, B28, B39, B44, B76, B86, B101:B102; la lista: B97 o B98 (con ✅) o, en AÉREO con B106 = Sí, B104 hasta B105 productos (hoy 80), mayor puntaje primero; Recetas D37 (v3.6, validación ligera aérea de máximo 6 búsquedas por producto: tu instrucción completa, no abras INSTR 04); de cada producto Productos!D, G, K, L, P y AD:AL; de Chequeo Meta las filas con B = el ID del producto (no repitas rondas).

Orden: primero los productos aéreos con AD, AE o AF vacíos o con «inactivos sin confirmar» en AL (reparación), después la lista.

Por producto, uno a la vez (D37): Fase A (3 frases, activos, limit 25); corte Sobreexplotado si llega a B16 (AD, AF, AJ, AK, AL con la palabra «corte», Y = 0 y fila en Excluidos); Fase B rondas 1 a 3; inactivos con Meta MCP en modo INACTIVE (AE); AS, AV («Sí» siempre en el carril aéreo) y AI (LATAM); escribe su fila (celdas sueltas; AD, AE y AF siempre como enteros, el 0 cuenta) y una fila por ronda en Chequeo Meta (mismas columnas que las filas anteriores). Firecrawl solo para leer un anuncio dudoso cuya URL ya tienes; nunca para la Biblioteca de Anuncios (devuelve vacío o datos genéricos). Virgen exige 0 activos y 0 inactivos del producto, rondas 1 a 3 y LATAM sin señal; ante la duda, Entrando.

Cada 3 productos, Sesiones!H. Parada: lista vacía, Config!B28 o sección 0. Entrega: ranking de los validados (estado, anunciantes AY, competidores por problema AS, LATAM), Testear o No testear con el motivo, créditos de Firecrawl, cuántos quedan; «Tu reporte está en la pestaña Top»; si hay Top sin foto o sin proveedor: «Escribe ALIBABA AÉREO».

## 4. ALIBABA y ALIBABA AÉREO (foto, proveedor, peso y tamaño; Chrome)

Lee: Config!B89, B95 o B96, B101:B102 y B110 (tope solo dentro de INICIA AEREO); Recetas D36 (tu instrucción completa, paso a paso), E30 (scripts A a I) y fila 26 (Firecrawl de respaldo); de cada fila Productos!D, K, L, O, AZ:BB, BD:BE y BF:BG. Entra la fila cuyo BE no tiene ✓ALIBABA o cuya O no tiene peso y tamaño. Nunca abras PiPiAds.

Por producto, uno a la vez, una sola pestaña, 13 segundos entre páginas de proveedor, máximo 3 proveedores: foto donde se vea el producto (BD), búsqueda por foto en Alibaba (script G), hasta 3 proveedores idénticos, lectura con el script F, y escritura en dos llamadas: Productos!AZ{f}:BE{f} (BC como null) y O{f}. BA = promedio del punto medio de los tramos, por unidad de venta; BE termina siempre en «· ✓ALIBABA AAAA-MM-DD». Captcha: no lo toques; cambia de proveedor, a Google Imágenes limitado a alibaba.com/product-detail o a Firecrawl (fila 26). El detalle completo está en D36.

Cada 3 productos, Sesiones!H. Parada: lista vacía o sección 0. Entrega: tabla producto, foto, BA, proveedores, O y nota; créditos; cuántos faltan; «Tu reporte está en Top y Oportunidades».

## 5. DESCUBRE (Amazon Best Sellers con Firecrawl; sin Chrome)

Lee: Config!B107, B101:B102; Recetas D42 (tu instrucción completa); Nodos Amazon A1:J500; de Descubrimiento solo la columna E (ASIN) para deduplicar. Hasta 4 nodos por chat y B107 créditos: lee la página 1 de cada nodo (y la 2 si hubo 5 o más candidatos), agrega los subnodos nuevos al árbol, escribe Candidatos y Descartados en Descubrimiento A:N en una llamada por nodo y actualiza la fila del nodo (última visita, candidatos, estado). Los Candidatos los puntúa RANKEA (sección 2, origen Descubrimiento). Entrega: una línea por nodo y créditos.

## 6. MEJORA (aplicar las propuestas de la pestaña Mejoras)

Lee Mejoras A:N solo en las filas con K = Propuesta o Aprobada, Config A1:C110 si alguna toca Config, y los documentos que nombran. No gasta créditos. Por fila, en orden de ID: ¿sigue haciendo falta? (K = Ya cubierta si otro documento ya lo dice); ¿contradice otra regla? (corrígela en el mismo cambio); antes de tocar un INSTR, cópialo a la carpeta de versiones (ID 1HtyOttQaEvvfh07Jm-DF9altfXcuWZNM) como «<título> (v<versión>)» y edita el vigente en su lugar con el conector de Google Docs, subiendo la versión y la fecha de la primera línea; en Recetas corrige la celda y anota «(AAAA-MM-DD: qué cambió)»; en Config cambia B y anota en C la fecha y el valor anterior; si choca con una regla del dueño, deja K = Propuesta y explica el choque en N. Marca K = Aplicada, L fecha, M documento y versión. Quien cambie la versión de un INSTR actualiza la tabla del MAPA en el mismo cambio.

Cómo se registra una propuesta (cualquier comando, en su cierre): A siguiente M-###, B fecha, C sesión, D comando, E problema con el dato, F cambio exacto, G dónde, H evidencia, I = 1, J riesgo, K = Propuesta; si ya existe en Propuesta, suma 1 en I.

## 7. EXPLORA

INSTR 07. Sus resultados se anotan en Exploración y entran solos al plan de cargas por la columna K (sección 1).
