-- Aplicada vía D1 MCP el 2026-10-05.
-- · conversations.hidden: chat oculto de la lista (1). Vuelve solo a la lista
--   (0) cuando el cliente escribe otra vez (registrarMensajeEntrante).
-- · contacts.blocked: contacto bloqueado (1). También se bloquea en WhatsApp
--   (block_users de la Cloud API); sus chats no salen en la lista ni avisan.
ALTER TABLE conversations ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
