-- Respuesta rápida que usa el plan universal de seguimiento (ajuste `seguimiento_universal`)
-- en vez de sus propios pasos. Aplicar a mano: wrangler d1 execute CRM --file=migrations/0071_quick_replies_followup_universal.sql
ALTER TABLE quick_replies ADD COLUMN followup_universal INTEGER NOT NULL DEFAULT 0;
