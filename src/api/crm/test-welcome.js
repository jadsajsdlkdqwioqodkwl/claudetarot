/**
 * POST /api/crm/test-welcome — { wa_id } → SOLO ADMIN.
 *
 * Marca ese contacto como si hubiera llegado desde un anuncio "Click to
 * WhatsApp" (rellena ctwa_clid/ad_source_type con datos de prueba, visibles
 * en el panel de detalle con la etiqueta "Simulado") y manda ahí mismo toda
 * la secuencia de bienvenida configurada (welcome_sequence), un paso detrás
 * del otro.
 *
 * WhatsApp igual exige la ventana de 24h: el número tiene que haberte
 * escrito antes (mándate un mensaje de prueba a ti mismo si hace falta).
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { mandarSecuenciaBienvenida } from "../../lib/crm-welcome-sequence.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const waId = String(payload?.wa_id || "").replace(/\D/g, "");
  if (waId.length < 10) return json({ error: "WhatsApp inválido." }, 422);

  const contacto = await env.CRM_DB.prepare(
    `SELECT c.id AS contact_id, conv.id AS conversation_id
     FROM contacts c JOIN conversations conv ON conv.contact_id = c.id
     WHERE c.wa_id = ?`
  )
    .bind(waId)
    .first();
  if (!contacto) {
    return json({ error: "Ese número no tiene ninguna conversación todavía — mándate un WhatsApp de prueba a ti mismo primero, así se abre la ventana de 24h." }, 404);
  }

  const { results: pasos } = await env.CRM_DB.prepare("SELECT id FROM welcome_sequence").all();
  if (!pasos.length) {
    return json({ error: "Todavía no armaste la secuencia de bienvenida — agrega al menos una respuesta rápida." }, 400);
  }

  // Marca el chat como "venido de un anuncio" de verdad en la base, para
  // que el panel de detalle lo muestre — así se ve simulado tal como se
  // vería uno real, no solo se manda el mensaje.
  await env.CRM_DB.prepare(
    `UPDATE contacts SET
       ctwa_clid = ?,
       ad_source_type = 'Simulado (prueba manual)',
       ad_headline = 'Prueba de bienvenida',
       ad_body = ?
     WHERE id = ?`
  )
    .bind(`SIMULADO-${Date.now()}`, `Marcado por ${agent?.displayName || agent?.username || "admin"} para probar`, contacto.contact_id)
    .run();

  try {
    const cantidad = await mandarSecuenciaBienvenida(
      env,
      contacto.conversation_id,
      waId,
      `Prueba de bienvenida (${agent?.displayName || agent?.username})`
    );
    return json({ ok: true, pasos_mandados: cantidad });
  } catch (err) {
    return json({ error: `WhatsApp rechazó el envío: ${err.message}` }, 502);
  }
}

export const onRequestPost = conAdmin(post);
