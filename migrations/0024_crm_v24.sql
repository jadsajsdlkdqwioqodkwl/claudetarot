-- Etiquetas del embudo en cada chat, para filtrar la lista: "contact"
-- (conversación iniciada, automático), "lead" (botón Lead) y "purchase"
-- (botón de venta). Separadas por espacio.
ALTER TABLE conversations ADD COLUMN meta_tags TEXT;

-- Relleno con lo que ya se había reportado a Meta.
UPDATE conversations SET meta_tags = NULLIF(trim(replace(replace(
  CASE WHEN EXISTS (SELECT 1 FROM capi_events e WHERE e.conversation_id = conversations.id AND e.event_name IN ('LeadSubmitted', 'Contact')) THEN 'contact' ELSE '' END || ' ' ||
  CASE WHEN EXISTS (SELECT 1 FROM capi_events e WHERE e.conversation_id = conversations.id AND e.event_name IN ('QualifiedLead', 'Lead', 'InitiateCheckout')) THEN 'lead' ELSE '' END || ' ' ||
  CASE WHEN EXISTS (SELECT 1 FROM capi_events e WHERE e.conversation_id = conversations.id AND e.event_name = 'Purchase') THEN 'purchase' ELSE '' END,
  '  ', ' '), '  ', ' ')), '');
