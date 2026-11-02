-- Respuestas rápidas: cuántas veces se mandaron desde el chat (ordena «según uso»).
-- Se aplica a mano en D1 (`claudetarot-crm`). Sin esta columna el CRM sigue funcionando y ordena por número.
ALTER TABLE quick_replies ADD COLUMN usos INTEGER NOT NULL DEFAULT 0;
