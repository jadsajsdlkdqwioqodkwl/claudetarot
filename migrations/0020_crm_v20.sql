-- Suscripciones de notificaciones push del navegador (Web Push estándar,
-- no Firebase/OneSignal) — una fila por dispositivo/navegador donde una
-- vendedora activó las notificaciones. `agent_name` es quién es, para poder
-- mandarle solo lo suyo si el chat ya está asignado a alguien.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
