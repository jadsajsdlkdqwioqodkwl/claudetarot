-- Se quita la presencia en vivo ("Fulana también está viendo este chat") —
-- costaba un heartbeat constante y era puramente cosmético.
DROP TABLE IF EXISTS presence;

-- La estrella deja de ser "marcar seguimiento" (ya hay seguimientos
-- programados de verdad, con fecha y hora) y pasa a significar "reclamar
-- este chat" en todos lados — la columna vieja queda sin usar, no hace daño
-- dejarla.

-- Comisión compartida: quién más trabajó este chat/venta aparte de quien lo
-- reclamó — se llena solo la primera vez que OTRA persona (no el dueño)
-- entra al chat, sin que nadie tenga que tocar un botón aparte.
ALTER TABLE conversations ADD COLUMN shared_with TEXT;
