# Ventanas de WhatsApp y costos — referencia rápida

Notas de negocio sobre cuándo un mensaje de WhatsApp cuesta y cuándo no,
para tenerlo siempre a mano al tocar `crm-cron.js`, `crm-welcome-sequence.js`,
`crm-send.js`, `templates.js`, `scheduled.js` o `bulk-send.js`. Basado en el
PDF oficial de Meta "Pricing on the WhatsApp Business Platform" (vigente
desde el 1 jul 2025, con el cambio del 1 oct 2026 ya incorporado) y en la
página oficial de precios revisada el 06/10/2026
(https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

## Las dos ventanas

- **Ventana de servicio (24h)**: se abre cuando el cliente te escribe (un
  mensaje, o tocar "Enviar mensaje" en tu anuncio). Se **resetea** con
  cada mensaje nuevo del cliente — incluido tocar el botón de una
  plantilla con quick-reply. Mientras esté abierta, texto libre y
  plantillas utility van gratis.
- **Free entry point (FEP), ahora 7 días** (antes 72 h; Meta lo amplió el
  28/09/2026 y así figura hoy en su página de precios: "The FEP window may
  remain open for up to 7 days"): si el cliente te escribió desde un anuncio
  Click-to-WhatsApp (desde la app de Android o iOS) y tú le respondes dentro
  de las 24 h de servicio, se abre una ventana de **hasta 7 días desde tu
  respuesta** donde Meta **no cobra ningún mensaje**: ni plantillas de
  marketing, utility o autenticación, ni texto libre (servicio), aunque la
  ventana de 24 h ya se haya cerrado. En Tarot Store la bienvenida automática
  responde al minuto, así que los 7 días se cuentan, en la práctica, desde que
  llegó el chat (`conversations.created_at`). El código usa 160 h (8 h de
  margen): `FEP_HORAS` en `src/lib/toques.js`.
  Lo único que sigue cobrándose dentro del FEP son los mensajes del "Meta
  Business Agent" (no lo usamos).

## Categorías de plantilla — quién paga

| Categoría | ¿Cuándo cobra? |
|---|---|
| **Marketing** | Siempre, salvo dentro de los 7 días del free entry point del anuncio |
| **Utility** | Solo fuera de la ventana de 24h (y fuera del free entry point de 7 días si vino de ad) |
| **Authentication** | Misma regla que utility |
| **Service** (texto libre, no-plantilla) | Solo fuera de la ventana de 24h |

**Truco para reabrir ventana gratis:** cualquier respuesta del cliente
resetea las 24h — incluido tocar un botón de quick-reply de una
plantilla. Por eso conviene que las plantillas de seguimiento (ej. aviso
de Shalom/Olva) traigan un botón tipo "✅ Ya tengo el efectivo listo" /
"Confirmar recepción": en cuanto lo toca, se abre otra ventana de 24h
gratis para coordinar el cobro sin mandar más plantillas pagadas. Ese
botón se arma como quick-reply button al crear la plantilla en Meta
Business Manager (no existe todavía una función en este repo para crear
plantillas — solo `listarTemplates`/`enviarTemplate` en `src/lib/whatsapp.js`
para listar y mandar las ya aprobadas).

## ⚠️ Cambio del 1 de octubre de 2026

Hasta ahora, el texto libre y las plantillas utility dentro de la ventana
eran gratis sin excepción. **Desde el 1 oct 2026, Meta empieza a cobrar
también por mensajes de servicio y utility dentro de la ventana** (antes
gratis), los mande una persona o un bot. Revisar el rate card actualizado en
WhatsApp Manager — no está en el PDF fuente el monto exacto en soles.

- **1.000 mensajes de servicio gratis al mes por número**; se cobra desde el
  1.001 (según los avisos de los BSP; confirmarlo en WhatsApp Manager).
- El **free entry point** de los anuncios Click-to-WhatsApp sigue y ahora dura
  **7 días**: todo lo que se manda en esa semana va gratis. En la práctica:
  **cerrar la venta, y hacer los seguimientos, dentro de los 7 días desde que
  llegó del anuncio** sale gratis; lo que se estira después, y los chats
  orgánicos (que no vienen de anuncio), cuesta por cada mensaje.
- Cada paso de la bienvenida y cada seguimiento automático es un mensaje
  cobrable fuera de esos 7 días: por eso el tope de automáticos seguidos sin
  respuesta en `crm-cron.js` (`MAX_AUTOMATICOS_SIN_RESPUESTA`).
- Qué cambia con 7 días (06/10/2026): el 96 % de las compras llega en los
  primeros 3 días, pero ~360 chats con intención real se quedaban sin un solo
  mensaje del día 2 al 30. Ahora toda la primera semana de seguimiento
  (`frio2`, `d2`, `frio6` y el `d7` adelantado de `src/lib/toques.js`) es
  gratis, incluso para los que solo mandaron el saludo del anuncio. Lo pagado
  queda para la semana 2 en adelante y solo para quien conversó (etapa 2+).
  Detalle: `docs/plan-seguimientos.md`.

## Mapa de qué función manda qué

| Dónde en el código | Tipo de mensaje | Nota |
|---|---|---|
| `mandarBienvenidaSiAplica` (`whatsapp-webhook.js`) → `mandarSecuenciaBienvenida` | texto libre | Se dispara al toque del primer mensaje del ad — abre el free entry point de 7 días |
| Toques de los días 2/6/7/14/30 (`toques.js`, cron en los minutos `% 5 === 2`) | plantilla marketing con 2 botones | Gratis dentro de los 7 días del anuncio (`gratis`, `enFep`); pagada después. Apagado mientras `TOQUES` esté vacío |
| Seguimiento programado por chat (`scheduled.js` POST, sin `template_name`) | **siempre texto libre**, no admite plantilla | Si `send_at` cae fuera de ventana, el cron (`crm-cron.js`) lo marca `'fallido'` — no cobra, pero tampoco llega. El panel solo muestra `'pendiente'`, no avisa de los fallidos |
| Envío masivo modo texto (`bulk-send.js`) | texto libre | Mismo riesgo: falla fuera de ventana, no cobra |
| Envío masivo modo plantilla / "Enviar plantilla" en el chat (`templates.js`) | plantilla | Cobra fuera de ventana/free-entry, gratis dentro |
| Pedido web a los 3 min (`pedidos-web.js`, cron de cada minuto) | plantilla utility `pedido_web_recibido` | Solo si el cliente no escribió antes; cobra como utility fuera de ventana. Tocar un botón abre 24 h |
| Reportar venta (`capi-send.js` → Meta Conversions API) | no es mensaje de WhatsApp | Nunca cobra, sea con `ctwa_clid` o el modo manual `system_generated` |
| OTP de login (`login.js`) | texto libre | Gratis si el vendedor escribió al número hace <24h; con TOTP app, cero mensajes por WhatsApp |

## Recomendación por escenario COD

- **Lima (cierra en ≤3 días):** no requiere cambios — la bienvenida
  automática ya abre el free entry point de 7 días, y mientras los
  seguimientos de cobro se programen dentro de esa ventana, todo texto
  libre sin costo.
- **Provincia (el pago llega días después, vía courier):**
  1. Tener lista(s) plantilla(s) utility ya aprobadas (aprobación: horas,
     no días) — idealmente con un botón de quick-reply para reabrir
     ventana gratis apenas el cliente confirma.
  2. Para el seguimiento que sabes que caerá fuera de la ventana, usar
     **bulk-send en modo plantilla** (aunque sea un solo contacto) o
     mandarla a mano desde el chat — nunca el modal de "Programar
     seguimiento" por chat, porque ese solo manda texto libre y falla
     en silencio fuera de ventana.
  3. En cuanto el cliente responde al botón/plantilla, aprovechar esas
     24h gratis para coordinar hora exacta de entrega/cobro con texto
     libre.

## Plantillas: no vencen

Una plantilla **aprobada** no caduca: queda en WhatsApp Manager hasta que
alguien la borre (Meta solo la pausa si recibe muchos bloqueos). Lo que dura
poco es la **ventana** (24 h desde el último mensaje del cliente; 7 días si
vino de anuncio). Si algo "duró unas horas", no era una plantilla aprobada
(p. ej. un mensaje de ausencia o de bienvenida de la app WhatsApp Business).

Crear una: WhatsApp Manager → **Administrar plantillas** → Crear plantilla →
categoría **Utilidad** → idioma Español → cuerpo con variables {{1}}, {{2}}
→ (opcional) botón de respuesta rápida → Enviar. Suele aprobarse en minutos.
El nombre va en `PLANTILLA_ENVIO` (wrangler.jsonc).
