-- "Olvidé mi contraseña" desde el login, sin sesión activa: manda un código
-- por WhatsApp al número registrado del vendedor, igual que el 2FA del login.

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0
);
