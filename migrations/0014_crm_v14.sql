-- Responder a un mensaje específico (como WhatsApp) y reaccionar con emoji
-- desde cualquiera de los dos lados.

ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER REFERENCES messages(id);
ALTER TABLE messages ADD COLUMN client_reaction TEXT;
ALTER TABLE messages ADD COLUMN agent_reaction TEXT;
