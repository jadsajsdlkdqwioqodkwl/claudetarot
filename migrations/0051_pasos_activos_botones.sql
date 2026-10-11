-- Poder apagar un paso sin borrarlo (activo) y ponerle botones de respuesta (botones, JSON) a la bienvenida
-- y a las secuencias de seguimiento.
-- followup_sequence_steps.botones ya existía en D1 de producción (migración 0042 de otra rama, aplicada a mano);
-- si tu base no la tiene, descomenta la primera línea.
-- ALTER TABLE followup_sequence_steps ADD COLUMN botones TEXT;
-- YA APLICADAS en producción el 2026-10-11:
ALTER TABLE followup_sequence_steps ADD COLUMN activo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE welcome_steps ADD COLUMN activo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE welcome_steps ADD COLUMN botones TEXT;
