# Ventanas de WhatsApp y costos — referencia rápida

Notas de negocio sobre cuándo un mensaje de WhatsApp cuesta y cuándo no,
para tenerlo siempre a mano al tocar `crm-cron.js`, `crm-welcome-sequence.js`,
`crm-send.js`, `templates.js`, `scheduled.js` o `bulk-send.js`. Basado en el
PDF oficial de Meta "Pricing on the WhatsApp Business Platform" (vigente
desde el 1 jul 2025, con el cambio del 1 oct 2026 ya incorporado).

## Las dos ventanas

- **Ventana de servicio (24h)**: se abre cuando el cliente te escribe (un
  mensaje, o tocar "Enviar mensaje" en tu anuncio). Se **resetea** con
  cada mensaje nuevo del cliente — incluido tocar el botón de una
  plantilla con quick-reply. Mientras esté abierta, texto libre y
  plantillas utility van gratis.
- **Free entry point (72h)**: si el cliente te escribió desde un anuncio
  Click-to-WhatsApp (o un botón de Facebook Page) y tú le respondes
  dentro de la primera hora del día 1 (las 24h de servicio), se abre
  además una ventana de **72 horas** donde **las plantillas nunca
  cobran**, así el cliente no te haya vuelto a escribir. El texto libre
  dentro de esas 72h solo es gratis si la ventana de 24h normal también
  sigue abierta (o sea, si el cliente te escribió recientemente).
  **No son 7 días** — son 3.

## Categorías de plantilla — quién paga

| Categoría | ¿Cuándo cobra? |
|---|---|
| **Marketing** | Siempre, dentro o fuera de ventana |
| **Utility** | Solo fuera de la ventana de 24h (y fuera del free entry point de 72h si vino de ad) |
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

**Programar plantillas y botones en seguimientos (CRM):**
- *Programar seguimiento → Una plantilla*: elige una plantilla aprobada, sus
  variables y la hora. No tiene el límite de 24 h (es lo único que WhatsApp
  acepta fuera de la ventana). Los botones de una plantilla se crean en Meta.
- *Secuencias*: cada paso puede ser "Mensaje normal" o una plantilla
  (variables separadas por `|`).
- *Botones de opciones* (hasta 3, máx. 20 caracteres) en un seguimiento o
  paso de texto: salen como mensaje interactivo, solo dentro de las 24 h, sin
  aprobación de Meta. Cuando el cliente toca uno llega como su respuesta
  (texto del botón) y reabre la ventana.
- Migración `0042_crm_v42.sql` (ya aplicada).

## ⚠️ Cambio del 1 de octubre de 2026

Hasta ahora, el texto libre y las plantillas utility dentro de la ventana
eran gratis sin excepción. **Desde el 1 oct 2026, Meta empieza a cobrar
también por mensajes de servicio y utility dentro de la ventana** (antes
gratis), los mande una persona o un bot. Revisar el rate card actualizado en
WhatsApp Manager — no está en el PDF fuente el monto exacto en soles.

- **1.000 mensajes de servicio gratis al mes por número**; se cobra desde el
  1.001 (según los avisos de los BSP; confirmarlo en WhatsApp Manager).
- El **free entry point de 72 h** de los anuncios Click-to-WhatsApp sigue:
  todo lo que se manda en esas 72 h va gratis. En la práctica: **cerrar la
  venta dentro de las 72 h desde que llegó del anuncio** sale gratis; lo que
  se estira después, y los chats orgánicos (que no vienen de anuncio),
  empiezan a costar por cada mensaje.
- Cada paso de la bienvenida y cada seguimiento automático es un mensaje
  cobrable fuera de las 72 h: por eso el tope de 4 automáticos seguidos sin
  respuesta en `crm-cron.js` (`MAX_AUTOMATICOS_SIN_RESPUESTA`).

## Mapa de qué función manda qué

| Dónde en el código | Tipo de mensaje | Nota |
|---|---|---|
| `mandarBienvenidaSiAplica` (`whatsapp-webhook.js`) → `mandarSecuenciaBienvenida` | texto libre | Se dispara al toque del primer mensaje del ad — abre el free entry point de 72h |
| Seguimiento programado por chat (`scheduled.js` POST, sin `template_name`) | **siempre texto libre**, no admite plantilla | Si `send_at` cae fuera de ventana, el cron (`crm-cron.js`) lo marca `'fallido'` — no cobra, pero tampoco llega. El panel solo muestra `'pendiente'`, no avisa de los fallidos |
| Envío masivo modo texto (`bulk-send.js`) | texto libre | Mismo riesgo: falla fuera de ventana, no cobra |
| Envío masivo modo plantilla / "Enviar plantilla" en el chat (`templates.js`) | plantilla | Cobra fuera de ventana/free-entry, gratis dentro |
| Reportar venta (`capi-send.js` → Meta Conversions API) | no es mensaje de WhatsApp | Nunca cobra, sea con `ctwa_clid` o el modo manual `system_generated` |
| OTP de login (`login.js`) | texto libre | Gratis si el vendedor escribió al número hace <24h; con TOTP app, cero mensajes por WhatsApp |

## Recomendación por escenario COD

- **Lima (cierra en ≤3 días):** no requiere cambios — la bienvenida
  automática ya abre el free entry point de 72h, y mientras los
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
poco es la **ventana** (24 h desde el último mensaje del cliente; 72 h si
vino de anuncio). Si algo "duró unas horas", no era una plantilla aprobada
(p. ej. un mensaje de ausencia o de bienvenida de la app WhatsApp Business).

Crear una: WhatsApp Manager → **Administrar plantillas** → Crear plantilla →
categoría **Utilidad** → idioma Español → cuerpo con variables {{1}}, {{2}}
→ (opcional) botón de respuesta rápida → Enviar. Suele aprobarse en minutos.
El nombre va en `PLANTILLA_ENVIO` (wrangler.jsonc).
