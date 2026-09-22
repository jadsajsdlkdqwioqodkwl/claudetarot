-- 2FA por app authenticator (TOTP), por vendedor — alternativa al código
-- por WhatsApp: gratis siempre, no depende de que el vendedor le haya
-- escrito al número del negocio en las últimas 24h, y cada quien la activa
-- sola desde su cuenta.

ALTER TABLE agents ADD COLUMN totp_secret TEXT;
ALTER TABLE agents ADD COLUMN totp_confirmed INTEGER NOT NULL DEFAULT 0;

-- Para que login-verify sepa si valida el código contra login_challenges.code
-- (WhatsApp) o contra agents.totp_secret (TOTP).
ALTER TABLE login_challenges ADD COLUMN method TEXT NOT NULL DEFAULT 'whatsapp';
