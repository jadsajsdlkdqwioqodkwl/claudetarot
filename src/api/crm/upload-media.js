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

// Lo único que la Cloud API acepta como foto o video de verdad (no como
// documento). webp, heic, gif, etc. los rechaza con (#100) Invalid parameter
// aunque el navegador los deje elegir — por eso se valida acá, no solo por
// el `accept` del input.
const EXTENSION_POR_MIME = {
  "image/jpeg": "jpg", "image/png": "png",
  "video/mp4": "mp4", "video/3gpp": "3gp",
  "application/pdf": "pdf"
};

const IMAGENES_VALIDAS = new Set(["image/jpeg", "image/png"]);
const VIDEOS_VALIDOS = new Set(["video/mp4", "video/3gpp"]);

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

  if (mime.startsWith("image/") && !IMAGENES_VALIDAS.has(mime)) {
    return json({ error: `WhatsApp solo acepta fotos en JPG o PNG (esta es ${mime.replace("image/", "").toUpperCase()}). Conviértela antes de subirla.` }, 415);
  }
  if (mime.startsWith("video/") && !VIDEOS_VALIDOS.has(mime)) {
    return json({ error: `WhatsApp solo acepta video en MP4 (este es ${mime.replace("video/", "").toUpperCase()}). Conviértelo antes de subirlo.` }, 415);
  }

  const ext = EXTENSION_POR_MIME[mime] || "bin";
  const key = `chat/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const nombreOriginal = String(file.name || "").slice(0, 200);

  await env.CRM_MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: mime },
    customMetadata: { originalName: nombreOriginal }
  });

  return json({ ok: true, media_key: key, mime, type: tipoDeMime(mime), original_name: nombreOriginal });
}

export const onRequestPost = conAuth(handler);
