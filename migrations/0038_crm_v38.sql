-- Aplicada a mano vía D1 MCP el 2026-09-29.
-- Turnos de envío por chat: dos mensajes al mismo chat a la vez (dos Enter
-- seguidos, pegar y mandar rápido, un seguimiento que sale justo cuando la
-- vendedora escribe) salen uno detrás del otro, cada uno con su
-- "escribiendo…" visible. `fin` = ms (epoch) en que sale el último mensaje
-- reservado. Ver pausaEnvio() en src/lib/crm-send.js.
CREATE TABLE IF NOT EXISTS envio_turnos (
  conversation_id INTEGER PRIMARY KEY,
  fin INTEGER NOT NULL
);
