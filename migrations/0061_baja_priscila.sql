-- Priscila dejó de trabajar con Tarot Store (2026-10-20): se desactiva su cuenta.
-- No se borra: sus chats, ventas y comisiones siguen guardados con su nombre, y
-- como la cuenta queda inactiva su sesión se corta sola (crm-auth.js exige active = 1).
-- Se aplica a mano, y antes conviene ver el usuario exacto:
--   wrangler d1 execute claudetarot-crm --remote --command "SELECT id, username, display_name, active FROM agents"
--   wrangler d1 execute claudetarot-crm --remote --file=migrations/0061_baja_priscila.sql
UPDATE agents SET active = 0 WHERE lower(username) LIKE 'priscila%' OR lower(display_name) LIKE 'priscila%';
