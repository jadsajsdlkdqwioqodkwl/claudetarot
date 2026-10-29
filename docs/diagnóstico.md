# Diagnóstico del CRM — dónde ver errores y qué hacer

> **Leer al inicio de cualquier sesión donde el dueño reporte mensajes perdidos,
> seguimientos que no salieron, o cualquier fallo de envío.**
> También revisar antes de proponer cambios al flujo de mensajes.

---

## Forma rápida: panel de admin

Abrir el CRM → botón admin → **Estado del sistema**.

- Badge rojo en el botón = hay algo malo.
- La sección muestra alertas, últimos mensajes entrantes fallidos y últimos envíos fallidos.
- Endpoint: `GET /api/crm/salud` (solo admin).

---

## Tablas D1 — queries de diagnóstico

```sql
-- 1. Mensajes entrantes que el webhook recibió pero no pudo guardar
--    (race condition, error de BD, referral malformado, etc.)
SELECT * FROM webhook_errores ORDER BY created_at DESC LIMIT 20;

-- 2. Seguimientos programados que el cron intentó enviar y falló
SELECT * FROM envio_errores ORDER BY created_at DESC LIMIT 20;

-- 3. Seguimientos que quedaron en "fallido" (no se reintentan)
SELECT s.id, s.conversation_id, s.wa_id,
       substr(s.body, 1, 80) AS body,
       s.send_at, s.sent_at, s.created_by, s.template_name
FROM scheduled_messages s
WHERE s.status = 'fallido'
ORDER BY s.sent_at DESC LIMIT 20;

-- 4. Mensajes salientes que Meta reportó como no entregados
SELECT id, conversation_id, wa_message_id,
       substr(body, 1, 80) AS body, created_at
FROM messages
WHERE direction = 'out' AND status = 'failed'
ORDER BY created_at DESC LIMIT 20;

-- 5. Seguimientos atascados en "enviando" (el cron murió a la mitad)
--    El cron los pasa a 'fallido' a los 15 min, pero si no corrió aún:
SELECT * FROM scheduled_messages
WHERE status = 'enviando'
  AND datetime(sent_at) < datetime('now', '-15 minutes');
```

---

## Claves en crm_settings

| Clave | Qué guarda |
|---|---|
| `webhook_ultimo_ok` | Fecha del último mensaje entrante procesado sin error |
| `webhook_ultimo_rechazo` | Último webhook con firma inválida de Meta |
| `webhook_ultimo_error` | Último error al procesar un webhook entrante |
| `ultimo_error_escribiendo` | Último fallo del "escribiendo…" (crm-send.js) |
| `envio_ultimo_error` | Último seguimiento programado que falló al enviar |

```sql
SELECT key, value FROM crm_settings
WHERE key IN ('webhook_ultimo_ok','webhook_ultimo_rechazo',
              'webhook_ultimo_error','ultimo_error_escribiendo',
              'envio_ultimo_error');
```

---

## Archivos de código relevantes

| Archivo | Qué hace |
|---|---|
| `src/api/whatsapp-webhook.js` | Recibe mensajes de Meta; errores → `webhook_errores` |
| `src/lib/crm-cron.js` `procesarSeguimientosVencidos` | Envía seguimientos; errores → `envio_errores` + `crm_settings.envio_ultimo_error` |
| `src/api/crm/salud.js` | Agrega todo y lo expone en `GET /api/crm/salud` |
| `public/crm/app.js` `cargarSalud()` | Panel visual en admin |
| `src/lib/crm-send.js` `avisarErrorEscribiendo()` | Guarda en `crm_settings.ultimo_error_escribiendo` |

---

## Gaps conocidos (errores que todavía NO se loguean)

1. **Bienvenidas automáticas fallidas** — `mandarBienvenidaSiAplica` en `whatsapp-webhook.js` solo hace `console.error`; no va a ninguna tabla.
2. **Envíos manuales fallidos** — el error se muestra en la UI al vendedor pero no se persiste en BD.
3. **Mensajes atascados en `'enviando'` > 15 min** — el cron los pasa a `'fallido'` en `scheduled_messages`, pero NO los inserta en `envio_errores` (ese registro solo se crea cuando hay un error de envío real, no cuando el cron los marca como abandonados).

Estos son candidatos a mejorar en una sesión futura.

---

## Migraciones — aplicar a mano en D1 si no se hizo

```bash
wrangler d1 execute CRM --file=migrations/0066_webhook_errores.sql
wrangler d1 execute CRM --file=migrations/0067_envio_errores.sql
```

---

## Cómo revisar al inicio de sesión (checklist)

1. ¿El dueño reporta mensajes que no llegaron? → query 1 (`webhook_errores`).
2. ¿Seguimientos que no salieron? → queries 2 y 3 (`envio_errores`, `scheduled_messages` fallidos).
3. ¿Mensajes que Meta rechazó? → query 4 (`messages` status=failed).
4. ¿Algo atascado? → query 5 (`enviando` > 15 min).
5. Siempre mirar `crm_settings` para el último error de cada tipo.
