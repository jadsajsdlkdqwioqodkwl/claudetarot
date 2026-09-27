-- Seguimiento que se manda igual aunque el cliente (o nosotros) escribamos
-- antes: no lo cancela cancelarSeguimientosPendientes.
ALTER TABLE scheduled_messages ADD COLUMN mandar_siempre INTEGER NOT NULL DEFAULT 0;
