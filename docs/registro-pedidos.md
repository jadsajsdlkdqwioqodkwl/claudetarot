# Registro rápido de pedidos (Dinsides en Lima, Shalom en provincia): propuesta

> Pedido del dueño, 2026-11-07: la persona que registra los pedidos se va. Hoy la asesora copia el chat entero, lo pega
> en un Project de Claude que ya conoce los campos de la página de **Dinsides** (courier de Lima) y el formulario se
> autocompleta. Quiere que sea más rápido, **no 100 % automático**: con intervención humana donde hace falta (cliente
> que solo mandó su ubicación; agencia de Shalom que no aparece o hay que confirmar). Estado: **propuesta, nada construido.**
> Revisar junto con `docs/estados-envio.md` (lectura de estados) y `docs/reporte.md` (reporte «Pedidos y ventas»).
>
> **2026-11-08:** la parte de **Lima (Dinsides) ya está construida** y va más allá de esta propuesta: el Worker arma la ficha, la
> registra en Dinsides por su API web y la Routine «Dinsides — registro de pedidos de Lima» revisa los chats como cuarta corrida.
> Estado en `docs/dinsides.md`. Lo de Shalom (provincia) sigue pendiente tal como se describe abajo.

## Idea central: el reporte de la noche ya hace el trabajo difícil
El reporte «Pedidos y ventas» (21:45 · 22:30 · 23:45) ya lee todos los chats y saca, por pedido, nombre, teléfono,
dirección o agencia, DNI, kits, cobro, nota y empaque, y lo guarda en la hoja «Pedidos auto». Es exactamente lo que el
Project de Claude saca pegando el chat. En vez de que la asesora pegue chat por chat, **el sistema puede entregar la
ficha ya armada** y la persona solo revisa y la carga. Cero tokens extra: los datos ya existen.

## Lima (Dinsides)
1. **Ficha por pedido, lista para copiar.** Para cada Lima confirmado del día, una ficha con los campos de Dinsides en su
   orden (nombre, teléfono, distrito, dirección, referencia, monto a cobrar, observación). Dos formas, de menor a mayor esfuerzo:
   - En el PDF de la noche y en la hoja «Pedidos auto»: una columna «Ficha Dinsides» con el texto listo para copiar.
   - Un botón «Ficha de pedido» en el chat del CRM: arma la ficha con lo que dio el cliente; se copia de un toque al
     Project de Claude o directo al formulario de Dinsides.
2. **Carga masiva, si Dinsides la tiene** (Excel o CSV): el reporte genera el archivo del día con todos los Lima
   confirmados, la persona lo abre, revisa y lo sube. Es el mayor ahorro: un archivo por noche en vez de N formularios.
3. **Solo mandó la ubicación (pin):** WhatsApp entrega latitud y longitud. El sistema pone el link de Google Maps y una
   dirección aproximada sugerida, marcada «🧭 CONFIRMAR DIRECCIÓN». Ahí sí revisa una persona (como pediste).
4. Opcional, más adelante: Claude Cowork en la computadora del dueño llena el formulario de Dinsides en el navegador y
   **se detiene antes de «Enviar»** para que una persona confirme.

## Provincia (Shalom)
1. **Agencias como datos, no como documento.** Pasar el Google Docs de agencias a una tabla (departamento, provincia,
   distrito, nombre de la agencia en Shalom Pro, dirección, código si lo hay). Con eso:
   - el reporte sugiere la agencia exacta a partir de lo que escribió el cliente («la de la av. Ejército en Arequipa»);
   - si hay dudas (dos agencias parecidas o una que no está en Shalom Pro), marca «📍 CONFIRMAR AGENCIA» con 2–3
     opciones, y el asesor propone el mensaje para preguntarle al cliente cuál es;
   - las agencias que Shalom Pro ya no tiene se anotan para corregir la tabla (aprende con el uso).
2. **Archivo para el envío masivo de Shalom.** Shalom Pro tiene carga masiva: el reporte arma el Excel del día con los
   provincia confirmados (nombre, DNI, teléfono, agencia, monto o saldo) en el formato de Shalom; la persona lo revisa y lo sube.

## Que la IA vea qué pasa después
Cuando se arme `estados.py` (ver `docs/estados-envio.md`), los estados de Shalom Pro y Dinsides (entregado, en agencia,
rechazado, devuelto) vuelven al sistema: hoja Ventas, «Pedidos auto» y etiquetas del CRM. Con eso el asesor y el reporte
saben qué pedidos se entregan, cuáles se rechazan, qué agencias fallan y qué clientes no recogen.

## Orden recomendado
1. **Primero (rápido, sin tokens extra):** columna «Ficha Dinsides» y Excel del envío masivo de Shalom desde el reporte
   de la noche, más el link de Maps para quien solo mandó su ubicación.
2. Tabla de agencias + sugerencia y «CONFIRMAR AGENCIA».
3. Botón «Ficha de pedido» en el chat del CRM.
4. Lectura de estados (`estados.py` con Cowork) y, si se quiere, Cowork llenando Dinsides con confirmación humana.

## Lo que hace falta del dueño
- Si Dinsides tiene carga masiva: un archivo de ejemplo (plantilla). Si no: los campos del formulario, en su orden.
- La plantilla del envío masivo de Shalom Pro (un Excel de ejemplo).
- El link del Google Docs de agencias (para pasarlo a tabla con el conector, sin tocarlo a mano).
- Las instrucciones del Project de Claude que usan hoy (para que la ficha salga igual).
