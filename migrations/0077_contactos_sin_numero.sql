-- 2026-11-10 · Clientes con «nombre de usuario» de WhatsApp: Meta no manda su número, solo su id de negocio (BSUID).
-- user_id = ese id (viene en TODOS los mensajes, con o sin número); username = su @usuario si tiene.
-- payload = el mensaje entero que el webhook no pudo procesar, para poder recuperarlo.
ALTER TABLE contacts ADD COLUMN user_id TEXT;
ALTER TABLE contacts ADD COLUMN username TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
ALTER TABLE webhook_errores ADD COLUMN payload TEXT;
