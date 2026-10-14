-- Comisiones quincenales de las asesoras: ajuste manual de quién se lleva cada venta
-- (el cálculo normal sale solo de la estrella: dueña del chat + quien la comparte).
-- Se aplica a mano: wrangler d1 execute <base> --remote --file=migrations/0056_comisiones_y_danitza.sql
CREATE TABLE IF NOT EXISTS comision_ajustes (
  capi_event_id INTEGER PRIMARY KEY REFERENCES capi_events(id),
  modo TEXT NOT NULL,            -- 'dueno' (100 % a la responsable) o 'mitad' (50/50 con la ayudante)
  responsable TEXT,              -- quien cerró la venta
  ayudante TEXT,                 -- quien resolvió una objeción o ayudó a cerrar
  nota TEXT,
  por TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Danitza pasa a administradora (2026-10-14, pedido del dueño).
UPDATE agents SET role = 'admin' WHERE lower(username) = 'danitza';
