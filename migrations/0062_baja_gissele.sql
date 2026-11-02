-- Gissele dejó de trabajar con Tarot Store (2026-11-02): se desactiva su cuenta.
-- No se borra: sus chats, ventas y comisiones siguen guardados con su nombre, y
-- como la cuenta queda inactiva su sesión se corta sola (crm-auth.js exige active = 1).
-- Se aplica a mano (ya aplicada el 2026-11-02, cuenta id 8):
--   wrangler d1 execute claudetarot-crm --remote --file=migrations/0062_baja_gissele.sql
UPDATE agents SET active = 0 WHERE lower(username) LIKE 'gissele%' OR lower(display_name) LIKE 'gissele%';
