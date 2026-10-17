-- Las recomendaciones del asesor (asesor_sugerencias tipo 'seguimiento') suben a la bandeja de a una,
-- cada 10 minutos (reflotarSugerencia en crm-sugerencias.js): aquí se anota cuándo subió cada una.
ALTER TABLE asesor_sugerencias ADD COLUMN reflotada_at TEXT;
