# Camino a las finanzas del negocio (preparado 2026-10-14, todavía NO construido)

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
