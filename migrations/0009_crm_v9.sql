-- La bienvenida de anuncios usaba las "quick_replies" compartidas (que
-- cualquier vendedor puede crear, editar y borrar desde el chat) para armar
-- sus pasos. Pasa a tener su propio contenido, separado, que solo un admin
-- puede crear — desde un modal propio, no desde el panel de respuestas
-- rápidas de todos.

CREATE TABLE IF NOT EXISTS welcome_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  step_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_welcome_steps_order ON welcome_steps(step_order);

CREATE TABLE IF NOT EXISTS welcome_step_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  welcome_step_id INTEGER NOT NULL REFERENCES welcome_steps(id),
  media_key TEXT NOT NULL,
  media_mime TEXT,
  media_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wsm_step ON welcome_step_media(welcome_step_id);

-- Migra lo que ya hubiera armado en la secuencia vieja, reusando el id de
-- welcome_sequence como id de welcome_steps para no perder la relación con
-- su media sin tener que adivinar por título/orden.
INSERT INTO welcome_steps (id, title, body, step_order, created_at)
  SELECT s.id, q.title, q.body, s.step_order, s.created_at
  FROM welcome_sequence s JOIN quick_replies q ON q.id = s.quick_reply_id;

INSERT INTO welcome_step_media (welcome_step_id, media_key, media_mime, media_type, sort_order)
  SELECT s.id, qrm.media_key, qrm.media_mime, qrm.media_type, qrm.sort_order
  FROM welcome_sequence s
  JOIN quick_replies q ON q.id = s.quick_reply_id
  JOIN quick_reply_media qrm ON qrm.quick_reply_id = q.id;

DROP TABLE welcome_sequence;
