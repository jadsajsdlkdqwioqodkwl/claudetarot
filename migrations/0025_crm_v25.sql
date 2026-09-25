-- Avisos por Telegram para cada asesora, además de (o en vez de) la push
-- del navegador. `notify_channel`: 'push' (como hasta ahora), 'telegram' o
-- 'ambos'. `telegram_chat_id` se llena al vincular con /start <código> en el
-- bot; `telegram_link_code` es ese código mientras no se usa.
ALTER TABLE agents ADD COLUMN notify_channel TEXT NOT NULL DEFAULT 'push';
ALTER TABLE agents ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE agents ADD COLUMN telegram_link_code TEXT;

-- Último aviso por Telegram de cada chat (ms): si el cliente manda varios
-- mensajes seguidos sale uno solo, como el `tag` que agrupa las push.
ALTER TABLE conversations ADD COLUMN telegram_notified_at INTEGER;
