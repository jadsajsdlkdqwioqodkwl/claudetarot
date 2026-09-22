/**
 * GET /api/crm/media?key=<clave-r2>            — sirve un archivo ya guardado en R2.
 * GET /api/crm/media?message_id=<id>            — sirve la foto/video de un mensaje
 *   entrante. La primera vez lo descarga de la WhatsApp Cloud API (la URL de
 *   Meta expira en minutos) y lo guarda en R2 para las siguientes veces.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { descargarMedia } from "../../lib/whatsapp.js";
import { guardarMediaKey } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function servirDesdeR2(env, key) {
  const obj = await env.CRM_MEDIA.get(key);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=86400"
    }
  });
}

async function handler({ request, env }) {
  if (!env.CRM_MEDIA) return json({ error: "Almacenamiento no configurado." }, 503);

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const messageId = url.searchParams.get("message_id");

  if (key) {
    const res = await servirDesdeR2(env, key);
    return res || json({ error: "No encontrado." }, 404);
  }

  if (!messageId) return json({ error: "Falta key o message_id." }, 400);

  const msg = await env.CRM_DB.prepare("SELECT * FROM messages WHERE id = ?").bind(Number(messageId)).first();
  if (!msg) return json({ error: "No encontrado." }, 404);

  if (msg.media_key) {
    const res = await servirDesdeR2(env, msg.media_key);
    if (res) return res;
  }

  if (!msg.media_id) return json({ error: "Este mensaje no tiene archivo adjunto." }, 404);

  let blob, mime;
  try {
    ({ blob, mime } = await descargarMedia(env, msg.media_id));
  } catch (err) {
    console.error("Descargar media:", err.message);
    return json({ error: "No se pudo descargar el archivo de WhatsApp." }, 502);
  }

  const key2 = `wa/${msg.media_id}`;
  await env.CRM_MEDIA.put(key2, await blob.arrayBuffer(), { httpMetadata: { contentType: mime } });
  await guardarMediaKey(env.CRM_DB, msg.id, key2);

  const res = await servirDesdeR2(env, key2);
  return res || json({ error: "No se pudo guardar el archivo." }, 500);
}

export const onRequestGet = conAuth(handler);
