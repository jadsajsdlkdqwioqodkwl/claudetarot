/**
 * POST /api/crm/upload-media — multipart/form-data con campo `file`.
 * Sube el archivo a R2 (binding `CRM_MEDIA`) y devuelve su clave, para usarla
 * después al mandar un mensaje o al guardar una respuesta rápida.
 *
 * No sube a la WhatsApp Cloud API acá: eso se hace recién al enviar de
 * verdad (ver messages.js), porque el media id de WhatsApp expira y un
 * archivo guardado como respuesta rápida se puede usar días después.
 */

import { conAuth } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const MAX_BYTES = 16 * 1024 * 1024; // el límite de WhatsApp para video/documento

const EXTENSION_POR_MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/3gpp": "3gp",
  "application/pdf": "pdf"
};

function tipoDeMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

async function handler({ request, env }) {
  if (!env.CRM_MEDIA) {
    return json({ error: "El almacenamiento de archivos no está configurado (falta el bucket R2)." }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Falta el archivo." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "El archivo pesa más de 16 MB." }, 413);

  const mime = file.type || "application/octet-stream";
  const ext = EXTENSION_POR_MIME[mime] || "bin";
  const key = `chat/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await env.CRM_MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });

  return json({ ok: true, media_key: key, mime, type: tipoDeMime(mime) });
}

export const onRequestPost = conAuth(handler);
