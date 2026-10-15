# Buscador de Productos Ganadores Perú — reglas del agente

Estas reglas aplican **solo dentro de `buscador-productos/`**. Lo demás del repo es otro proyecto (Tarot Store).

## Dónde están las reglas de verdad

Google Drive, carpeta «Buscador de Productos Ganadores Perú» (IDs en `docs/MAPA.md`). Los INSTR 00 a 07 mandan sobre esta carpeta. Si este archivo contradice un INSTR, manda el INSTR. Nunca trabajes de memoria: si Drive o Sheets no responden, informa y detente.

## Cómo trabajas (del dueño)

1. **Solo, sin preguntas.** Si algo es ambiguo, asume lo más razonable, anótalo en la entrega y sigue. No pidas confirmación ni verifiques accesos.
2. **Un comando por chat.** `sigue` retoma el mismo comando con el mismo ID de sesión.
3. **Dos modos.** Sin la palabra AÉREO trabajas solo lo general; con AÉREO solo lo aéreo. Una versión nunca toca las filas de la otra. Tus listas de trabajo están calculadas en `Config!B95:B100` (y B77): no recorras pestañas fila por fila.
4. **Nada se descarta.** Todo lo pagado o encontrado se guarda en Crudo con su motivo. Solo se descarta lo que no sirve de ninguna forma (apps, servicios, duplicados, marca sin producto genérico). Nunca borres filas ni limpies rangos: solo sumas.
5. **Cero falsos vírgenes.** Ante la duda entre Virgen y Entrando, Entrando. Un estado de Meta nunca se estima.
6. **No inventes datos.** Si falta, `s/d`.
7. **Nunca resuelvas ni esquives un captcha.** Cambia de fuente.
8. **Nunca escribas** en Top, Oportunidades, Aéreo, Rankings, Guía ni Revisión, ni en columnas con fórmula (lista en `docs/MAPA.md`). Nunca ordenes ni muevas filas de Productos.
9. **No ejecutes dos comandos que usan Chrome a la vez** (BUSCA, BUSCA AÉREO, EXPLORA, ALIBABA).

## Ahorro de tokens (decide por el dueño)

- Lee solo lo que dice `docs/OPERAR.md` para tu comando: rangos concretos, nunca una pestaña entera ni un INSTR completo cuando basta una sección.
- Meta MCP primero (gratis). Firecrawl solo en JSON con esquema corto y solo para texto dudoso e inactivos. PiPiAds solo en BUSCA, BUSCA AÉREO y EXPLORA, con su tope de créditos.
- Escribe en lote (hasta 50 filas por llamada). No pegues resultados largos en el chat: una línea por producto.
- Con tandas largas (ALIBABA, RANKEA, FILTRA) usa subagentes: el principal reparte y escribe en lote, el subagente lee solo su celda de instrucciones en `Recetas`.
- Los créditos de Claude no tienen tope; lo que sí se cuida es no repetir lo ya hecho.

## Memoria entre sesiones (cómo dejas el camino listo)

Antes de empezar lees lo que dejó la sesión anterior; antes de cerrar dejas lo tuyo:

- `Sesiones!H` (Notas): una línea de qué hiciste, cuánto gastaste y qué quedó pendiente. Siempre, también si el chat se corta.
- `Log BUSCA`: una fila por carga de PiPiAds (qué se leyó, ventana, créditos, filas nuevas). Es la memoria de lo ya buscado.
- `Chequeo Meta`: rondas y keywords ya contadas por producto (para retomar sin repetir).
- `Excluidos`: productos Sobreexplotados/Quemados y problemas saturados.
- `Mejoras`: lo que frenó la sesión y el cambio exacto propuesto; lo aplicas al cerrar si no choca con una regla del dueño.
- Cierre: «Escribe <comando> en un chat nuevo para seguir».

## Cambios a las reglas

Todo cambio a un INSTR, Recetas o Config se anota en `Mejoras` (Sheet) y en `docs/DECISIONES.md` con el texto anterior. Las referencias a filas de Recetas cuentan el encabezado como fila 1.
