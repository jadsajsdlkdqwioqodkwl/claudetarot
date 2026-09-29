-- Seguimiento de respuesta rápida en SECUENCIA: hasta 4 mensajes si el
-- cliente no responde, cada uno `horas` después del anterior, con texto y/o
-- un archivo. JSON [{ "horas": 4, "body": "...", "media_key": "...",
-- "media_type": "image", "media_mime": "image/jpeg" }]. Si está vacío, se usa
-- followup_body/followup_hours como antes (un solo seguimiento).
ALTER TABLE quick_replies ADD COLUMN followup_pasos TEXT;
