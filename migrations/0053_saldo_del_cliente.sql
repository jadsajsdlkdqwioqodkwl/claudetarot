-- Saldo que le falta pagar al cliente (texto libre, ej. "S/ 69"), lo escribe cualquiera del equipo en el panel del chat.
ALTER TABLE contacts ADD COLUMN saldo TEXT;
