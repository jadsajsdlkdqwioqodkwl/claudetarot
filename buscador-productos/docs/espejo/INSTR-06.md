# **INSTR 06 — BUSCA, RANKEA, FILTRA y ALIBABA**

Versión 3.34 · 2026-10-16 (v3.34: la ventana de found_time avanza (hoy − B71 a hoy − B72) en vez de estar fija; v3.33: el flujo de BUSCA AÉREO de punta a punta lo manda INSTR 08; esta sección 2.8 sigue mandando en cómo se hace cada carga y «BUSCA AÉREO SOLO» hace solo las cargas; v3.32: bandas de ventas con sales_volume_max y paginación con current_page, confirmadas por EXPLORA el 2026-10-14; RANKEA en tandas por defecto con Recetas\!D39; M-067, M-068; v3.31: piso 1000/10 y escalera hasta 500/5 y 250/3 con medición, cargas ordenadas por rendimiento (Recetas fila 38), 25 créditos por fila nueva; M-062, M-063; v3.30: fila libre del Log BUSCA en Config\!B103, M-061; v3.29: FILTRA en modo tandas con subagentes; retomar parciales sin repetir rondas; scripts de ALIBABA en Recetas\!E30; reglas de O y de la foto U. Mejoras M-017, M-028, M-051, M-052, M-055, M-056)

Cambios respecto de v3.16 (para auditoría): regla maestra "todo suma" (lo que se paga se guarda; solo se descarta lo que no sirve de ninguna forma); BUSCA AÉREO en todas las fuentes y categorías; Asia incluida con triangulación del veredicto; RANKEA sin tope de grupos por chat; créditos de Claude sin tope en ningún comando.

## **0. Regla maestra: todo suma**

Lo que PiPiAds devuelve ya se pagó con créditos. Por eso:

  - Todo resultado nuevo (sin duplicado) se escribe en Crudo, aunque no pase el filtro de ganador, esté fuera de foco, tenga registro sanitario o sea de otra categoría. La columna P (Pasa filtro ganador) es una fórmula: marca lo que pasa; no la escribas.
  - Lo que no pasa el filtro se escribe con su motivo visible en Crudo (en el campo G o en la fila de Log, según corresponda) y queda en Crudo como reserva: la Cola RANKEA solo trae lo que pasa el filtro (P = Sí).
  - El descarte solo aplica a lo que no sirve de ninguna forma: apps, juegos, servicios, cursos, clínicas, duplicados y marcas sin producto genérico.
  - Lo que tiene registro sanitario va a BUSCA normal, nunca a la pestaña Aéreo.
  - Créditos de Claude: sin tope en ningún comando. El único tope es el de PiPiAds (Config B66 y B91, y el de EXPLORA en INSTR 07).

## **1. Comandos**

|  |  |  |
| :-: | :-: | :-: |
| \*\*Comando\*\* | \*\*Qué hace\*\* | \*\*Gasta\*\* |
| BUSCA | Saca de PiPiAds productos y los guarda en Crudo (todo suma, sección 0). No analiza. | Créditos de PiPiAds (máximo Config B66) |
| BUSCA AÉREO | Como BUSCA, pero con foco en productos sin registro sanitario y aptos para importación aérea, desde todas las fuentes y categorías, una subcategoría por carga y con memoria en la pestaña Log BUSCA (sección 2.8). Lo que tenga registro se guarda en BUSCA normal. | Créditos de PiPiAds (máximo Config B91) |
| RANKEA | Triage de toda la cola, pre-chequeo gratis de anunciantes en Meta Perú y puntaje con los pilares (WINNER, RENTABLE, LOSER). Escribe en Productos con estrellas y link. | Nada (Meta MCP es gratis) |
| FILTRA | Barrido gratis con Meta MCP de todos los productos que el usuario aprobó en la pestaña Revisión y siguen pendientes (se refleja en Productos\\\!AW) y validación a fondo solo de los que siguen sin saturar. | Firecrawl solo para leer textos dudosos e inactivos (máximo Config B76 búsquedas por producto) |
| ALIBABA | Para cada producto de Top (y luego de Oportunidades): saca una foto donde se vea el producto, busca la foto en Alibaba (como la extensión del usuario), elige hasta 3 proveedores idénticos y llena precio proveedor promedio, peso y tamaño. No abre PiPiAds. | Chrome (gratis); Firecrawl solo de respaldo (máximo Config B89 créditos por producto) |

Cada comando va en un chat nuevo, salvo MEJORA al cierre de una sesión (INSTR 00, sección 7). EXPLORA tiene sus reglas en INSTR 07. Todo el avance queda en la hoja, así que cada uno retoma donde quedó la vez anterior.

**Regla de saturación (del usuario):** un producto está Sobreexplotado solo cuando en Meta Perú hay Config B16 o más anunciantes distintos (hoy 10) que venden el producto, un equivalente o el producto base. Una marca extranjera con varias páginas cuenta como 1. Mercado Libre no cuenta: es solo informativo y no cambia el estado, ni P7B, ni P8, ni el veredicto (esto manda sobre INSTR 03).

**Reportes:** las pestañas Top (productos para testear, casi vírgenes en Perú) y Oportunidades (WINNER y RENTABLE que no están en Top: sin validar en Meta, o con competencia pero con demanda) se arman solas con fórmulas y se actualizan con cualquier comando. Nunca las escribas. Lo que las completa es lo que escribes en Productos: la foto (BD), el proveedor (AZ, BA, BB y BE) y el peso y tamaño (O), que llena ALIBABA (sección 5).

**Tokens:** sin tope (regla de INSTR 00, sección 2). Resume lo que devuelven las herramientas en el chat. No abras ventanas de Chrome que no hagan falta. Entrega en tablas cortas.

-----

## **2. BUSCA**

### **2.1 Qué es un ganador (Config, filas 60 a 66 y 70 a 72; lee Config\!A60:C72)**

Buscamos ganadores: productos que venden de forma sostenida. Este criterio define la columna P (Pasa filtro ganador), no decide qué se guarda: todo lo que devuelve la búsqueda se escribe (sección 0).

  - **Anuncio**: cumple todo esto:
      
      - impresiones ≥ B61 y likes ≥ B62;
      - días activo ≥ B63 (gasto sostenido, no una prueba);
      - sigue activo: última vez visto (last\_put\_time) hace B70 días o menos;
      - primer visto hace B71 días o menos (probado, pero no viejo).
  - **Producto de TikTok Shop**: cumple todo esto:
      
      - ventas de los últimos 30 días ≥ B64;
      - videos del producto ≥ B65 (muchos creadores = está escalando);
      - PiPiAds lo vio por primera vez (found\_time) hace B72 días o más y B71 o menos: vende hace más de un mes, no es un pico.

Si falta found\_time (columna L) en un producto de TikTok Shop, se escribe igual con L = s/d. No se descarta: RANKEA lo marca como no verificable en la fecha y lo puntúa con lo que tenga. Un producto que no pasa el filtro se guarda con su motivo; no se tira.

### **2.2 Recetas (bloqueante)**

Usa las filas 4, 7, 9, 10, 11, 14, 23 (deduplicar y escribir en lote) y 27 (foto) de Recetas. Lee también Config\!B84:B85 y la fila 31 de Recetas (contador). En BUSCA AÉREO, además, las filas 31 y 34 y la pestaña Log BUSCA (sección 2.8). Filtros del servidor ya verificados: en anuncios play\_count\_min y digg\_count\_min (fila 11); en TikTok Shop sales\_volume\_min, video\_count\_min, found\_time\_start y found\_time\_end (fila 14). Los días activo y la última vez activo se filtran en el código. Si falta algo o falla, captúralo primero (INSTR 05, sección 2).

Cada resultado cuesta 1 crédito, así que todo lo que se pueda filtrar en el servidor se filtra ahí. Lo que no filtra el servidor (días activo, última vez activo) se marca en el código, no se descarta.

### **2.3 Cómo buscar rápido**

1.  **Créditos medidos, no estimados** (fila 31 de Recetas): lee el contador de créditos de PiPiAds al empezar y cada 5 cargas, y anota en Sesiones el gasto real (contador inicial − final; el contador va con una carga de retraso). No hay sondeo de 1 crédito: la interfaz ignora page\_size (verificado el 2026-10-12). Cada carga cuesta lo que trae, min(total, 20), y devuelve el total (fila 34). Un total de 0 no es falta de créditos: lee por separado el contador y el total; si el total es 0, cambia de subcategoría (fila 31 F) y lee otra antes de pedir recarga. Por eso una consulta estrecha (una subcategoría, filtros altos) es su propio sondeo barato: si trae 7, cuesta 7.
2.  **Ordena por la métrica del filtro**, de mayor a menor: anuncios por impresiones (sort 4) o likes (sort 9); TikTok Shop por ventas (sort 3).
3.  **Corte temprano**: si el último resultado de una página ya está bajo el mínimo de esa métrica, no pidas la página siguiente.
4.  **Sin duplicados, tampoco con sesiones anteriores**: antes de buscar, lee Crudo\!E:E y carga esos IDs en la memoria de la página (window.\_\_vistos). Todo ID que ya esté ahí se salta: no se escribe ni cuenta. Dentro de la sesión, guarda en window.\_\_crudo con clave anunciante + primeros 60 caracteres del texto; si la clave se repite, suma 1 a "copias" y quédate con el de más impresiones. Al chat devuelve solo un resumen por combinación.
5.  **Prefiltro Perú y fuera de foco, en la página** (gratis). Cada resultado se escribe en Crudo con su marca, no se descarta:
      
      - window.\_\_peru: lo que ya está saturado en Perú. Arma la lista con las filas vigentes de Excluidos (columna E = "Sí") y con los productos Sobreexplotado o Quemado de Productos, cada uno en español, inglés y portugués (colágeno → collagen|colageno|colágeno). Súmale lo que ya se anuncia mucho en Perú según PiPiAds: 1 combinación de anuncios sin palabra clave con región Perú (si el selector la tiene), primer visto 90 días, orden por impresiones, 5 páginas; los tipos de producto con Config B16 o más anunciantes distintos ahí van a la lista. Lo que coincida se escribe marcado como ya saturado en Perú; RANKEA no lo puntúa.
      - window.\_\_fuera: decoración, Halloween, Navidad, fiestas, organizadores, ropa, joyas, fundas de celular, perfumes y body splash, maquillaje de marca. Lo que coincida se escribe marcado como fuera de foco; RANKEA lo decide (sección 3.1).
6.  Hasta 5 combinaciones en paralelo y 1,5 segundos entre páginas.
7.  Vuelca a Crudo en tandas de 150 filas desde una pestaña nueva (\<pre\> y get\_page\_text, recetas de las filas 7 y 11), siempre al final de la hoja. Para que pese menos: texto (G) de 60 caracteres y combinación (D) en código corto, por ejemplo W1|berberine|imp|US|180d. N y U son obligatorias y no cuestan créditos: salen de la misma respuesta. Antes de volcar la primera tanda, mira las claves del primer resultado (Object.keys) y elige el campo de la tienda o landing (va a N) y el de la imagen (va a U: la foto del producto en TikTok Shop, la portada en anuncios). Anota los nombres de los campos en la fila 27 de Recetas. Si un resultado no los trae, deja la celda vacía, nunca "s/d". Productos BF y BG las copian solas por fórmula: sin N y U, ALIBABA no tiene cómo encontrar la foto del producto sin gastar créditos.
8.  No abras el detalle de cada anuncio: gasta créditos.

### **2.4 Qué combinaciones**

|  |  |  |
| :-: | :-: | :-: |
| \*\*Carril\*\* | \*\*Fuente\*\* | \*\*Cómo\*\* |
| W2 | TikTok Shop | Categorías de la fila 10 de Recetas: salud, belleza y cuidado personal, mascotas, bebés, comida y bebidas. \*\*Hogar no\*\* (trae decoración y organizadores; los problemas del hogar van por W1). \*\*Solo time=30\*\*. Orden por ventas. Regiones: \*\*todas las que tenga el selector de TikTok Shop en PiPiAds, incluida Asia\*\*, empezando por US, MX, BR, ES y GB. \*\*Ventana incremental\*\* (abajo). |
| W1 | Anuncios con palabra clave | \*\*Solo si Config B85 es mayor que 0 (hoy 0: apagado)\*\*, y entonces ese % de los créditos. Costó \\\~9 créditos por fila útil, contra \\\~1,5 en TikTok Shop. Términos de: 'Sub-nichos'\\\!B:B sin usar y el plan de INSTR 01 (Fase 2). Primer visto en los últimos \*\*180 días\*\* (con 90 casi todo da 0), orden por impresiones, regiones US, MX, CO, ES y BR. |
| — | Anuncios sin palabra clave | Solo región US, máximo 4 combinaciones por BUSCA, 1 página cada una (no pagina). En CO, ES y MX trae cursos de inglés, ropa y música. |
| W2 | Winning Products | Último recurso: 5 páginas desde la última usada (anotada en Sesiones). Rinde poco: anuncios viejos de regalos y moda. |

**Asia incluida, con triangulación.** Los títulos de Asia pueden venir en otro idioma y el found\_time puede no ser confiable. Eso no es motivo para no buscar. Cuando el found\_time de una región asiática parezca falso (por ejemplo, fechas que no cuadran con el primer video o la ficha del producto):

  - se escribe igual en Crudo, con L = s/d si no se puede confirmar;
  - el veredicto se triangula con otras señales: ventas, videos, anuncios en Meta Perú y Biblioteca de Meta, y fecha del video más antiguo;
  - se anota en Log BUSCA (columna R) y en Mejoras si la región resulta sistemáticamente poco confiable.

**Ventana incremental en TikTok Shop** (para no pagar dos veces por los mismos productos): ordenar por ventas devuelve casi los mismos productos en cada BUSCA, y cada uno cuesta 1 crédito aunque ya esté en Crudo. Por eso:

  - found\_time\_end = hoy − B72 días;
  - found\_time\_start = la fecha más reciente de esa categoría y región en Config B84 (se calcula solo desde Crudo D); si no aparece ahí, la fecha de la última BUSCA que la usó − B72 (las 13 de 2026-10-05-f: 2026-09-05); si nunca se usó, hoy − B71 días;
  - si la ventana resultante tiene menos de 7 días, esa categoría y región está agotada por ahora;
  - escribe en Crudo D cada combinación con su fin de ventana, por ejemplo W2|tts|salud|US|ft..2026-09-07.

**Busca y busca: nunca cierres por combinaciones agotadas.** Si una categoría y región está agotada (ventana corta, o más de la mitad de la primera página ya está en window.\_\_vistos), pasa a la siguiente en este orden: otra región de la misma categoría → otra categoría → W1 con términos nuevos → anuncios sin palabra clave → Winning Products. Sigue hasta que se cumpla la parada (2.5).

Reglas:

  - Al menos la mitad de los créditos en salud, suplementos, cuidado personal, mascotas y bebés.
  - No gastes créditos dos veces en lo mismo: la misma categoría en otra ventana de tiempo, o la misma búsqueda en una región que repite los mismos productos (si más de la mitad de la primera página ya está en window.\_\_vistos, corta esa combinación).
  - No repitas combinaciones de las 2 últimas BUSCA. Anótalas en Sesiones (Notas) en forma corta.
  - Prohibidas las palabras sueltas genéricas ("sleep", "pet", "beauty", "health", "gadget", "kids", "women").
  - Firecrawl en BUSCA: no se usa (no hay receta vigente de iHerb en Recetas). Amazon no carga: no lo uses.
  - La Biblioteca de Meta no sirve como fuente de BUSCA (fila 25 de Recetas: con frases de venta trae anuncios de horas y títulos genéricos). Se usa solo para validar.

### **2.5 Parada**

Para con lo primero que pase:

  - llegaste a B59 filas nuevas (escritas en Crudo, sin duplicado) (y, si B85 \> 0, W1 ya usó ese %);
  - el contador dice que gastaste el presupuesto (B66; en BUSCA AÉREO, B91);
  - rendimiento bajo: si en una combinación menos de la mitad de una página trae productos nuevos, no pidas la página siguiente de esa combinación;
  - el chat se está llenando: escribe lo que tengas en Crudo, registra Sesiones y di "Escribe BUSCA en un chat nuevo para seguir";
  - no quedan combinaciones nuevas en ningún carril, categoría ni región (en BUSCA AÉREO esto no cierra: sigue la escalera de ampliación de 2.8).

Si 3 combinaciones seguidas de un carril no traen filas nuevas, cambia de carril o de categoría.

### **2.6 Columnas de Crudo**

|  |  |  |
| :-: | :-: | :-: |
| \*\*Col\*\* | \*\*Campo\*\* | \*\*Quién\*\* |
| A | Sesión | BUSCA |
| B | Carril (W1, W2 o A, aéreo) | BUSCA |
| C | Fuente y sección | BUSCA |
| D | Combinación (término o categoría, orden, región, fechas) | BUSCA |
| E | ID del anuncio o producto (con apóstrofo delante) | BUSCA |
| F | Link directo (INSTR 05, sección 0) | BUSCA |
| G | Texto del anuncio o título, primeros 60 caracteres | BUSCA |
| H | Anunciante o tienda | BUSCA |
| I | Impresiones (número) | BUSCA |
| J | Likes (número) | BUSCA |
| K | Días activo (número) | BUSCA |
| L | Primer visto (AAAA-MM-DD, con apóstrofo): found\\\_time; s/d si no hay | BUSCA |
| M | Regiones | BUSCA |
| N | Landing o tienda (URL) | BUSCA |
| O | Ventas de los últimos 30 días (solo TikTok Shop) | BUSCA |
| P | Pasa filtro ganador | Fórmula |
| Q | Duplicado (mismo anunciante y texto que una fila anterior) | Fórmula |
| R | Estado: Pendiente, Preseleccionado, Producto, Descartado | BUSCA escribe Pendiente; RANKEA lo cambia |
| S | Tipo genérico (preseleccionado), ID en Productos o motivo del descarte | RANKEA |
| T | Copias del anuncio encontradas, o videos del producto en TikTok Shop (video\\\_count) | BUSCA |
| U | Foto: URL de la imagen del producto o de la portada del anuncio (receta de la fila 27). En BUSCA AÉREO escribe U = pageData.data\\\[\\\].image (im.pipiads.com) de cada producto; si viene vacío, escribe s/d y avísalo en la entrega | BUSCA |

Nunca escribas en P ni en Q. Crudo está casi al límite de filas: antes de volcar, agrega filas con appendDimension si hace falta.

### **2.7 Entrega de BUSCA**

Combinaciones hechas (con su ventana), páginas leídas, resultados vistos, créditos gastados (y % en W1), filas nuevas en Crudo (por fuente y carril), IDs saltados por estar ya en Crudo, filas marcadas como ya en Perú y como fuera de foco, resultados que no pasan el filtro de ganador (por cada condición de 2.1), y porcentaje en salud, suplementos y cuidado personal. En BUSCA AÉREO, además: cuántas filas quedaron como regulado, radio o no apto aéreo, y lo que pide 2.8 (Entrega).

### **2.8 BUSCA AÉREO (importación aérea, sin registro para el carril aéreo)**

Es el flujo que pidió el mentor: productos que se pueden traer por aéreo sin registro sanitario ni permiso y que venden mucho. Usa las reglas de BUSCA (2.1 a 2.7) con estos cambios.

**Fuente y lectura**

  - **Todas las fuentes y categorías**: TikTok Shop como principal (URL + pageData, Recetas fila 34), y anuncios de US sin palabra clave y Winning Products como complemento. La palabra clave (W1) sigue apagada mientras Config B85 sea 0. No aplica la regla de gastar la mitad de los créditos en salud.
  - La ventana incremental de 2.4 y Config B84 no se usan aquí: manda la pestaña **Log BUSCA**, que es la memoria del carril.
  - Lo que tenga registro sanitario se escribe en Crudo como fila de BUSCA normal (carril W2 o A según corresponda) y no entra al carril aéreo.

**Lee al empezar** (gratis)

  - Config\!B91:B94.
  - Recetas filas 31 y 34.
  - 'Log BUSCA'\!Z1:AH80: el resumen por combinación (región · nombre · precio), ordenado de mejor a peor por créditos por fila nueva. Trae las cargas, los créditos, las filas nuevas, cuántas llegaron a Productos y las ventanas ya leídas con su total y sus créditos. AG = filas de esa combinación que RANKEA todavía no revisó; AH = créditos por producto que llegó a Productos (solo vale con AG = 0). Cada ventana dice con qué ventas mínimas se leyó (v1000, v2000): lo leído con ventas menores ya incluye lo de ventas mayores, no lo vuelvas a pagar.
  - 'Log BUSCA'\!X2: los IDs ya vistos en el carril. Cárgalos en la página una sola vez por sesión, en localStorage (Recetas fila 31 D, paso 6).

**Una subcategoría por carga.** Las subcategorías y sus IDs están en Recetas fila 31 F. Las categorías padre juntas traían sobre todo moda, papelería y cargadores (18,6 créditos por fila nueva, contra 1,3 a 2 por categoría sola). **Regiones: todas las del selector, incluida Asia** (ver triangulación en 2.4), empezando por US, BR, GB, MX y ES.

**Filtros en la URL** (todos en el servidor; v3.18: cada carga lleva price\_usd\_min=8 y price\_usd\_max=80 en la URL, y la ventana de found\_time va desde hoy − Config B71 días hasta hoy − Config B72 días (hoy 180 y 30) y avanza un día por día: una ventana ya leída de una combinación (columna AF del resumen) no se vuelve a pagar, se lee solo el tramo nuevo desde el día siguiente a su último «hasta»; si una carga no lleva precio, anótalo en Log BUSCA R como carga no válida):

  - ventas ≥ Config B92 (hoy 1000);
  - videos ≥ Config B93 (hoy 10);
  - precio de US8aUS80;
  - orden por ventas (sort=3) y time=30.

**Plan de cargas, en este orden (dentro de cada paso, ordena las subcategorías y regiones por el ranking de rendimiento de Recetas fila 38: primero US y GB, aereo9, automotriz, deportes y herramientas; BR y las categorías sin productos, al final y solo si no queda nada más; M-063):**

1.  **Repetir lo que rinde.** Primero las combinaciones con AH de 15 o menos créditos por producto. Después las que tienen AG mayor que 0 (aún sin RANKEA: su AE y su AH todavía no dicen nada) y 6 o menos créditos por fila nueva. Lo que importa son los productos, no las filas: muchas filas y 0 productos ya rankeados no es rendir.
      
      - Si una de sus ventanas quedó con total mayor que créditos (quedaron productos sin leer), pártela por precio.
      - Si no, lee una ventana nueva: desde el día siguiente a su último "hasta" hasta hoy − Config B72, solo si tiene 7 días o más.
2.  **Explorar.** Subcategoría × región que no esté en el resumen, en el orden de la fila 31 F y de las regiones de arriba. Ventana: de hoy − B71 a hoy − B72. Mientras queden subcategorías sin probar, al menos el 30% de los créditos va aquí, para seguir aprendiendo.
3.  **No volver.**
      
      - Combinaciones con 2 o más cargas y más de Config B94 créditos por fila nueva.
      - Con 1 carga sobre B94, vuelve solo si la ventana nueva tiene 30 días o más. Tampoco vuelvas a una combinación ya rankeada (AG = 0) con 20 o más créditos y 0 productos.
      - Nunca repitas una carga: la misma combinación con una ventana que ya figure en el resumen (columna AF) o una clave que ya esté en 'Log BUSCA'\!V.

**Si el total pasa de 20:** pide la página siguiente con current\_page=2, 3… en la misma URL (Exploración 2026-10-14: con el listado Pages:20 la página 2 trae las filas 21 a 40; cuesta 20 créditos más por página). Si la página devuelve las mismas filas o el extractor no la lee, parte la combinación por precio (8a20, 20a40, 40a80). Si una banda sigue pasando de 20, pártela en 2 ventanas de found\_time. Cada parte es otra carga y otra fila del Log.

**En la página, antes de escribir:**

  - **Salta los IDs de 'Log BUSCA'\!X2**: no se escriben ni cuentan como nuevos.
  - **Aplica 2.1** para marcar el filtro de ganador, usando el found\_time de la fila (el filtro del servidor no coincide con la ventana).
  - **Marca el prefiltro window.\_\_noaereo** (fila 31 E). Por el título, lo que cae aquí no va a la pestaña Aéreo, pero se escribe en Crudo con su motivo:
      
      - necesita registro: suplementos, cosméticos y cuidado de la piel, comida y bebidas, productos para mascotas que se comen o se aplican, insecticidas, dispositivos médicos, juguetes y útiles de escritorio (DIGESA);
      - transmite por radio: Bluetooth, WiFi, audífonos, parlantes, relojes inteligentes, rastreadores, drones, controles remotos (homologación del MTC);
      - no viaja bien por aéreo: power banks, power stations, arrancadores y baterías sueltas, aerosoles, líquidos, inflamables;
      - fuera de foco: ropa, calzado, joyas, papelería, libros, decoración, textiles del hogar, velas y ventiladores.
  - **Revisa a mano lo que pasó**: ropa con título raro, marcas, pesados, líquidos. Lo que quites a mano va con su ID a la columna Q del Log, así ninguna sesión lo vuelve a escribir. En R anota también qué palabras del prefiltro tumbaron títulos (por ejemplo prefiltro: spray 3, smart 2); si una tumbó productos que servían, ponlo en Mejoras.

**Log BUSCA: una fila por carga, aunque traiga 0.** Escribe 'Log BUSCA'\!A:R en la fila que dice Config\!B103 (la primera libre, calculada como B101 para Sesiones) con update\_values: antes lee A de esa fila y confirma que está vacía. Nunca escribas en una fila fija ni sobre una que ya tenga datos: el 2026-10-15 una sesión pisó la fila 3 (M-061). Nunca escribas S:AH: son fórmulas.

|  |  |
| :-: | :-: |
| \*\*Col\*\* | \*\*Qué va\*\* |
| A | Fecha |
| B | Sesión |
| C | Región |
| D | Nombre corto de la subcategoría (fila 31 F). Si partiste por precio, el mismo nombre: el precio va en F |
| E | ID de la subcategoría |
| F | Precio: 8a80, 8a20, 20a40 o 40a80 |
| G | Ventas mínimas |
| H | Videos mínimos |
| I, J | Ventana found\\\_time (AAAA-MM-DD) |
| K | El código que va en Crudo D |
| L | total\\\_count |
| M | Créditos (resultados cargados) |
| N | Ya vistos |
| O | Cayeron en el prefiltro |
| P | Quitados a mano |
| Q | IDs quitados a mano, separados por coma |
| R | Qué aprendiste, en una línea: por qué se descartó, qué evitar, qué repetir. Si el found\\\_time de la región resulta poco confiable, anótalo aquí |

S, T, U, V, W (pendientes de RANKEA) y el resumen Z:AH se calculan solos:

  - S: filas nuevas, desde Crudo D, sin duplicados;
  - T: cuántas llegaron a Productos, cuando RANKEA marca Producto;
  - U: créditos por fila nueva;
  - V: la clave de la carga.

**Código en Crudo D**, único por carga: A|tts|\<nombre\>-\<precio\>|\<país\>|ft..\<hasta\>. Por ejemplo, A|tts|autorep-8a80|US|ft..2026-09-12. Es el mismo de Log K; sin él, S y T no cuentan. En Crudo, B = A (carril aéreo) y L = el found\_time real de la fila.

**Presupuesto:** Config B91 créditos por chat (hoy 3000), contados con la suma de Log M de la sesión. El contador de PiPiAds es el control: va con una carga de retraso.

**Parada:** además de 2.5, si 5 cargas seguidas traen 0 filas nuevas, pasa a otro grupo de subcategorías o a otra región. Nunca cierres BUSCA AÉREO por «pool agotado», «sin ventana nueva» o «solo quedan combinaciones vacías»: eso no es un motivo de cierre, y pedir RANKEA tampoco sustituye buscar (la cola pendiente no frena la búsqueda). Cierra solo por presupuesto (Config B91), por B59 filas nuevas o porque el chat se llena. Si los pasos 1 a 3 no dejan cargas útiles, baja por la escalera de ampliación, un peldaño a la vez, hasta que se cumpla una de esas tres paradas.

**Escalera de ampliación** (cada carga lleva una clave nueva en 'Log BUSCA'\!V, así que nunca repite una):

1.  Más ventas hacia abajo (desde 2026-10-16 el nivel base ya es 1000 ventas y 10 videos, y casi todo US se leyó también a ese nivel el 12 de octubre): en las subcategorías con mejor AH, léelas por BANDAS: sales\_volume\_min=500 y sales\_volume\_max=999 con videos 5 o más, y si rinden, 250 a 499 con videos 3 o más. sales\_volume\_max funciona en el servidor (Exploración 2026-10-14: 20 filas de 999 a 976), así que solo pagas la banda nueva; sin el máximo, la carga vuelve a traer las 20 de mayor venta que ya leíste y pagas por repetidos. En 297 filas aéreas juzgadas las ventas y los videos no predijeron el éxito; no hay datos bajo 1000, así que las dos primeras sesiones con este piso miden la tasa de Producto de cada carga: si baja de 8% (la de BR), vuelve al nivel anterior y anótalo en Mejoras (M-062). Si una banda no se deja leer sola, parte por precio (8a20, 20a40, 40a80) y los repetidos se saltan con X2. Anota en Recetas fila 34 qué funcionó.
2.  Menos videos: con ventas desde 1000, lee la banda de videos 10 a 19 (video\_count\_min=10 y video\_count\_max=19 en la URL, verificado el 2026-10-14: 1,5 créditos por fila nueva en US) para no repetir lo leído con 20 o más (Config B65).
3.  Otro orden: si el total de una consulta pasa de 20, léela otra vez con otro orden (videos o vistas en vez de ventas) para ver otros 20. Confirma el parámetro de orden en la interfaz y anótalo en Recetas fila 34.
4.  Subcategorías sin padre leído: prioriza las hijas de categorías padre que no se leyeron con ventas bajas. En BR las hijas de electrodomésticos y cocina repiten lo ya leído (cocinaelec: 11 de 13 ya vistos).
5.  Búsqueda por texto en TikTok Shop: busca tipos de producto aéreo sin registro (por ejemplo car organizer, magnetic phone mount, cable tester) en US con los mismos filtros. Confirma la URL de la búsqueda con una carga y anótala en Recetas fila 34.
6.  Ventana que avanza: la ventana nueva crece un día por día (hasta hoy − B72). Cuando una subcategoría que rinde tenga 7 días nuevos, léela.
7.  Anuncios sin palabra clave en US y Winning Products como complemento, con sus propias cargas en Log BUSCA.

En la entrega no escribas «no hay nada nuevo»: lista qué peldaños probaste, cuánto costó cada uno y qué dio.

**Entrega:**

  - cargas, créditos (suma de Log M) y filas nuevas;
  - las 3 mejores y las 3 peores combinaciones de la sesión según el Log;
  - qué subcategorías y regiones quedan sin probar;
  - filas Aplicada de Mejoras que tocan BUSCA AÉREO y sin nota en N: escribe en N si la sesión rindió mejor o peor (con el dato del Log).

-----

## **3. RANKEA**

Lee Config\!A73:C75, Config\!B16 y Config\!B99:B100. En RANKEA AÉREO trabaja solo las filas de la Cola con Carril (columna C) = A; en RANKEA, solo las demás. Las del otro carril no se tocan. De Recetas lee solo las filas 12 y 21. No uses Firecrawl ni Chrome.

### **3.1 Triage de toda la cola (sin herramientas)**

1.  Lee la pestaña **Cola RANKEA**, columnas A:K, en páginas de Config B73 filas ('Cola RANKEA'\!A1:K201, luego A202:K401…). Ya viene filtrada (P = Sí, Q = No, estado Pendiente o Preseleccionado) y ordenada. No leas Crudo.
2.  Decide cada fila Pendiente solo con el texto, el anunciante y las métricas, sin buscar nada:
      
      - apps, juegos, servicios, cursos, clínicas: Descartado;
      - ropa, moda, decoración, y cualquier cosa fuera de foco: guardado como fuera de foco (no se descarta), con S = motivo;
      - productos de marca: piensa en el **tipo genérico** que venden (unas tiras moradas de Hismile son "tiras blanqueadoras moradas"). Si ese tipo genérico es importable, va a Preseleccionado como genérico. Solo si el valor está en la marca y no en el producto (perfumes de marca, comida y bebidas de marca, maquillaje de firma): Descartado con motivo marca;
      - Excluidos (solo filas con E = "Sí"), productos que ya están en Productos (Productos\!D:D) y variantes cosméticas de un producto base común: se marcan como ya cubiertos (no se descartan del Crudo, se enlazan con su ID de Productos);
      - "Cliché" no es un motivo de triage: el triage no consulta nada, así que no puede probarlo. Lo que te parezca cliché va a Preseleccionado y lo decide el pre-chequeo (3.2);
      - el resto: agrupa por tipo genérico de producto y marca todas las filas del grupo como Preseleccionado, con el tipo genérico en S.
3.  Escribe R y S de toda la página en **una sola llamada** (receta de la fila 12). Sigue hasta que no queden Pendiente.

**Filas del carril aéreo (Crudo B = A):** no las descartes. Los que necesiten registro o permiso (DIGEMID, DIGESA, SENASA, homologación del MTC por radio) van a Productos con P = la autoridad, y la pestaña Aéreo los deja afuera. Los que pesen más de 1 kg, sean voluminosos o tengan líquidos, aerosoles o baterías sueltas se guardan con su motivo de no apto aéreo. Solo los que quedan sin registro ni impedimento van a Productos con C = Aéreo, ID AAMMDD-A-001 y P = Ninguno; si dudas de que no necesite registro o permiso, P = Otro y anota cuál en AL. Una batería pequeña integrada se acepta, con C1 máximo 1. Para estos no aplican las cuotas de regulados y suplementos de INSTR 03.

### **3.2 Pre-chequeo de anunciantes y puntaje de los preseleccionados**

Toma los grupos Preseleccionado en el orden de la cola (suplementos, regulados y recompra primero), **sin tope por chat** (RANKEA no tiene límite de créditos de Claude). Por grupo:

1.  **Pre-chequeo de anunciantes** (Meta MCP, receta de la fila 21, gratis): 2 frases de producto en español de 2 a 4 palabras (nombre genérico y producto base; si llevan tilde, también sin tilde), Perú, activos, limit 25. Con el título del anuncio y el nombre de la página, cuenta los **anunciantes distintos** que venden ese producto, un equivalente o el producto base. Dramas, noticias, clínicas, servicios y páginas sin producto no cuentan. Una marca extranjera con varias páginas (moneda distinta de PEN y el mismo título) es 1. Lo que cuenta son los anunciantes, no el total de anuncios.
      
      - **Config B75 o más** (= B16, hoy 10): Sobreexplotado. Se guarda igual en Productos con su estado y su motivo; no se puntúa, no llega a Revisión y se agrega a Excluidos para que BUSCA no lo vuelva a traer.
      - **Menos**: sigue al puntaje y anota en AL Pre-chequeo: N anunciantes (nombres).
2.  **Puntaje**: lee de la Cola las columnas L:P del grupo (no vuelvas a Crudo). Con el título y el ángulo del anuncio escribe el dolor en una línea (dolor + quién lo sufre + cuándo), sin inventar. Puntúa con INSTR 03, señal de novedad (AU: primer visto dentro de Config B37 días) y AT.
3.  Agrega al final de Productos: C = Dolor si vino del carril W1, Producto si vino del W2; K = link directo; L con el formato de INSTR 05, sección 0; BD = la foto (Cola P) de la fila del grupo con más ventas, solo si es de TikTok Shop (products/images); las portadas de anuncios no, porque casi siempre muestran a una persona (BD vacío: la llena ALIBABA). **O siempre con peso y tamaño, los dos, aunque sean aproximados**: ≈\<peso\> g · ≈\<largo\>×\<ancho\>×\<alto\> cm, y si ayuda el formato (frasco, sachet, no frágil). **Nunca escribas en AD:AF** (el estado lo da la validación), **ni en AW, AX ni AY** (fórmulas), **ni en la pestaña Revisión** (ahí marca el usuario).
4.  Marca las filas del grupo en Crudo: Producto y el ID, o Descartado y el motivo (en lote, receta de la fila 12). Modo tandas (por defecto desde el 2026-10-15; el usuario lo autorizó por escrito para RANKEA y RANKEA AÉREO: úsalo sin esperar a que lo repita; las sesiones -s y -w del 2026-10-15 hicieron el pre-chequeo a mano y cerraron parciales tras ~20 grupos): si tienes la herramienta de subagentes (Agent o Task), el pre-chequeo NO lo haces tú. El triage (3.1) lo haces tú. Para el pre-chequeo y el puntaje, reparte los grupos Preseleccionado en tandas de 8 a 10 grupos (medido el 2026-10-16: cada subagente gasta ~45 mil tokens fijos y ~11 mil por grupo, así que tandas más chicas salen caras) y lanza hasta 3 subagentes a la vez (Meta MCP es gratis y no usa Chrome, así que el paralelo no hace daño). Cada subagente recibe sus grupos con sus filas de la Cola (A:P), lee solo Recetas\!D39 (sus instrucciones compactas, con la tabla de pilares: no necesita INSTR 03), y NO escribe en la hoja: devuelve, por grupo, una línea «Sobreexplotado | N anunciantes | nombres» o la fila lista para Productos (columnas D:AC, AI:AL, AS:AV y BD, separadas por |). Tú asignas los IDs y escribes Productos, Excluidos y Crudo en lote (pasos 3 y 4). Sin subagentes, haz tú los grupos uno por uno.

### **3.3 Entrega de RANKEA**

Filas revisadas en triage y por motivo (descartadas, fuera de foco, ya cubiertas, con registro, no aptas aéreo), grupos saturados (con sus anunciantes), productos nuevos con puntaje, clasificación, estrellas y anunciantes del pre-chequeo, y top 10 por puntaje. Cierra con: "Tu reporte está en la pestaña Top. Marca ✅ en Revisión los que quieras validar y escribe FILTRA en un chat nuevo."

-----

## **4. FILTRA (validación ninja en la Biblioteca de Anuncios)**

Lee Config\!B16, Config\!B28, Config\!B44, Config\!B76, Config\!B77 y Config\!B86. De Recetas lee solo las filas 2, 18, 19 y 21 (la 20 solo si usas Mercado Libre).

**Qué productos entran: TODOS** los que tienen Productos\!AW en TRUE (el reflejo de la casilla de la pestaña Revisión, misma fila) y Recomendado (AR) que empieza con "Pendiente": Pendiente Meta (sin chequear) o Pendiente validación (validación estimada o cortada antes de tiempo; retómala leyendo antes su fila en Chequeo Meta, columna B = ID del producto: no repitas rondas ni keywords ya contadas). Los Recomendado Sí ya están validados: no entran otra vez (validarlos en cada FILTRA gastaría Firecrawl sin fin). La lista ya calculada está en Config\!B97 (FILTRA, general) y B98 (FILTRA AÉREO), ordenada por puntaje: léela y no recorras Productos. No hay tope por cantidad: solo paras por el presupuesto de Firecrawl (Config B28) o porque el chat se llenó, y en ese caso sigues en otro chat. De las filas de esa lista lee Productos A:D, K:L, AD:AH, AL y AN. Orden: mayor puntaje primero. Si no hay ninguno, dilo y recomienda RANKEA o ALIBABA.

**Saber qué producto es, antes de buscar:** con D, la evidencia (L) y, si hace falta, la fila de Crudo. Abre el link (K) solo si con eso no sabes qué es, y una sola vez. Nunca busques otra cosa que ese producto exacto (y sus equivalentes).

**Herramientas** (esto manda sobre INSTR 00, 01, 03, 04 y 05):

|  |  |
| :-: | :-: |
| \*\*Para qué\*\* | \*\*Herramienta\*\* |
| Anunciantes en Perú, tiendas (page\\\_ids), señal LATAM y días corriendo afuera | \*\*Meta MCP\*\* (receta de la fila 21). Gratis: va primero y hace casi todo. |
| Leer el texto de anuncios cuyo título o página no deja claro qué venden, e inactivos | \*\*Firecrawl JSON\*\* (filas 18 y 19): máximo Config B76 búsquedas por producto, hasta 4 en paralelo. Las llamadas fallidas o vacías también cuentan. Chrome solo si Firecrawl falla. |
| Mercado Libre Perú | Opcional e informativo: 1 búsqueda (fila 20) solo si no sabes cómo lo llaman en Perú. |
| Landings y búsqueda web | \*\*No se usan\*\* |

### **4.1 Mentalidad: eres un competidor que QUIERE encontrarlo**

Tu trabajo es demostrar que alguien en Perú ya lo vende. Piensa como un dropshipper peruano que vio el producto ganando afuera y quiere saber si ya se lo copiaron: ¿cómo lo llamaría para vender en Perú?, ¿qué gancho usaría?, ¿con qué título de AliExpress lo subiría? Un falso Virgen es el peor error posible.

### **4.2 Fase A: barrido gratis (todos los aprobados, en modo tandas lo hace el subagente de cada tanda con sus productos (sección 4.3); sin herramienta de subagentes, en este chat)**

Por producto, con Meta MCP (fila 21): 3 frases (nombre genérico, producto base y nombre viral o de marca), Perú, activos, limit 25. Junta los anunciantes distintos de las 3 (y los que ya estén en AL).

  - **Config B16 o más anunciantes** (hoy 10): Sobreexplotado. Escribe AD (anuncios relevantes vistos), AF (anunciantes), AJ, AK y AL (Barrido MCP: N anunciantes: A, B, C…), y agrégalo a Excluidos. Listo: no gastes Firecrawl, Mercado Libre ni LATAM en él.
  - **Menos**: pasa a la Fase B con esa lista de anunciantes.

### **4.3 Fase B: validación ninja de los que quedan**

Modo tandas (por defecto desde el 2026-10-15, M-017/M-056; el usuario delegó la decisión): si tienes una herramienta de subagentes (Agent o Task), el chat principal NO busca. Lee su lista (Config B97 o B98), pártela en tandas de 4 productos y lanza hasta 3 subagentes a la vez (Meta MCP y Firecrawl no comparten navegador). A cada subagente pásale las filas de su tanda y el ID de sesión, y que lea solo Recetas\!D37 (sus instrucciones compactas) y Config B16, B39, B44, B76 y B86, ningún INSTR. Cada subagente hace la Fase A y la Fase B de sus productos, escribe solo las celdas de sus filas en Productos y devuelve una línea por producto más las filas para Chequeo Meta y Excluidos y los créditos de Firecrawl usados; el principal las escribe en lote, suma los créditos contra Config B28 y, al terminar la ronda, relee su lista: si quedan filas, lanza otra. Sin herramienta de subagentes, valida cada producto tú, uno por uno. Cada subagente recibe el ID, la fila, el producto, el link, la evidencia, los anunciantes de la Fase A y estas reglas (4.1 y 4.3 e INSTR 04), escribe solo las celdas de **su** fila en Productos y te devuelve 3 líneas más las filas para Chequeo Meta y Excluidos, que escribes tú en lote al final. Si no hay subagentes, uno por uno.

1.  **Mapa de nombres** (gratis): genérico en español, producto base, nombre viral o de marca, título en inglés del proveedor, el problema principal, 2 frases como las diría un cliente, un beneficio, el gancho típico ("adiós a…", "olvídate de…"), variantes sin tilde y errores comunes. Saca vocabulario de los títulos que trajo la Fase A.
2.  **Ronda 1** (Meta MCP): 6 a 8 nombres de la lista. Cuenta anunciantes.
3.  **Ronda 2** (Meta MCP): los nombres, ganchos y formatos nuevos que aparecieron en la ronda 1.
4.  **Ronda 3, tiendas** (Meta MCP, page\_ids): los otros anuncios de las tiendas peruanas que venden algo del mismo problema (al menos 3). Muchas lo venden con otro nombre o en combo.
5.  **Firecrawl** (hasta Config B76): solo para leer el texto cuando el título o la página no bastan para decidir si es el mismo producto, y para los **3 inactivos** (Meta MCP en INACTIVE trae ruido).
6.  **AS, AV y AI**: competidores por problema, demanda probada afuera (INSTR 04, sección 6: vale un equivalente con Config B86 días o más corriendo afuera) y señal LATAM (Meta MCP en México, Colombia y Chile).

En cualquier momento, si llegas a Config B16 anunciantes: Sobreexplotado, corte temprano (solo AD, AF, AJ, AK y AL).

Virgen exige: rondas 1, 2 y 3 hechas, al menos Config B44 búsquedas con Meta MCP, 3 tiendas revisadas, los 3 inactivos con Firecrawl y ningún anunciante del producto o equivalente. Si falta algo, queda "parcial" (AD:AE vacíos). Escribe en Productos lo de INSTR 04, sección 9 (nunca AW, AY ni la pestaña Revisión; AY copia AF sola). En Chequeo Meta, una fila por ronda (keywords y conteos juntos).

La palabra "corte" en AL hace que el Sheet pida otra validación. Escríbela solo si el producto quedó Sobreexplotado.

### **4.4 Proveedor: no lo busca FILTRA**

Foto, proveedor, peso y tamaño los llena el comando ALIBABA (sección 5). Al terminar, lee AR de nuevo: si hay productos en Top sin foto (BD) o sin precio proveedor (BA), recomienda ALIBABA en la entrega.

### **4.5 Presupuesto y largo del chat**

  - Para cuando gastes el presupuesto de Firecrawl del chat (Config B28) o el chat se alargue. Termina antes el producto en curso; nunca dejes uno a medias.
  - Deja todo escrito y di: "Escribe FILTRA en un chat nuevo para seguir". Nunca estimes para terminar antes.

### **4.6 Entrega de FILTRA**

1.  **Ranking de los validados**: ordenados primero por el dolor más grande (magnitud, columna I) y luego por más dolores resueltos (N° de problemas, columna H). Por producto: estado en Meta (Virgen, Entrando, Sobreexplotado, Quemado), **anunciantes en Perú (columna AY)**, precio del proveedor (BA), anunciantes encontrados, competidores por problema y señal LATAM. Mercado Libre, si lo miraste, solo como dato.
2.  **Veredicto por producto: Testear o No testear**, con el motivo en una línea según el mercado peruano. Testear = Recomendado "Sí" en AR (WINNER o RENTABLE, Virgen o Entrando, problema no saturado y demanda probada afuera): son las filas que Productos resalta solas en amarillo y negrita. Lo demás, No testear.
3.  Cuántos se resolvieron en el barrido gratis, créditos de Firecrawl usados y cuántos aprobados quedan por validar (Config B77).
4.  Cierra con: "Tu reporte está en la pestaña Top" y, si hay productos en Top sin foto o sin precio proveedor: "Escribe ALIBABA en un chat nuevo".

-----

## **5. ALIBABA (foto, proveedor, peso y tamaño)**

**Arranque ligero** (esto manda sobre INSTR 00, sección 5): lee solo Config\!B89 y tu lista de pendientes ya calculada (Config\!B95 en ALIBABA, B96 en ALIBABA AÉREO), las filas 26 y 30 de Recetas y Config\!B101:B102 (fila e ID de tu sesión; regístrala siempre). El código de los scripts A a I está en Recetas\!E30 (receta «ALIBABA: scripts A a H»); la fila 29 es otra receta y no tiene código. Si no los encuentras, búscalos por ese nombre en Recetas\!A:A y léelos de la columna E (la F es una nota de prueba). No te detengas a preguntar: sigue con el primer producto.

  

Modo tandas (si tienes la herramienta de subagentes, Agent o Task; es el modo por defecto y el usuario lo autorizó por escrito el 2026-10-15 para ALIBABA, ALIBABA AÉREO, RANKEA y RANKEA AÉREO: úsalo sin esperar a que lo repita en el chat): el chat principal no abre Chrome. Lee tu lista (B95 o B96), pártela en tandas de 4 filas y lanza un subagente por tanda, esperando a que termine antes de lanzar el siguiente: nunca dos a la vez, porque comparten el Chrome del usuario y Alibaba bloquea las ráfagas. A cada subagente pásale: las filas de su tanda; el ID de sesión; que cargue con ToolSearch, en una llamada, las herramientas de Google Sheets (get\_values, update\_values) y en otra las de Claude in Chrome (tabs\_context\_mcp, tabs\_create\_mcp, navigate, javascript\_tool, computer, tabs\_close\_mcp); que lea solo Recetas\!D36 (sus instrucciones compactas) y E30 (scripts), y ningún INSTR; que si no tiene Chrome devuelva «SIN CHROME» sin hacer nada más; que trabaje con Claude in Chrome en una pestaña nueva propia y la cierre al final; que escriba en Productos solo AZ:BE y O de sus filas; que no registre sesión ni escriba en Mejoras; y que devuelva una línea por producto (fila, BA, número de proveedores, nota) más los créditos de Firecrawl usados. Si un subagente falla o no tiene Chrome, sigue con la tanda siguiente y al final haz tú las filas que quedaron. Al terminar todas las tandas, vuelve a leer tu lista: si quedan filas, lanza otra ronda. El principal registra la sesión, escribe Mejoras y entrega. Sin herramienta de subagentes, haz tú los productos uno por uno. El arranque son esas lecturas y nada más: no revises Top ni Oportunidades fila por fila. Después abre Chrome y procesa productos. Nunca cierres el chat sin haber terminado al menos un producto; no hay meta de productos: sigue con el siguiente de la lista hasta terminarla. Cierras solo si la lista se acabó o si el chat ya no da más (las herramientas devuelven respuestas cortadas o el sistema avisa que el contexto se llena). Nunca cierres por haber llegado a un número, ni porque «es largo» o «quedan muchos». Para que el chat rinda: capturas solo a 0.5, nada de pegar resultados en el chat y una línea por producto. No leas Excluidos, Sub-nichos ni Productos\!D:D.

**Nunca abras PiPiAds en ALIBABA**: cada ficha de anuncio o de TikTok Shop gasta créditos (se agotaron así el 2026-10-09).

**Herramientas:** Chrome del usuario (gratis, va primero) y Firecrawl solo de respaldo (máximo Config B89 créditos por producto). Google Lens no sirve (fila 28 de Recetas). **Nunca resuelvas ni esquives un captcha**, ni uses proxy stealth: si aparece, sigue con otro proveedor o con Firecrawl. Si una herramienta necesaria no está cargada, búscala primero con tool\_search y pruébala; pregunta al usuario solo si no aparece ninguna que sirva (INSTR 00, sección 4).

### **5.1 Rendir más por chat sin disparar el captcha**

  - **Solo los scripts B a I de la fila 30 de Recetas**, que devuelven menos de 300 caracteres. Nunca get\_page\_text ni read\_page en PiPiAds, tiendas, Google o Alibaba.
  - **Capturas solo para mirar fotos**, a escala 0.5: la hoja de contacto (script D) y la grilla de resultados de Alibaba o Google. Ninguna otra.
  - **No pegues ni resumas en el chat** lo que devuelven las herramientas. Por producto, una línea al final.
  - **Dos escrituras por producto**: Productos\!AZ{f}:BE{f} en una sola llamada (BC va como null, es fórmula y se salta) y Productos\!O{f}.
  - **Ritmo en Alibaba**: una sola pestaña y un solo producto a la vez, sin tandas en paralelo en Alibaba (los subagentes del modo tandas van uno detrás de otro, nunca dos a la vez); máximo 3 páginas de proveedor por producto y unos 13 segundos entre páginas (con 13 s y una sola tanda no salió captcha en 47 lecturas seguidas). Leer proveedores en ráfaga dispara el captcha para todo el navegador.
  - **Si una página de Alibaba pide captcha**: no la toques ni la resuelvas: cambia de proveedor de la grilla o de fuente (Firecrawl JSON, fila 26, o Google Imágenes limitado a Alibaba, 5.3) y sigue con el producto siguiente. Pausa solo si todas las fuentes están bloqueadas: deja escrito lo hecho y pide al usuario que escriba "listo". Mantén el ritmo de 13 segundos.

### **5.2 Qué productos entran**

1.  Primero los de **Top**, las filas de tu lista (B95 o B96), en ese orden: Top primero y luego por puntaje. Ya excluye las que tienen ✓ALIBABA y las saturadas o quemadas.
2.  Después los de **Oportunidades**, ya vienen en la misma lista, después de Top.
3.  De esas filas lee Productos\!D, K, L, O, AZ:BB, BD:BE y BF:BG (tienda y foto que trajo BUSCA, por fórmula). Entra el producto cuyo BE **no** contiene ✓ALIBABA, o que tenga **O sin peso o sin tamaño** (en ese caso solo completa O). Los demás se saltan.

No hay tope: para cuando el chat se alargue, sin dejar un producto a medias, y di: "Escribe ALIBABA en un chat nuevo para seguir".

### **5.3 Por producto**

**1. Foto del producto (BD): tiene que verse el producto.**

  - Si BD ya es una foto del producto (im.pipiads.com/products/images, cdn.shopify.com, alicdn.com) se queda. Si es la portada de un anuncio (cdn-video.pipiads.com/cover\_ o fb-cdn.pipiads.com/images) o está vacía, búscala: las portadas casi siempre muestran a una persona.
  - **TikTok Shop** (K tiene tiktok-shop-product): la foto de Productos\!BG. Si está vacía, pasa al punto de Google.
  - **Anuncio**: la tienda de Productos\!BF. Si es /products/\<nombre\> de Shopify, abre ese link con .js al final y saca las fotos con el script B; si es una colección o una landing, busca el producto en esa tienda con \<tienda\>/search/suggest.json?q=\<palabra\>\&resources\[type\]=product\&resources\[limit\]=6 y el script C.
  - **Sin tienda en BF**: busca en Google la marca o el anunciante de la evidencia (columna L) con el nombre del producto en inglés, entra a su tienda y sigue como arriba (scripts B o C).
  - **Antes de usar la foto de la tienda, confirma que la tienda vende el producto de la columna D.** Si vende otra cosa (un perfume, una recortadora), no uses su foto y anota en BE ⚠ el anuncio de la evidencia vende \<qué\>, no este producto.
  - **Si no hay tienda, o no coincide**: la foto del proveedor idéntico (paso 2) y en BE foto del proveedor. Nunca dejes BD vacío si AZ tiene imagen: copia AZ en BD. Antes, busca la tienda de la marca de la evidencia (L) en Google; si la encuentras, usa su foto y haz la búsqueda por foto en Alibaba en vez de Google Imágenes.
  - **Mira antes de escribir**: pon las candidatas en una hoja de contacto (script D, en https://example.com) y toma una captura a 0.5. Vale solo si se ve el producto claro, sea el envase o el producto mismo. Nunca una persona sin el producto, un estante, un texto o un logo. Elige la más clara.
  - **Formato**: en Shopify agrega ?width=600\&format=pjpg al final (sale JPG; Sheets no siempre muestra webp). En Alibaba usa la imagen tal cual.

**2. Proveedores: búsqueda por foto en Alibaba** (la misma que hace la extensión Alibaba.com Lens del usuario).

  - No uses los botones de la extensión: abren los resultados en una pestaña que no ves y su modo "seleccionar área" captura la pestaña que el usuario tiene abierta.
  - Abre https://www.alibaba.com/ y corre el script G con la URL de la foto del producto: abre "Buscar con imagen" y sube la foto. Espera unos 5 segundos.
  - Pega la foto del producto fija en una esquina de la página de resultados (script I) y toma una captura a 0.5: ves la foto y la grilla juntas. Si la foto no aparece, usa la hoja de contacto (script D).
  - Compara la grilla con la foto. Quédate con **hasta 3 que sean el mismo producto**: forma, envase y presentación iguales; el color, la marca y el idioma pueden cambiar.
  - El script H devuelve los links en el orden de la grilla (título, precio en soles solo de referencia y link).
  - Si no hay ninguno igual, prueba una vez más con otra foto del producto (otra de la tienda). Si solo hay parecidos, usa el más cercano y marca ⚠ parecido, revisar. Si ni el más cercano tiene la misma forma y la misma función (solo es de la misma categoría), no promedies: BA = s/d, guarda los links en BB y escribe «no comparable» en BE.
  - Si Alibaba muestra captcha (la búsqueda por nombre trade/search lo pide después de unas cuantas búsquedas), no lo toques: usa Google Imágenes limitado a Alibaba, https://www.google.com/search?q=site%3Aalibaba.com%2Fproduct-detail+\<nombre en inglés, 2 a 4 palabras\>\&udm=2, con el script I, captura a 0.5 y el script E. Último respaldo: Firecrawl, fila 26.

**3. Lee cada proveedor** (hasta 3) en Chrome con el script F.

  - Devuelve los precios en USD por tramo, el MOQ, el tamaño del paquete, el peso bruto y la imagen principal.
  - Si devuelve captcha: true, no la toques: usa otro proveedor de la grilla o Firecrawl JSON (fila 26, 5 créditos, proxy basic). Si Firecrawl también topa captcha, sus precios salen inventados: no los uses.
  - **Qué proveedores entran al promedio (BA)**: solo los que muestran precio por tramos (precios del script F) y por unidad. No entran, aunque sean idénticos:
      
      - los que cotizan por kilo o por lote a granel;
      - los que muestran un rango amplio sin tramos (por ejemplo US$1–10). Un precio único por unidad sí entra: cuenta como tramo más caro y más barato a la vez.

Estos van igual en BB y en BE con la nota cotizar (o precio por kg), para que el que importa les pida precio.

**4. Escribe en Productos:**

|  |  |
| :-: | :-: |
| \*\*Col\*\* | \*\*Qué va\*\* |
| AZ | Imagen principal del primer proveedor (script F) |
| BA | \*\*Precio proveedor promedio\*\*: número en USD \*\*por unidad de venta en Perú\*\* (el frasco, la caja o el kit que se vendería), con 2 decimales. Es el promedio del punto medio de cada proveedor que entra al promedio: (tramo más caro + tramo más barato) / 2. Ejemplo: 1.77–1.62 y 0.89–0.69 dan (1.695 + 0.79) / 2 = 1.24. Si el proveedor cotiza por pieza (tira, parche, tableta), multiplica por las piezas de la presentación y anótalo en BE, por ejemplo 30 tiras × US$0.02; si no sabes cuántas trae, deja el precio por pieza y anota ⚠ precio por pieza. Sin ningún proveedor que entre: "s/d" |
| BB | Links de los proveedores, separados por ; |
| BD | Foto del producto (paso 1) |
| BE | Por proveedor US$\\\<min\\\>–\\\<max\\\> · MOQ \\\<n\\\>, separados por /, más las notas (⚠ parecido, foto del proveedor, el anuncio vende otra cosa). \*\*Siempre termina en · ✓ALIBABA AAAA-MM-DD\*\*, también con s/d |
| O | \*\*Peso y tamaño, los dos siempre\*\*: ≈\\\<peso\\\> g · ≈\\\<largo\\\>×\\\<ancho\\\>×\\\<alto\\\> cm. Usa el paquete individual del proveedor; si es la caja (más de 500 g o más de 20 cm en un producto chico), estímalo del producto (ml ≈ g, más el envase). Antes de escribir O, relee el valor: si salió de la caja del proveedor, no lo dejes y agrega "(estimado)". Al final conserva solo la descripción original de RANKEA (lo que no empieza con ≈, por ejemplo 80 g, frasco); las estimaciones ≈ de un ALIBABA anterior se reemplazan, no se acumulan |

Para O, AZ, BA, BB, BD y BE, ALIBABA puede reemplazar lo que había (son sus columnas).

### **5.4 Entrega de ALIBABA**

  - Tabla corta: producto, foto (de la tienda, de TikTok Shop o del proveedor), precio proveedor promedio, n° de proveedores, peso y tamaño, nota.
  - Créditos de PiPiAds y Firecrawl usados, y la fuente usada en cada producto (Chrome, Google Imágenes o Firecrawl).
  - Cuántos productos de Top y de Oportunidades faltan.
  - Cierra con: "Tu reporte está en Top y Oportunidades".

-----

## **6. MEJORA (aplicar las mejoras del proyecto)**

Lee la pestaña Mejoras (A:N), Config\!A1:C94 si alguna toca Config y los documentos que nombran las filas. No abre PiPiAds, Chrome ni Firecrawl. No gasta créditos.

Entran las filas con K = Propuesta o Aprobada (el usuario dio permiso para aplicarlas sin esperar su aprobación; las que marca Rechazada no se tocan). En orden de ID:

1.  ¿Sigue haciendo falta? Busca en los INSTR vigentes, Recetas y Config si ya está cubierta. Si lo está: K = Ya cubierta y en N dónde.
2.  Busca contradicciones en todos los INSTR: una regla dicha en dos lugares con dos versiones es el error que más caro sale (por ejemplo «lo primero es PiPiAds» contra «lee el Log al empezar»). Corrígelas en el mismo cambio.
3.  Antes de tocar un INSTR, cópialo a la carpeta Versiones anteriores con el título «\<título\> (v\<versión actual\>)». Edita el vigente en su lugar con el conector de Google Docs (reemplazo de texto anclado en frases únicas), cambiando solo las palabras que cambian, y sube la versión y la fecha de la primera línea. Nunca lo recrees desde texto: se pierden tablas y formato. Sin el conector de Google Docs no edites: deja el texto exacto en N.
4.  Recetas: corrige la celda en su lugar y agrega al final «(AAAA-MM-DD: qué cambió)»; el texto anterior va a N. Un regex o script se prueba antes con títulos que debe tumbar y títulos que debe dejar pasar.
5.  Config: B66 y B91: el chat los cambia cuando el usuario lo autoriza en el chat, y lo registra en Mejoras.. En otras celdas cambia B y anota en C la fecha y el valor anterior.
6.  Si choca con una regla del usuario o con otra mejora, no la apliques: deja K = Propuesta y explica el choque en N.
7.  Marca K = Aplicada, L = fecha y M = documento y versión.

Cómo se registra una propuesta (cualquier comando, en su entrega): A = siguiente ID M-\#\#\#, B fecha, C sesión, D comando, E problema con el dato, F cambio exacto, G dónde, H evidencia (fila del Log, Sesiones o Crudo), I = 1, J riesgo (Bajo: receta, lista de palabras, Config que no sea presupuesto; Alto: regla de un INSTR, cuota o filtro de ganador), K = Propuesta. Antes busca en E y F si ya existe: si está Propuesta, suma 1 en I; si está Rechazada, no la repitas salvo con un dato nuevo (anótalo en N).

Entrega de MEJORA: tabla corta (ID, qué cambió, dónde, versión) y lo que no se aplicó con el motivo. Cierra con «Siguiente paso: abre un chat nuevo y escribe» el comando que corresponda.

  
