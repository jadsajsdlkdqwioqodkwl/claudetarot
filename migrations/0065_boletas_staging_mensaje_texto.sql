-- Agrega el mensaje de despacho pre-calculado por la Routine.
-- Cuando la ventana está cerrada al procesar la boleta, la Routine guarda aquí
-- el texto completo (courier, nombre, saldo, links, códigos) para que el Worker
-- lo mande automáticamente cuando el cliente responda al botón.
ALTER TABLE boletas_staging ADD COLUMN mensaje_texto TEXT;
