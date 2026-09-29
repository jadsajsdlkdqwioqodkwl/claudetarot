-- Sugerencias que piensan en el cliente, no solo en el texto:
-- · objecion: lo que probablemente frena a este cliente (desconfianza por el
--   adelanto, falta de información, precio, tiempo…), según su chat.
-- · idea: JSON { titulo, texto } — otra opción para la próxima ("pedirle S/10
--   para separarle el kit en promoción hasta que vuelva de viaje, con un
--   regalo"); la vendedora la usa con un toque o la ignora.
-- · tipo 'pregunta': el bot le pregunta al dueño si puede ofrecer algo que no
--   está en docs/negocio.md. La respuesta queda en asesor_memoria y el bot la
--   lee en la próxima corrida.
ALTER TABLE asesor_sugerencias ADD COLUMN objecion TEXT;
ALTER TABLE asesor_sugerencias ADD COLUMN idea TEXT;
ALTER TABLE asesor_sugerencias ADD COLUMN respuesta TEXT;
