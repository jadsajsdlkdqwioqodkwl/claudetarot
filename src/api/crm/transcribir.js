/**
 * GET /api/crm/transcribir?message_id=<id> → { texto }
 * Pasa a texto el audio de un mensaje (el botón «Transcribir» de la burbuja).
 * Usa Whisper de Workers AI (binding `AI` de wrangler.jsonc), no la API de Claude.
 * No guarda nada: la transcripción vive en la pantalla de quien la pidió.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { servirMensaje } from "./media.js";

const MODELO = "@cf/openai/whisper-large-v3-turbo";
const MAX_BYTES = 8 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

function aBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function get({ request, env }) {
  if (!env.AI) return json({ error: "La transcripción todavía no está activada en el servidor." }, 503);
  const messageId = Number(new URL(request.url).searchParams.get("message_id"));
  if (!messageId) return json({ error: "Falta message_id." }, 400);
  const msg = await env.CRM_DB.prepare("SELECT type FROM messages WHERE id = ?").bind(messageId).first();
  if (!msg) return json({ error: "No encontrado." }, 404);
  if (msg.type !== "audio") return json({ error: "Ese mensaje no es un audio." }, 400);

  const archivo = await servirMensaje(env, messageId);
  if (!archivo.ok) return archivo;
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (bytes.length > MAX_BYTES) return json({ error: "El audio es demasiado largo para transcribirlo." }, 413);

  try {
    const r = await env.AI.run(MODELO, { audio: aBase64(bytes), language: "es" });
    return json({ texto: String(r?.text || "").trim() });
  } catch (err) {
    console.error("Transcribir:", err.message);
    return json({ error: "No se pudo transcribir el audio." }, 502);
  }
}

export const onRequestGet = conAuth(get);
