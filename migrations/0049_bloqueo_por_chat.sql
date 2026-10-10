-- YA APLICADA en D1 el 2026-10-10.
-- El bloqueo era por persona (contacts.blocked): bloquear a alguien en Tarot Store le escondía también su
-- chat de URO y se perdían sus mensajes. Ahora es por chat (un chat = cliente + número), como el resto.
ALTER TABLE conversations ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
UPDATE conversations SET blocked = 1 WHERE contact_id IN (SELECT id FROM contacts WHERE blocked = 1);
