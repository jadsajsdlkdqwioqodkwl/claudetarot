-- De qué respuesta rápida salió un mensaje enviado desde el chat: así el CRM
-- muestra el chip "Reactivar seguimiento" en esa burbuja.
ALTER TABLE messages ADD COLUMN quick_reply_id INTEGER REFERENCES quick_replies(id);
