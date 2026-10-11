-- Envío por Olva (marcado a mano por cualquiera del equipo) y killswitch por chat.
ALTER TABLE contacts ADD COLUMN olva INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN pausa_auto INTEGER NOT NULL DEFAULT 0;
