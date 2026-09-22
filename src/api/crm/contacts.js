/**
 * PATCH /api/crm/contacts — { contact_id, name?, stage?, notes?, tags? }
 * Actualiza el contacto: la etapa del pipeline, el nombre puesto por el
 * vendedor (distinto del `profile_name` que manda WhatsApp), notas y tags.
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const ETAPAS = new Set(["nuevo", "contactado", "negociando", "ganado", "perdido"]);

async function patch({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const contactId = Number(payload?.contact_id);
  if (!contactId) return json({ error: "Falta contact_id." }, 400);

  const campos = [];
  const valores = [];

  if (typeof payload.name === "string") {
    campos.push("name = ?");
    valores.push(payload.name.trim().slice(0, 120));
  }
  if (typeof payload.stage === "string") {
    if (!ETAPAS.has(payload.stage)) return json({ error: "Etapa inválida." }, 422);
    campos.push("stage = ?");
    valores.push(payload.stage);
  }
  if (typeof payload.notes === "string") {
    campos.push("notes = ?");
    valores.push(payload.notes.slice(0, 4000));
  }
  if (typeof payload.tags === "string") {
    campos.push("tags = ?");
    valores.push(payload.tags.slice(0, 300));
  }

  if (!campos.length) return json({ error: "Nada que actualizar." }, 400);

  campos.push("updated_at = datetime('now')");
  valores.push(contactId);

  await env.CRM_DB.prepare(`UPDATE contacts SET ${campos.join(", ")} WHERE id = ?`)
    .bind(...valores)
    .run();

  const contacto = await env.CRM_DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(contactId).first();
  return json({ ok: true, contact: contacto });
}

export const onRequestPatch = conAuth(patch);
