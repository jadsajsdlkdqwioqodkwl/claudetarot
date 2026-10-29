/**
 * POST /api/asesor/mandar — envío directo al cliente desde la Routine de boletas.
 *
 * Excepción autorizada por el dueño (2026-10-29): el despacho de boletas de
 * provincia sale automáticamente, sin pasar por ✨ Sugerencias. Solo se usa
 * desde la Routine de boletas; cualquier otro envío automático sigue yendo
 * por enviar.py con aprobación humana.
 *
 *   { tipo: "texto", conversation_id?, wa_id?, texto }
 *   { tipo: "foto-staging", conversation_id?, wa_id?, staging_id }
 *
 * Se acepta conversation_id O wa_id; si solo viene wa_id, se busca la
 * conversación más reciente de ese contacto.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { mandarTexto, mandarMediaPorId, pausaEnvio } from "../lib/crm-send.js";
import { agregarEtiquetaMeta } from "../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function resolverConversacion(db, conversationId, waId) {
  if (conversationId) {
    const row = await db.prepare(
      "SELECT c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ? LIMIT 1"
    ).bind(conversationId).first();
    return row ? { convId: conversationId, waId: row.wa_id } : null;
  }
  if (waId) {
    const row = await db.prepare(
      "SELECT conv.id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE c.wa_id = ? ORDER BY conv.id DESC LIMIT 1"
    ).bind(waId).first();
    return row ? { convId: row.id, waId } : null;
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);

  const p = await request.json().catch(() => null);
  if (!p?.tipo) return json({ error: "Falta tipo." }, 400);

  let waIdNorm = String(p.wa_id || "").replace(/\D/g, "") || null;
  // Número peruano de 9 dígitos: agregar código de país
  if (waIdNorm?.length === 9) waIdNorm = "51" + waIdNorm;
  const conv = await resolverConversacion(
    env.CRM_DB,
    Number(p.conversation_id) || null,
    waIdNorm
  );
  if (!conv) return json({ error: "No encontré la conversación." }, 404);

  try {
    if (p.tipo === "texto") {
      if (!p.texto) return json({ error: "Falta texto." }, 400);
      await pausaEnvio(env, conv.convId);
      const waMessageId = await mandarTexto(env, conv.convId, conv.waId, String(p.texto), "asesor-boletas");
      await agregarEtiquetaMeta(env.CRM_DB, conv.convId, "bot_boleta").catch(() => {});
      return json({ ok: true, wa_message_id: waMessageId });
    }

    if (p.tipo === "foto-staging") {
      const stagingId = Number(p.staging_id);
      if (!stagingId) return json({ error: "Falta staging_id." }, 400);
      const item = await env.CRM_DB.prepare(
        "SELECT media_id, media_mime FROM boletas_staging WHERE id = ? LIMIT 1"
      ).bind(stagingId).first();
      if (!item?.media_id) return json({ error: "No encontré esa foto en staging." }, 404);
      const waMessageId = await mandarMediaPorId(env, conv.convId, conv.waId, item.media_id, item.media_mime, "asesor-boletas");
      await agregarEtiquetaMeta(env.CRM_DB, conv.convId, "bot_boleta").catch(() => {});
      return json({ ok: true, wa_message_id: waMessageId });
    }

    if (p.tipo === "etiqueta") {
      const etiqueta = String(p.etiqueta || "").trim();
      if (!etiqueta) return json({ error: "Falta etiqueta." }, 400);
      await agregarEtiquetaMeta(env.CRM_DB, conv.convId, etiqueta);
      return json({ ok: true });
    }

    return json({ error: "tipo inválido (texto | foto-staging | etiqueta)." }, 400);
  } catch (err) {
    console.error("asesor-mandar:", err.message);
    return json({ error: err.message }, 502);
  }
}
