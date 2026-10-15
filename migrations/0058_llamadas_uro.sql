-- Lista de llamadas de URO (sin Claude ni artifacts: la lee la asesora en el CRM).
-- Se aplica a mano ANTES del deploy:
--   npx wrangler d1 execute claudetarot-crm --remote --file=migrations/0058_llamadas_uro.sql
-- Una fila por WhatsApp. La Routine (asesor-llamadas-uro) escribe los datos del chat
-- con POST /api/asesor/llamadas-uro; el check (llamada*) lo marca la asesora en
-- /llamadas-uro/ y ese upsert NUNCA lo pisa (ver src/api/llamadas-uro.js).
CREATE TABLE IF NOT EXISTS llamadas_uro (
  wa TEXT PRIMARY KEY,
  nombre TEXT,
  telefono TEXT,
  interes TEXT,
  primer_contacto TEXT,
  ultimo_cliente TEXT,
  anuncio TEXT,
  asesora TEXT,
  pedido_mencionado INTEGER NOT NULL DEFAULT 0,
  resumen TEXT,
  speech TEXT,
  actualizado TEXT,
  llamada INTEGER NOT NULL DEFAULT 0,
  llamada_fecha TEXT,
  llamada_por TEXT,
  creada TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS llamadas_uro_ultimo ON llamadas_uro (ultimo_cliente);
