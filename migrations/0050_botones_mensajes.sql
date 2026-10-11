-- Botones de respuesta (hasta 3) en mensajes de texto: seguimientos programados y respuestas rápidas.
-- JSON con las etiquetas, ej. ["Sí, sepárelo","Tengo una duda"]. NULL = sin botones.
-- scheduled_messages.botones ya existía en D1 de producción (TEXT, vacía); si no existe en tu base, descomenta:
-- ALTER TABLE scheduled_messages ADD COLUMN botones TEXT;
-- YA APLICADA en producción el 2026-10-11 (solo esta):
ALTER TABLE quick_replies ADD COLUMN botones TEXT;
