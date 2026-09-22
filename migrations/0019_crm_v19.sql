-- Qué asesora tiene asignado cada chat (y por lo tanto la venta que salga de
-- ahí) — para poder repartir bien y saber a quién darle el crédito o el
-- reclamo. Un chat nace sin asignar (bandeja compartida); cualquiera lo
-- "reclama" con un clic, y solo se puede reasignar a otra persona a propósito.

ALTER TABLE conversations ADD COLUMN assigned_agent TEXT;
