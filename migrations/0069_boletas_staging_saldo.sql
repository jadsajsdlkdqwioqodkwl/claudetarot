-- Agrega columna saldo para que el auto-despacho del webhook pueda aplicar
-- el plan de cobro y las etiquetas correctas tras la ventana de 24 h.
ALTER TABLE boletas_staging ADD COLUMN saldo TEXT;
