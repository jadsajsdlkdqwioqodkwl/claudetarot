-- Secuencia de una respuesta rápida: otras respuestas rápidas que salen detrás, cada una a los
-- N segundos de la anterior. JSON [{ "id": 12, "segundos": 2 }, …]. NULL = sin configurar (Lima 1 y
-- Provincia 1 usan entonces su 2 y 3 a los 2 s); "[]" = sin secuencia.
-- Aplicar a mano: wrangler d1 execute CRM --remote --file=migrations/0072_quick_replies_secuencia.sql
ALTER TABLE quick_replies ADD COLUMN secuencia TEXT;
