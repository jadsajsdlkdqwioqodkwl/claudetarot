-- Envío manual a Meta Conversions API (Click to WhatsApp) por pedido del
-- catálogo, y envíos masivos de texto/plantilla a una lista de números.

ALTER TABLE catalog_orders ADD COLUMN capi_status TEXT;
ALTER TABLE catalog_orders ADD COLUMN capi_sent_at TEXT;

-- Seguimientos programados: ahora también pueden ser una plantilla (hace
-- falta para escribirle a alguien fuera de la ventana de 24h, como en un
-- envío masivo a contactos viejos) en vez de solo texto/media/respuesta
-- rápida. batch_id agrupa los que salieron de un mismo envío masivo.
ALTER TABLE scheduled_messages ADD COLUMN template_name TEXT;
ALTER TABLE scheduled_messages ADD COLUMN template_language TEXT;
ALTER TABLE scheduled_messages ADD COLUMN template_params TEXT;
ALTER TABLE scheduled_messages ADD COLUMN batch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_scheduled_batch ON scheduled_messages(batch_id);
