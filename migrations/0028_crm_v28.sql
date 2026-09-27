-- Catálogo programado: un seguimiento (suelto o paso de secuencia) puede
-- mandar el catálogo completo (catalogo = '*') o un producto (su
-- retailer_id). catalogo_nombre es solo para mostrarlo en el CRM.
ALTER TABLE scheduled_messages ADD COLUMN catalogo TEXT;
ALTER TABLE scheduled_messages ADD COLUMN catalogo_nombre TEXT;
ALTER TABLE followup_sequence_steps ADD COLUMN catalogo TEXT;
ALTER TABLE followup_sequence_steps ADD COLUMN catalogo_nombre TEXT;
