/**
 * Voz de la tienda (ElevenLabs, src/lib/elevenlabs.js):
 *   GET  /api/crm/voz → { disponible } (el CRM muestra «Texto a voz» y «Cambiar voz» solo si está configurado)
 *   POST /api/crm/voz  JSON { texto }          → texto a voz
 *   POST /api/crm/voz  multipart { file }      → cambiar la voz de una nota grabada
 * Las dos guardan el resultado en R2 (audio/ogg) y responden { media_key, type: "audio" }: la asesora lo escucha y lo manda
 * por el camino normal (POST /api/crm/messages { media_type: "audio" } → sale como nota de voz). Nada sale solo.
 */
import { conAuth } from "../../lib/crm-auth.js";
import { textoAVoz, cambiarVoz, vozDisponible } from "../../lib/elevenlabs.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function get({ env }) {
  return json({ disponible: vozDisponible(env) });
}

async function post({ request, env }) {
  if (!vozDisponible(env)) return json({ error: "La voz de la tienda no está configurada (falta la clave o la voz de ElevenLabs)." }, 503);
  if (!env.CRM_MEDIA) return json({ error: "El almacenamiento de archivos no está configurado." }, 503);
  let bytes;
  try {
    if ((request.headers.get("Content-Type") || "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!file || typeof file === "string") return json({ error: "Falta el audio." }, 400);
      if (file.size > 16 * 1024 * 1024) return json({ error: "El audio pesa más de 16 MB." }, 413);
      bytes = await cambiarVoz(env, file);
    } else {
      const p = await request.json().catch(() => null);
      bytes = await textoAVoz(env, p?.texto);
    }
  } catch (err) {
    return json({ error: err.message }, 502);
  }
  const key = `chat/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.ogg`;
  await env.CRM_MEDIA.put(key, bytes, { httpMetadata: { contentType: "audio/ogg" }, customMetadata: { originalName: "nota-de-voz.ogg" } });
  return json({ ok: true, media_key: key, mime: "audio/ogg", type: "audio" });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
