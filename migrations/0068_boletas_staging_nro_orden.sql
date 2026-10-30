-- Agrega número de orden del courier a boletas_staging para detectar duplicados.
-- La Routine extrae el NRO ORDEN de la imagen y lo guarda al procesar cada boleta.
ALTER TABLE boletas_staging ADD COLUMN nro_orden TEXT;
CREATE INDEX IF NOT EXISTS idx_boletas_staging_nro_orden ON boletas_staging(nro_orden);
