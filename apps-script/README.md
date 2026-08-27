# CRM en Apps Script

Añade a la hoja un menú **CRM** con reportes por rango de fechas, el envío de
ventas a la Conversions API de Meta y el archivado de pedidos viejos.

El script **no toca las columnas A–O**: esas las escribe el Worker. Solo usa la
columna **P (`CAPI`)**, que crea él mismo, y las pestañas `Reporte` e `Histórico`.

## Instalar

1. Abre la hoja → **Extensiones → Apps Script**.
2. Borra el contenido de `Código.gs` y pega el de `apps-script/CRM.gs`.
3. **Configuración del proyecto → Propiedades del script → Añadir propiedad**:

   | Propiedad | Valor |
   |---|---|
   | `META_PIXEL_ID` | `1598655637922566` |
   | `META_ACCESS_TOKEN` | el token de la Conversions API |
   | `META_TEST_EVENT_CODE` | *(opcional)* el código `TEST…` mientras pruebas |

4. Guarda y **recarga la hoja**. Aparece el menú **CRM** junto a *Ayuda*.
5. La primera vez que uses una opción, Google pide permisos: acéptalos.
6. Ejecuta **CRM → Preparar hoja**. Deja lista la columna `CAPI` y las pestañas.

> Si la hoja tenía solo 15 columnas, `getRange(1, 16)` fallaba y el script moría
> antes de crear nada: por eso la columna no aparecía. Ahora la rutina amplía la
> cuadrícula primero.

### De dónde sale el token

**Administrador de eventos → tu pixel → Configuración → Conversions API →
Generar token de acceso.** Es un token de larga duración; guárdalo solo en las
propiedades del script, nunca en una celda de la hoja.

Con `META_TEST_EVENT_CODE` puesto, los eventos aparecen en la pestaña
**Probar eventos** de Meta y no ensucian los datos reales. Bórralo cuando
termines de probar.

## Qué hace cada opción

| Menú | Qué hace |
|---|---|
| **Preparar hoja** | Crea la columna P (`CAPI`) y las pestañas `Reporte` e `Histórico` si faltan. Córrelo una vez tras instalar. |
| **Reporte por rango de fechas…** | Pregunta desde/hasta y escribe la pestaña `Reporte`: un renglón por día con leads, cerrados, pagados, ingresos cobrados, potenciales, ticket promedio y % de cierre, más una fila TOTAL del rango. |
| **Reporte de hoy** | Lo mismo, directo, sin preguntar. |
| **Enviar ventas a Meta (CAPI)** | Manda un evento `Purchase` por cada pedido en estado **Pagado** que no se haya reportado aún, y anota en la columna `CAPI` la fecha de envío o el error. |
| **Activar envío automático** | Instala el disparador: a partir de ahí, con solo poner **Pagado** en la columna Estado, esa venta sale sola a Meta y el resultado se escribe en `CAPI`. Es lo que quieres dejar puesto. |
| **Desactivar envío automático** | Quita ese disparador. |
| **Probar conexión con Meta** | Comprueba pixel y token sin enviar nada. |
| **Archivar pedidos antiguos…** | Mueve a `Histórico` los pedidos de más de N días (30 por defecto) para que la lista del día no se sature. |

## Decisiones que conviene conocer

- **Solo se reporta `Pagado`.** Un pedido contra entrega no es una venta hasta
  que el repartidor cobra; mandar `Purchase` al crear el lead le enseña a Meta a
  optimizar hacia pedidos que nunca se pagan.
- **Deduplicación por `Event ID`.** Es el que ya guarda el Worker. Reenviar el
  mismo pedido no lo duplica en Meta. El `Lead` del navegador va sin `eventID`,
  así que no choca.
- **Los datos personales viajan hasheados** en SHA-256 (teléfono, nombre y
  apellido), como exige Meta. `fbp` y `fbc` van tal cual, que es como se mandan.
- **La ventana de 7 días.** Meta rechaza eventos más viejos. Si un pedido se
  cobra dos semanas después, se reporta con la fecha del cobro en vez de la del
  lead, que además es la correcta para atribuir la venta.
- **Envíos de 50 en 50**, para que un lote con un dato malo no tumbe el resto.

## Automatizarlo

Usa **CRM → Activar envío automático al marcar Pagado**. Desde ese momento el
vendedor solo cambia el estado y la venta se reporta sola.

Va como disparador **instalable** y no como `onEdit` simple a propósito: un
`onEdit` simple no tiene permiso para salir a internet, así que `UrlFetchApp`
—la llamada a Meta— fallaría siempre sin decir por qué.

Una fila solo se reporta una vez: si en `CAPI` ya dice `✅ CAPI enviado`, se
salta. Si dice `❌ …`, se reintenta al volver a marcarla.

## Probar los cambios

La lógica de cálculo se prueba sin subir nada a Google:

```bash
npm run check:gs
```

---

# CRM de ventas manuales — `VENTAS.gs`

El segundo negocio del mismo libro. Mientras `CRM.gs` trabaja la pestaña
**`Pedidos`** (los leads que entran solos por la landing), `VENTAS.gs` trabaja la
pestaña **`Ventas`**: las ventas que reportas a mano, y la página de seguimiento
que ve tu cliente.

Los dos conviven sin tocarse: no comparten ni una constante ni una función.

## La idea: escribir poco y no abrir nada

**Registrar una venta es escribir el nombre del cliente.** El resto de la fila se
completa sola: fecha, código, tipo de envío y estado.

**Los botones están en la propia fila**, como fórmulas. Un clic y ya — no hay
ninguna ventana que esperar ni ninguna venta que elegir de una lista, porque la
fila en la que estás ya sabe de quién es:

| Columna | Un clic hace |
|---|---|
| **`Código`** | abre la página de seguimiento, la que ve tu cliente |
| **`Avisar`** | abre WhatsApp con el mensaje ya escrito, distinto según el estado |
| **`Voucher`** | abre el panel del celular centrado en esa venta, listo para la foto |

Y **nada es obligatorio**. Una venta con solo el nombre y el WhatsApp ya
funciona; lo que falte, faltará en la página del cliente y nada más.

## Instalar

Sobre el mismo proyecto de Apps Script donde ya está `CRM.gs`:

1. **Extensiones → Apps Script**.
2. **Archivo → +** dos veces y pega, respetando los nombres exactos:

   | Archivo nuevo | Tipo | Contenido |
   |---|---|---|
   | `VENTAS` | Secuencia de comandos | `apps-script/VENTAS.gs` |
   | `PANEL` | HTML | `apps-script/PANEL.html` |

3. Reemplaza `Código.gs` por la versión nueva de `apps-script/CRM.gs`. **Solo
   cambió su `onOpen`**, que ahora cuelga también el menú *Ventas*; el resto del
   archivo está igual.
4. Guarda y **recarga la hoja**. Junto a *CRM* aparece el menú **Ventas**.
5. **Ventas → Preparar hoja de Ventas.** Google pide permisos la primera vez
   (hoja, Drive y correo): acéptalos.
6. **Ventas → Activar automatismos.**
7. Publica el panel del celular (ver abajo) y **vuelve a correr *Preparar hoja***
   para que el botón 📷 apunte a él.

> Los dos menús se montan desde el `onOpen` de `CRM.gs` porque Apps Script solo
> admite **un** `onOpen` por proyecto. Si `VENTAS.gs` definiera el suyo, uno de
> los dos menús desaparecería sin decir nada. `npm run check` lo vigila.

## La pestaña `Ventas`

Dieciséis columnas, de las que **solo escribes diez** — y tres de esas son un
clic:

| | Columna | Quién la llena |
|---|---|---|
| **A** | Fecha | sola |
| **B** | Código | sola · *es link a la página del cliente* |
| **C** | Cliente | ✍️ tú |
| **D** | WhatsApp | ✍️ tú |
| **E** | Envío | ▾ Lima · Shalom · Dinsides |
| **F** | DNI | ✍️ tú *(solo provincia)* |
| **G** | Adelanto | ✍️ tú |
| **H** | Saldo | ✍️ tú |
| **I** | Pagado | ☑️ casilla |
| **J** | Destino | ✍️ tú — dirección o agencia |
| **K** | Clave Shalom | ✍️ tú *(solo provincia)* |
| **L** | Estado | ▾ Pendiente · En camino · En destino · Entregado · Cancelado |
| **M** | Notas | ✍️ tú |
| **N** | Alerta | sola |
| **O** | Avisar | sola · *botón de WhatsApp* |
| **P** | Voucher | sola · *botón de foto* |

Más dos columnas ocultas (`En destino desde` y `Drive ID`) que solo escribe el
script.

**No tienes que acordarte de qué llenar en cada caso.** En una fila de **Lima**,
las columnas `DNI` y `Clave Shalom` se ven grises y apagadas; al poner **Shalom**
en `Envío` se encienden y te piden que las llenes. El `Saldo` sale en rojo
mientras haya algo por cobrar y en verde tachado apenas marcas `Pagado`.

**Columnas de solo lectura:** `Alerta`, `Avisar` y `Voucher` son `ARRAYFORMULA`
que viven en la fila 2 y cubren toda la columna — es lo que hace que una venta
nueva salga con sus botones ya puestos sin arrastrar nada. Si escribes encima de
una de esas tres, rompes esa columna entera; para arreglarla, vuelve a correr
*Preparar hoja de Ventas*.

## Qué hace cada opción del menú

Son seis y **ninguna es para el día a día**: marcar un estado, avisar al cliente
o subir el voucher se hacen desde la propia fila. Un menú al que hay que volver
todos los días es un menú mal hecho.

| Menú | Qué hace |
|---|---|
| **Preparar hoja de Ventas** | Crea o pone al día la pestaña, los desplegables, los colores, las fórmulas, el panel y la carpeta de Drive. Idempotente. |
| **Revisar y completar la hoja** | Le pone código a las filas que no lo tengan, cambia los códigos repetidos y fecha las ventas que ya estén en agencia. Para después de pegar datos de golpe. |
| **Abrir panel del celular** | Te da la URL de la Web App. |
| **Revisar pendientes de recojo ahora** | Corre a mano la revisión que hace sola cada mañana. |
| **Activar / Desactivar automatismos** | El autocódigo y la revisión diaria. |

## El panel del celular

**Los menús de Apps Script no aparecen en la app móvil de Google Sheets.** Solo
en navegador. Y el momento de marcar «En destino» y subir la foto del voucher es
justamente cuando estás en el mostrador de la agencia, con el celular.

Por eso el mismo proyecto se publica además como **aplicación web**:

1. En el editor: **Implementar → Nueva implementación → Aplicación web**.
2. **Ejecutar como:** Yo. **Quién tiene acceso:** Solo yo.
3. Copia la URL y **guárdala en la pantalla de inicio del celular**.
4. Vuelve al Sheets y corre **Preparar hoja de Ventas** para que el botón 📷 de
   cada fila apunte al panel.

La autenticación es tu propia cuenta de Google. No hay token que pegar ni
contraseña que se pueda filtrar, y como solo tú tienes acceso, nadie más puede
abrirlo aunque conozca la URL.

El botón 📷 de la hoja abre el panel **ya centrado en esa venta**
(`?c=TS-K3M582R`), con el botón de subir foto arriba del todo: llegas directo a
lo tuyo. Sin `?c=`, el panel lista los envíos vivos ordenados por urgencia, y
cada tarjeta avisa de lo que le falta al envío para que su página sirva de algo.

> Cada vez que cambies el código, **vuelve a implementar** (Implementar → Gestionar
> implementaciones → editar → Versión nueva). La URL no cambia.

## La foto del voucher

Va a una carpeta de **tu propio Drive** (`Vouchers de envío — Tarot Store Perú`),
creada por el script la primera vez. Coste cero: son tus 15 GB, y un voucher
comprimido pesa unos 200 KB.

**No la sube la service account del Worker.** Las cuentas de servicio tienen
**0 bytes** de cuota en Drive y cualquier subida suya muere con
`storageQuotaExceeded`. Es el error clásico de este montaje y la razón de que la
foto la suba Apps Script, que corre con tu cuenta.

El archivo queda accesible por link, pero **su id nunca sale de la hoja**: el
cliente recibe `…/v/TS-K3M582R` y el Worker le pasa los bytes. Así nadie puede
recorrer tu carpeta a partir de una foto, y la CSP del sitio sigue con
`img-src 'self'`.

Reemplazar un voucher manda el anterior a la papelera: corregir una foto es
corregir un error, y dejar la equivocada en Drive solo confunde después.

## Los avisos de recojo

Un paquete que se queda en la agencia vuelve al remitente en un mes. Los avisos
están a los **2, 6, 15 y 25 días** de haber llegado, contados desde el día en que
pusiste el estado en «En destino».

Van por dos vías, a propósito:

- **En la hoja, siempre:** la columna `Alerta` y el bloque *Pendientes de recojo*
  del panel se calculan con fórmulas. Están al día aunque el disparador falle.
- **Por correo, solo cuando toca:** cada mañana a las 9 (hora de Lima) revisa la
  hoja y te escribe **solo si alguna venta cruzó hoy un escalón**. Un correo
  diario repitiendo lo mismo se vuelve ruido, y en dos semanas dejas de abrirlo
  — que es justo cuando importaba.

El correo llega a la cuenta con la que autorizaste el script, trae el saldo por
cobrar de cada uno y un link directo para escribirle por WhatsApp.

Los envíos que no van por agencia **no generan alertas**: no hay ningún
mostrador donde el paquete pueda quedarse esperando.

## El panel de ventas

La pestaña **`Panel Ventas`** se alimenta sola: hoy (ventas, cobrado, por
cobrar), ahora mismo (sin despachar, en camino, esperando recojo, saldo vivo),
por tipo de envío, por día, y la lista de pendientes de recojo con sus días y su
saldo.

«Por cobrar» cuenta solo lo que no está pagado ni cancelado: sumar la columna
entera contaría plata que ya entró.

## Migrar tu Sheet 2 actual

Tu hoja vieja **no se toca**: queda de respaldo.

1. Corre **Preparar hoja de Ventas**.
2. Copia tus filas y pégalas en `Ventas` empezando en **A2**, columna por
   columna. **No pegues nada en N, O ni P** — son las calculadas.
3. Corre **Revisar y completar la hoja**.

El paso 3 hace falta porque un pegado múltiple no dispara el automatismo del
código: el evento de edición no trae valor y no distingue una fila de cincuenta.
Sin él, esas ventas se quedarían sin código y por lo tanto sin página de
seguimiento. Ese mismo paso detecta los **códigos repetidos** que salen de copiar
una fila entera — dos ventas con el mismo código comparten página, y el cliente
vería la del otro.

## Cambiar el dominio, los estados o los plazos

Todo vive arriba de `VENTAS.gs`: `SITIO`, `ESTADOS_V`, `ENVIOS_V`, `ALERTAS_V`.
Si cambias cualquiera, **cámbialo también en `src/lib/ventas.js`** del Worker.
`npm run check` compara los dos archivos y falla si se desalinean: sin ese
chequeo, el Worker leería la clave de Shalom en la columna del saldo y nadie se
enteraría hasta que un cliente lo reclamara.
