-- Aplicada a mano vía D1 MCP el 2026-09-29.
-- Igual que quick_replies.orden_versiones (0037), para los pasos de la
-- bienvenida: el orden de sus versiones y cuál es la predeterminada (la
-- primera), sin cerrar la prueba. NULL = el CRM sortea.
ALTER TABLE welcome_steps ADD COLUMN orden_versiones TEXT;
