-- Finanzas del negocio (2026-10-19): libro de pedidos por courier, gasto de anuncios por día y otros gastos.
-- Pensado para varios negocios: todo lleva `negocio` ('tarot' hoy; otro negocio = otra fila en fin_negocios).
-- Se aplica a mano: wrangler d1 execute <base> --remote --file=migrations/0061_finanzas.sql

CREATE TABLE IF NOT EXISTS fin_negocios (
  negocio TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'PEN',
  reglas TEXT,                      -- JSON que pisa los valores de fábrica de src/lib/finanzas.js
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO fin_negocios (negocio, nombre) VALUES ('tarot', 'Tarot Store Perú');

-- Un pedido por fila, venga del reporte de Dinsides, de capturas de Shalom/Olva o de Lima.
-- `clave` hace que volver a cargar el mismo reporte no duplique nada.
CREATE TABLE IF NOT EXISTS fin_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio TEXT NOT NULL DEFAULT 'tarot',
  clave TEXT NOT NULL UNIQUE,       -- negocio|courier|guía  (o negocio|courier|whatsapp|fecha_venta)
  courier TEXT NOT NULL,            -- dinsides | shalom | olva | lima
  ref TEXT,                         -- guía / orden / código TS-…
  whatsapp TEXT,
  cliente TEXT,
  asesora TEXT,
  fecha_venta TEXT,                 -- AAAA-MM-DD (día de Lima)
  fecha_cierre TEXT,                -- día en que se entregó/cobró o se rechazó
  estado TEXT NOT NULL DEFAULT 'pendiente', -- completado | rechazado | pendiente | devuelto (devuelto no cuenta en nada)
  unidades INTEGER NOT NULL DEFAULT 1,      -- kits que llevó (el costo del producto va por unidad)
  valor REAL NOT NULL DEFAULT 0,    -- lo que vale el producto para el cliente (sin envío)
  envio_costo REAL NOT NULL DEFAULT 0, -- lo que el courier le cobra al negocio (Shalom: 0, lo paga el cliente)
  nota TEXT,
  fuente TEXT,                      -- de dónde entró (archivo, captura, scrape)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fin_pedidos_cierre ON fin_pedidos(negocio, fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_fin_pedidos_venta ON fin_pedidos(negocio, fecha_venta);

-- Gasto de anuncios por día y campaña (lo trae la Routine con el conector de Meta Ads).
CREATE TABLE IF NOT EXISTS fin_ads (
  negocio TEXT NOT NULL DEFAULT 'tarot',
  fecha TEXT NOT NULL,
  campana_id TEXT NOT NULL,
  campana TEXT,
  gasto REAL NOT NULL DEFAULT 0,
  impresiones INTEGER NOT NULL DEFAULT 0,
  clics INTEGER NOT NULL DEFAULT 0,
  conversaciones INTEGER NOT NULL DEFAULT 0, -- chats de WhatsApp iniciados que cuenta Meta
  compras INTEGER NOT NULL DEFAULT 0,        -- compras que Meta cree que hubo
  valor_compras REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (negocio, fecha, campana_id)
);

-- Otros gastos (herramientas, empaque, sueldos fijos…).
CREATE TABLE IF NOT EXISTS fin_gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio TEXT NOT NULL DEFAULT 'tarot',
  clave TEXT NOT NULL UNIQUE,
  fecha TEXT NOT NULL,
  categoria TEXT NOT NULL,
  concepto TEXT,
  monto REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_fecha ON fin_gastos(negocio, fecha);
