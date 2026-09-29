-- Secuencias propuestas por el asesor: además del primer mensaje (texto),
-- hasta 3 pasos más que salen solos si el cliente no responde, cada uno
-- `horas` después del anterior. JSON [{ "horas": 4, "texto": "..." }].
ALTER TABLE asesor_sugerencias ADD COLUMN pasos TEXT;
