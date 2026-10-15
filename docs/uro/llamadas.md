# URO — lista de llamadas para la asesora comercial

Hoja de Google: **«URO - Lista de llamadas (asesora comercial)»**
`1CujjC-Mt_OpEpuJ3S4n_DbKQnR3T_TEa4C9awBkIAjk` (Drive del dueño). No mover, no renombrar, no recrear:
la Routine la escribe por su ID.

Para quién es: una asesora que **llama por teléfono** a clientes de URO que escribieron por WhatsApp
(número +51 940 028 332, línea id 1) y no compraron. Por cada uno ve el resumen del chat, un mini speech
de venta para la llamada y su teléfono, y marca el check cuando ya lo llamó.

## Pestañas y columnas (no reordenar; las nuevas van al final)

**Llamadas**: A Llamado (casilla; la marca la asesora, la fila se pinta de verde) · B Teléfono (`51 999 999 999`, texto) ·
C Nombre · D Interés (Alto / Medio / Bajo / Ya compró) · E Última actividad del cliente (hora de Lima) ·
F Resumen de la conversación · G ¿Fue venta? (casilla que marca la asesora) · H Novedad desde la última vez (la Routine la sobrescribe con 1 o 2 frases cuando el cliente ya listado vuelve a escribir o se le responde). Tiene filtro; la Routine NUNCA
escribe en A ni en G (ni lee el resumen viejo). (2026-10-15, pedido del dueño: se QUITARON las columnas «Speech para la llamada» y «Ojo antes
de llamar», y «Notas de la asesora» pasó a ser la casilla «¿Fue venta?».)

**Estado** (memoria de la Routine): A WhatsApp · B último mensaje leído (id) · C qué se hizo («En la lista» o
«Descartado: motivo»). Es lo que permite leer SOLO lo nuevo cada hora.

## Cómo corre (cada hora, con el plan, sin API de IA)

**Ahorro de créditos:** (1) `llamadas.py gate` revisa en un solo comando, sin leer la hoja, si algún chat con interés escribió en las últimas 3 h; si no, la sesión responde «Sin novedad» y termina (una llamada a herramienta). (2) Solo si hay movimiento lee la hoja y corre `preparar`, que descarta lo ya leído (pestaña Estado). (3) Ya no se escribe speech ni «Ojo»: solo un resumen corto por cliente. (4) Actualizar a un cliente ya listado es barato: `chats.txt` trae solo sus mensajes posteriores a la última lectura (+2 de contexto) y la Routine escribe D, E y H (Interés, Última actividad, Novedad) sin releer el resumen anterior.

Routine «URO — lista de llamadas» (ver `docs/routines.md`). `scripts/uro/llamadas.py preparar` baja los
chats de URO (`/api/asesor/chats?linea=1`, 14 días), descarta los que solo mandaron el saludo del anuncio,
los números internos (`INTERNOS` en el script) y los que no tienen mensajes nuevos desde la última vez
(Estado). Si no queda nada imprime `SIN_NOVEDAD` y la Routine termina sin leer más. Tope 20 chats por corrida
(los demás salen en la hora siguiente, lo más reciente primero). **Nada llama a la API de Claude**: lo escribe la
sesión de la Routine con los créditos del plan (`npm run check` falla si el repo trae una llamada a esa API).

## Reglas para escribir cada fila

- Entra a la lista quien **escribió algo más que el saludo** del anuncio (respondió o mostró un mínimo de interés:
  pidió precio, dio ciudad, tocó LIMA/PROVINCIA, preguntó algo). NO entra (queda en Estado como «Descartado: …»):
  solo sticker, «gracias», pidió que no lo escriban, buscaba otro producto, ya compró en otro lado, es prueba del equipo.
- **Interés**: Alto = dio ciudad/distrito, preguntó algo concreto (originalidad, uso, 3 frascos) o recibió datos
  de pago; Medio = pidió precio o tocó un botón; Bajo = dijo que volvería más adelante. «Ya compró»: el chat
  tiene la etiqueta de compra (se avisa en `ya_compraron`; la Routine solo cambia D y H de esa fila).
- **Resumen** (F): 2–4 frases, lo que pasó de verdad: qué pidió, qué le respondieron y quién (nombre de la
  vendedora), en qué quedó, si solo recibió mensajes automáticos (entonces «nadie le respondió»).
- Se nombra a la clienta solo si el nombre es real; si es emoji o apodo, «(sin nombre, emoji)» y el speech
  no usa nombre.
- Tema íntimo (`docs/uro/negocio.md`): no pedir detalles de síntomas; embarazo, lactancia, tratamiento médico o
  síntomas fuertes → «le recomendamos consultarlo con su médico»; nunca «cura», «elimina candidiasis» ni «desde la raíz».
  OJO: el texto largo de bienvenida que usa el equipo trae frases así («Combate la Candida Albicans», «Elimina mal
  olor…»); NO se copian al speech.

## Prompt de la Routine

Está completo en `docs/routines.md` → «URO — lista de llamadas».
