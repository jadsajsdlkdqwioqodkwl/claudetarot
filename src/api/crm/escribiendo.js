/**
 * POST /api/crm/escribiendo — { conversation_id } → { ok, mostrado }
 * «Escribiendo…» EN VIVO: el CRM lo llama mientras la vendedora teclea en el chat (como mucho cada
 * ~20 s). WhatsApp lo muestra hasta 25 s o hasta que llega nuestro mensaje. No manda nada al cliente
 * ni cuesta: es el mismo aviso de antes de cada texto (marca como visto su último mensaje).
 * Respeta los ajustes `escribiendo_vivo` y `sin_visto` (ver crm-send.js).
 */

import { conAuth } from "../../lib/crm-auth.js";
import { escribiendoEnVivo } from "../../lib/crm-send.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function post({ request, env }) {
  const payload = await request.json().catch(() => null);
  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);
  const mostrado = await escribiendoEnVivo(env, conversationId).catch((err) => (console.error("Escribiendo en vivo:", err.message), false));
  return json({ ok: true, mostrado });
}

export const onRequestPost = conAuth(post);
