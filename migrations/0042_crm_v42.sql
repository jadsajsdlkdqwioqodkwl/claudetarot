-- Aplicada a mano vía D1 MCP el 2026-10-02.
-- · scheduled_messages.botones / followup_sequence_steps.botones: hasta 3
--   botones de opciones (JSON, ej. ["Sí, lo quiero","Tengo una duda"]) que
--   salen debajo del texto del seguimiento (mensaje interactivo de WhatsApp,
--   solo dentro de la ventana de 24 h). NULL = texto normal, sin botones.
-- · followup_sequence_steps.template_*: el paso sale como plantilla aprobada
--   (sirve fuera de la ventana de 24 h). template_params: JSON con las
--   variables {{1}}, {{2}}…
ALTER TABLE scheduled_messages ADD COLUMN botones TEXT;
ALTER TABLE followup_sequence_steps ADD COLUMN botones TEXT;
ALTER TABLE followup_sequence_steps ADD COLUMN template_name TEXT;
ALTER TABLE followup_sequence_steps ADD COLUMN template_language TEXT;
ALTER TABLE followup_sequence_steps ADD COLUMN template_params TEXT;
