# Finanzas del negocio

## Construido el 2026-10-19 (pedido del dueño): hoja PRIVADA de finanzas

Objetivo: ver el estado del negocio y decidir si el foco es **PRODUCTO** (ofertas, upsells), **CRO** (convertir mejor el tráfico) o **ADS** (costo de la publicidad, costo por mensaje o por compra). Vale para Tarot Store Perú hoy; para otro negocio se copia la hoja (mismas pestañas, otras reglas).

**Es información del dueño: NO está en el CRM ni en el Worker ni en D1.** Primero se hizo una pantalla «Finanzas» en el CRM (solo admin) y el dueño dijo que no quería que otros admins la vieran; se quitó el mismo día (código, rutas y tabla `fin_*` fuera; nunca tuvo datos). Vive en un Google Sheet en el Drive del dueño, compartido con nadie:

**Hoja «Finanzas Tarot Store (privado)»** · id `1yXvIQNXYq_DQoNlaCUN2SSvmBU-qhZIPGrwxfifwuHw` · https://docs.google.com/spreadsheets/d/1yXvIQNXYq_DQoNlaCUN2SSvmBU-qhZIPGrwxfifwuHw/edit · **no mover, no renombrar, no compartir, no recrear; no reordenar columnas (las nuevas van al final)**.

| Pestaña | Qué tiene |
|---|---|
| Resumen | Todo con fórmulas. Cambias «Desde» y «Hasta» (B2:B3) y recalcula: cobrado, costo del producto, envíos, comisiones, anuncios, utilidad, pedidos, ticket, CPA real, ROAS, costo por mensaje, chat→venta, venta→entrega, **dónde enfocarse** (ANUNCIOS / CRO / PRODUCTO), alertas y cuadro por courier |
| Reglas | Costo por kit (S/ 20), % de mejora para comparar palancas, umbral de rechazo, qué couriers paga el negocio, si un rechazado cuesta su envío. Se editan ahí (celdas amarillas) |
| Pedidos | Un pedido por fila: Courier, Guía/Ref, WhatsApp, Cliente, Asesora, Fecha venta, Fecha cierre, Estado, Unidades, Valor, Envío courier, Nota (A:L) |
| Anuncios | Por día y campaña: Fecha, Campaña ID, Campaña, Gasto, Impresiones, Clics, Conversaciones, Compras (Meta), Valor compras (A:I) |
| Gastos | Fecha, Categoría, Concepto, Monto (A:D) |
| Comisiones | Una fila por quincena copiada del CRM: Quincena, Desde, Hasta, Ventas CRM, Valor vendido, Comisión total, Detalle por asesora (A:G) |

### Reglas de Tarot Store Perú (dueño, 2026-10-19)

| Concepto | Regla |
|---|---|
| Costo del producto | Fijo **S/ 20 por kit** (Reglas!B3, por unidad) |
| Envío Dinsides | Sale en su reporte (columna Envío de Pedidos); lo paga el negocio |
| Envío Shalom / Olva | Lo cubre el cliente (bug de Shalom): costo 0 |
| Devoluciones de Shalom | No se leen ni se cuentan: no se cargan (estado `devuelto` existe pero no suma en nada) |
| Rechazado de Dinsides | Sin ingreso ni costo de producto (el kit vuelve); sí cuesta su envío (Reglas!B15) |
| Comisiones | 10 % del valor del producto; **Danitza 13 %** (`comisiones.js`, ajuste `comision_pct_asesoras`, de fábrica `{danitza: 13}`). Salen de las ventas marcadas COMPRA en el CRM, se haya recogido el pedido o no; la Routine copia el total de cada quincena desde `GET /api/asesor/comisiones?quincena=AAAA-MM-A` (mismo dato que CRM → Comisiones) |
| Anuncios | Gasto real de Meta Ads por día y campaña, con el conector de Meta |

**Base de la cuenta:** un pedido entra a la utilidad el día de su **Fecha cierre** (entregado/cobrado o rechazado); comisiones, anuncios y gastos, el día en que ocurren. Los pedidos en camino salen aparte como «por cobrar». Una quincena puede incluir ventas de la anterior que recién se cobraron.

**Dónde enfocarse:** para cada palanca calcula cuánta utilidad suma mejorarla un 10 % (Reglas!B4) sin tocar las otras: ANUNCIOS = 10 % menos de costo por mensaje; CRO = 10 % más pedidos entregados con el mismo gasto; PRODUCTO = 10 % más de ticket. La mayor es el «Foco recomendado». Las alertas avisan de pérdida por pedido (el pedido deja menos de lo que cuesta traerlo), rechazo alto, chat→venta bajo y falta de datos.

### Cómo entra cada fuente (con Claude, conectores de Google Sheets y Meta Ads)

1. **Dinsides (cada quincena):** el dueño deja el reporte (Excel/CSV) en Drive o lo pasa en la sesión. `python3 scripts/finanzas/importar_dinsides.py reporte.xlsx --ver` muestra cómo entendió las columnas (ajustar `SINONIMOS` al primer reporte real); con `--salida /tmp/fin/dinsides.json` lo convierte.
2. **Shalom y Olva:** capturas de pago de los chats (`imagenes.py`), `courier` shalom/olva, `estado` completado, `fecha_cierre` = día del recojo. Nada de devoluciones. (Scrape de la página de Shalom: mejora futura, hoy no hace falta.)
3. **Meta Ads:** conector de Meta Ads, insights por día y campaña (gasto, impresiones, clics, chats iniciados, compras, valor).
4. **Comisiones:** `GET /api/asesor/comisiones?quincena=…` con la clave del asesor.
5. **Escribir en la hoja:** `python3 scripts/finanzas/a_hoja.py entrada.json --existente pedidos_hoja.json --salida /tmp/fin/filas.json` evita duplicar (clave = courier + guía, o courier + teléfono + fecha de venta) y separa `pedidos_nuevos` (agregar al final), `pedidos_actualizar` (reescribir la fila: pasó de pendiente a completado) y las filas de `ads` y `gastos`. Luego se escribe con el conector de Google Sheets. Formato de `entrada.json`:

        {"pedidos": [{"courier": "dinsides", "ref": "guía", "whatsapp": "999…", "cliente": "", "asesora": "", "fecha_venta": "2026-10-12",
                      "fecha_cierre": "2026-10-15", "estado": "completado|rechazado|pendiente|devuelto", "unidades": 1, "valor": 79, "envio_costo": 10}],
         "ads":     [{"fecha": "2026-10-12", "campana_id": "…", "campana": "…", "gasto": 50, "impresiones": 5000, "clics": 100, "conversaciones": 12, "compras": 3, "valor_compras": 237}],
         "gastos":  [{"fecha": "2026-10-12", "categoria": "empaque", "concepto": "cajas", "monto": 40}]}

### Pendiente / decisiones

- Primer reporte real de Dinsides para afinar `SINONIMOS` (no tuve uno de ejemplo).
- Routine quincenal «Finanzas» (propuesta en `docs/routines.md`, **no creada**). Necesita los conectores Google Sheets, Google Drive y Meta Ads.
- Los datos reales aún no están cargados: la hoja está vacía (se probó con datos de ejemplo y se borraron).
- Estados de cuenta del banco para conciliar entradas reales (fase 3 original): por hacer.
- Si el rechazo de Dinsides cobra un monto distinto al envío de ida, ponerlo en «Envío courier» del pedido rechazado.
- La hoja guarda ventas y plata del dueño: no pegar su link ni sus datos en chats, el CRM ni documentos compartidos.

## Plan original (2026-10-14), conservado como historia

# Camino a las finanzas del negocio (preparado 2026-10-14; lo construido el 2026-10-19 está arriba)

Objetivo: saber cada mes cuánto se vendió, cuánto se cobró de verdad, cuánto se gastó y cuánto quedó, cuadrando **chats, pagos, couriers y bancos** sin que el dueño arme planillas.

## Fuentes y cómo entra cada una

| Fuente | Qué da | Cómo la lee Claude | Estado |
|---|---|---|---|
| Chats / CRM | Venta (Lima: dirección; provincia: adelanto), asesora, valor, compra marcada (`capi_events`) | API del asesor y D1 (ya existe) | Listo |
| Comisiones | 10 % por venta, 50/50 con estrella compartida (`src/lib/comisiones.js`, tabla `comision_ajustes`) | CRM → Comisiones | Listo (2026-10-14) |
| Estados de cuenta (Yape/BCP/etc.) | Entradas reales de plata, gastos, comisiones bancarias | El dueño sube el PDF/Excel a una carpeta de Drive «Finanzas/Estados de cuenta»; Claude lo lee con el conector de Drive | Por hacer |
| Paneles de Shalom y Dinsides (couriers) | Envíos, cobro contra entrega, liquidaciones, devoluciones | Navegador (Claude in Chrome o navegador integrado) con la sesión del dueño; o exportar el reporte a Drive | Por hacer: ver qué exporta cada panel |
| Pagos (Yape de adelantos y saldos) | Cruce adelanto ↔ venta | Capturas en chats + estado de cuenta | Por hacer |
| Gastos de anuncios | Costo por chat/venta | Conector de Meta Ads | Conector por reconectar |

## Fases

1. **Libro de movimientos**: una tabla D1 `finanzas_movimientos` (fecha, fuente, tipo entrada/salida, monto, referencia, chat/TS-… si aplica, conciliado sí/no). Sin tocar nada existente.
2. **Conciliación de ventas**: cada venta del CRM se cruza con su cobro (adelanto Yape, cobro del courier). Lo que no cuadra sale en una lista «por revisar».
3. **Courier**: importar liquidaciones de Shalom/Dinsides; marcar pedidos cobrados, devueltos y pendientes de pago del courier.
4. **Gastos y utilidad**: anuncios + comisiones de asesoras + courier + costo del kit → utilidad por quincena y por mes (ya hay quincenas en `comisiones.js`).
5. **Reporte financiero** (Routine mensual/quincenal, PDF con tablas como los de ventas) + pantalla en el CRM (solo admin).

## Qué necesito del dueño para empezar (en una sesión nueva)

- Últimos 2–3 estados de cuenta (PDF o Excel) en Drive.
- Acceso a los paneles de Shalom y Dinsides (que Claude los vea en el navegador con la sesión del dueño, **sin guardar contraseñas en el repo**) o un export de ejemplo.
- Costo del kit y de URO, y qué gastos fijos hay.
- Quién ve finanzas: por defecto solo admin (Danitza y dueño).

Regla: nada de claves ni tokens en el repo; van en variables de entorno del entorno «Default» o en conectores.
