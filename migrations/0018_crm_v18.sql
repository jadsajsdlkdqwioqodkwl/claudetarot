-- file_name: separa el nombre interno del archivo (para el reporte de
-- Sheets) de la leyenda (`body`/caption) que se ve en el chat — antes, sin
-- caption, el nombre del archivo ("image.png") se guardaba en `body` y por
-- eso aparecía como si fuera un texto del mensaje en nuestra propia vista.
--
-- deleted_at: "eliminar" un mensaje del lado del CRM (no es un recall real
-- de WhatsApp — Meta no ofrece esa API para mensajes de negocio — solo dejar
-- de mostrarlo acá).
--
-- presence: qué vendedora tiene abierto qué chat ahora mismo, para el aviso
-- de "también está viendo este chat". Se limpia sola por antigüedad, no hace
-- falta borrar filas a mano.

ALTER TABLE messages ADD COLUMN file_name TEXT;
ALTER TABLE messages ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS presence (
  conversation_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, agent_name)
);
