-- Eventos a Meta más allá de la venta: conversación iniciada (automático al
-- llegar un contacto de anuncio) e intención de compra (botón del carrito).
-- mode: "anuncio" (dataset de la WABA, con ctwa_clid) o "manual"
-- (system_generated). error: motivo del rechazo, o por qué un contacto con
-- ctwa_clid terminó yendo como manual.
ALTER TABLE capi_events ADD COLUMN event_name TEXT NOT NULL DEFAULT 'Purchase';
ALTER TABLE capi_events ADD COLUMN mode TEXT;
ALTER TABLE capi_events ADD COLUMN error TEXT;
