-- Jennifer pasa a administradora, igual que Danitza (2026-10-20, pedido del dueño).
-- Se aplica a mano: wrangler d1 execute claudetarot-crm --remote --file=migrations/0061_jennifer_admin.sql
-- Alternativa sin consola: CRM -> Equipo (admin) o PATCH /api/crm/agents { id, role: "admin" }.
UPDATE agents SET role = 'admin' WHERE lower(username) = 'jennifer';
