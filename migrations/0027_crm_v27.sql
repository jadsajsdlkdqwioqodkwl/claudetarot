-- Seguimiento automático de una respuesta rápida: si una asesora la manda y
-- el cliente no contesta, `followup_hours` después se manda `followup_body`.
-- Se enciende/apaga para todas con el ajuste `quick_followup_auto`.
ALTER TABLE quick_replies ADD COLUMN followup_body TEXT;
ALTER TABLE quick_replies ADD COLUMN followup_hours INTEGER;
