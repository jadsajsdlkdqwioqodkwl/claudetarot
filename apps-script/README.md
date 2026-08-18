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
| **Reporte por rango de fechas…** | Pregunta desde/hasta y escribe la pestaña `Reporte`: un renglón por día con leads, cerrados, pagados, ingresos cobrados, potenciales, ticket promedio y % de cierre, más una fila TOTAL del rango. |
| **Reporte de hoy** | Lo mismo, directo, sin preguntar. |
| **Enviar ventas a Meta (CAPI)** | Manda un evento `Purchase` por cada pedido en estado **Pagado** que no se haya reportado aún, y anota en la columna `CAPI` la fecha de envío o el error. |
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

Para no depender de acordarse del menú: en el editor de Apps Script,
**Activadores → Añadir activador** → función `enviarVentasAMeta`, origen
**Basado en tiempo**, cada hora. Con eso, marcar un pedido como *Pagado* es lo
único que tiene que hacer el vendedor.

## Probar los cambios

La lógica de cálculo se prueba sin subir nada a Google:

```bash
npm run check:gs
```
