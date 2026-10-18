-- «Atendido» (casilla en la bandeja y en el chat): la vendedora marca que ya vio el último mensaje del
-- cliente aunque no responda. La etiqueta «Falta respuesta» (último mensaje del cliente sin contestar)
-- se quita sola y vuelve cuando el cliente escribe otra vez (atendido_at < last_inbound_at).
ALTER TABLE conversations ADD COLUMN atendido_at TEXT;
-- Última vez que el cron subió este chat a la bandeja por tener un mensaje del cliente sin respuesta.
ALTER TABLE conversations ADD COLUMN reflotada_resp_at TEXT;
