-- Índice para "último mensaje de cada chat" y "últimos 50 mensajes de un
-- chat": con (conversation_id, created_at) D1 recorría todos los mensajes
-- del chat y los ordenaba por id — las filas leídas crecían con el
-- historial (el plan gratis de D1 tiene tope de filas leídas por día).
-- Con (conversation_id, id) es una búsqueda directa. Ya aplicado en
-- producción; IF NOT EXISTS lo hace repetible.
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conversation_id, id);
