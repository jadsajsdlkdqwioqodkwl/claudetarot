# Finanzas del negocio

## Construido el 2026-10-19 (pedido del dueño): utilidad, embudo y dónde enfocarse

Objetivo: ver el estado del negocio y decidir si el foco es **PRODUCTO** (ofertas, upsells), **CRO** (convertir mejor el tráfico) o **ADS** (costo de la publicidad, costo por mensaje o por compra). Vale solo para Tarot Store Perú hoy, pero todo lleva `negocio` (tablas `fin_*`, columna `negocio`; otro negocio = una fila nueva en `fin_negocios` con sus reglas).

### Reglas de Tarot Store Perú (dueño, 2026-10-19; se cambian en `fin_negocios.reglas` o con `PATCH /api/crm/finanzas`)

| Concepto | Regla |
|---|---|
| Costo del producto | Fijo **S/ 20 por kit** (`costo_producto`, por unidad) |
| Envío Dinsides | Sale en su reporte (`envio_costo` de cada pedido); lo paga el negocio |
| Envío Shalom / Olva | Lo cubre el cliente (bug de Shalom): costo 0 para el negocio |
| Devoluciones de Shalom | No se leen ni se cuentan: estado `devuelto` queda fuera de todos los totales |
| Rechazado de Dinsides | Sin ingreso ni costo de producto (el kit vuelve); sí cuesta su envío (`rechazado_paga_envio`) |
| Comisiones | 10 % del valor del producto; **Danitza 13 %** (`comisiones.js`, ajuste `comision_pct_asesoras`). Se toman de las ventas marcadas COMPRA en el CRM, se haya recogido el pedido o no (regla de siempre): así hay una sola cuenta, la misma de CRM → Comisiones |
| Anuncios | Gasto real de Meta Ads por día y campaña (`fin_ads`) |

**Base de la cuenta:** un pedido entra a la utilidad el día que se **cierra** (entregado/cobrado o rechazado); comisiones, anuncios y gastos, el día en que ocurren. Los pedidos en camino salen aparte como «por cobrar». Una quincena puede incluir pedidos vendidos en la anterior.

### Qué hay

| Pieza | Dónde |
|---|---|
| Tablas `fin_negocios`, `fin_pedidos`, `fin_ads`, `fin_gastos` | `migrations/0061_finanzas.sql` (aplicada en D1 el 2026-10-19) |
| Cuentas, embudo, palancas, alertas y carga idempotente | `src/lib/finanzas.js` (prueba: `scripts/test-finanzas.mjs`, entra en `npm run check`) |
| API | `GET/PATCH /api/crm/finanzas` (solo admin) · `GET/POST /api/asesor/finanzas` (clave del asesor) en `src/api/finanzas.js` |
| Pantalla | CRM → botón de gráfico «Finanzas del negocio» (solo admin): selector de quincena o mes |
| Scripts | `scripts/finanzas/importar_dinsides.py` (CSV/XLSX → JSON), `cargar.py` (JSON → Worker), `reporte.py` (cuenta en texto) |

### Cómo entra cada fuente

1. **Dinsides (cada quincena):** el dueño pasa el reporte de completados y rechazados (Excel/CSV). `python3 scripts/finanzas/importar_dinsides.py reporte.xlsx --ver` muestra cómo entendió las columnas (ajustar `SINONIMOS` al primer reporte real), luego `--salida /tmp/dinsides.json` y `python3 scripts/finanzas/cargar.py /tmp/dinsides.json`. Recargar el mismo reporte no duplica (clave = guía).
2. **Shalom y Olva:** las capturas ya están en los chats (la Routine las lee con `imagenes.py`). Se cargan como `pedidos` con `courier: "shalom"|"olva"`, `estado: "completado"` y `fecha_cierre` = día en que el cliente recogió y pagó. Devoluciones: no se cargan. (El scrape de la página de Shalom queda como mejora; hoy no hace falta.)
3. **Meta Ads:** la Routine usa el conector de Meta Ads (insights por día y campaña) y arma `ads`.
4. **Otros gastos:** `gastos` (empaque, herramientas, sueldos fijos…), uno por fila con `categoria`.

Formato de `cargar.py` (todas las claves son opcionales):

    {"pedidos": [{"courier": "dinsides", "ref": "guía", "whatsapp": "999…", "cliente": "", "asesora": "", "fecha_venta": "2026-10-12",
                  "fecha_cierre": "2026-10-15", "estado": "completado|rechazado|pendiente|devuelto", "unidades": 1, "valor": 79, "envio_costo": 10}],
     "ads":     [{"fecha": "2026-10-12", "campana_id": "…", "campana": "…", "gasto": 50, "impresiones": 5000, "clics": 100, "conversaciones": 12, "compras": 3, "valor_compras": 237}],
     "gastos":  [{"fecha": "2026-10-12", "categoria": "empaque", "concepto": "cajas", "monto": 40}]}

Sin `ref`, el pedido se identifica por `whatsapp` + `fecha_venta`.

### Cómo se lee la cuenta

    ASESOR_CLAVE=... python3 scripts/finanzas/reporte.py --quincena 2026-10-A     (o --mes 2026-10, --json)

Da: cobrado − producto − envíos = margen bruto; − comisiones − anuncios − otros = **utilidad**; ticket, lo que deja cada pedido antes de anuncios, costo en anuncios por pedido entregado (CPA real), ROAS real, costo por mensaje, chat→venta (CRO), venta→entrega, rechazo, CTR.

**Dónde enfocarse:** para cada palanca calcula cuánta utilidad suma mejorarla un 10 % sin tocar las otras: ADS = 10 % menos de costo por mensaje; CRO = 10 % más pedidos entregados con el mismo gasto; PRODUCTO = 10 % más de ticket (ofertas, upsells). La de mayor suma es el foco. Las alertas avisan de pérdida por pedido (el pedido deja menos de lo que cuesta traerlo), rechazo alto (> 20 %), chat→venta bajo (< 10 %) y datos que faltan.

### Pendiente / decisiones

- Primer reporte real de Dinsides para afinar `SINONIMOS` (no tuve uno de ejemplo).
- Routine quincenal «Finanzas» (propuesta en `docs/routines.md`, **no creada**): carga ads de Meta, lee el reporte de Dinsides que el dueño deje en Drive y manda la cuenta a CRM → Reportes.
- Estados de cuenta del banco para conciliar entradas reales (fase 3 original): sigue por hacer.
- Si el rechazo de Dinsides cobra un monto distinto al envío de ida (devolución), pasarlo en `envio_costo` del pedido rechazado.

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
