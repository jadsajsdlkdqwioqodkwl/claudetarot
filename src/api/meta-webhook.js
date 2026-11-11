/**
 * Webhook de Facebook (object "page") e Instagram (object "instagram") para responder comentarios solos
 * (dueño, 2026-11-11; lógica en src/lib/redes.js). Va aparte del de WhatsApp para no mezclar los dos flujos.
 *
 * GET  /api/meta/webhook → verificación de Meta (hub.verify_token = WHATSAPP_VERIFY_TOKEN(_2) o META_VERIFY_TOKEN).
 * POST /api/meta/webhook → firma X-Hub-Signature-256 (secreto de la app; ver firmaValida) y responde 200 al toque;
 *                          lo demás corre después (Meta reintenta si tarda).
 */
import { firmaValida } from "../lib/whatsapp.js";
import { procesarWebhookRedes, envRedes } from "../lib/redes.js";

export async function onRequestGet({ request, env: envBase }) {
  const env = await envRedes(envBase);
  const url = new URL(request.url);
  const tokens = [env.WHATSAPP_VERIFY_TOKEN, env.WHATSAPP_VERIFY_TOKEN_2, env.META_VERIFY_TOKEN].filter(Boolean);
  if (url.searchParams.get("hub.mode") === "subscribe" && tokens.includes(url.searchParams.get("hub.verify_token"))) {
    return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Token de verificación inválido.", { status: 403 });
}

export async function onRequestPost({ request, env: envBase, waitUntil }) {
  const env = await envRedes(envBase);
  const crudo = await request.text();
  if (!(await firmaValida(env, crudo, request.headers.get("X-Hub-Signature-256")))) return new Response("Firma inválida.", { status: 401 });
  let cuerpo;
  try { cuerpo = JSON.parse(crudo); } catch { return new Response("JSON inválido.", { status: 400 }); }
  const trabajo = procesarWebhookRedes(env, cuerpo).catch((err) => console.error("Webhook redes:", err.message));
  if (waitUntil) waitUntil(trabajo); else await trabajo;
  return new Response("ok", { status: 200 });
}
