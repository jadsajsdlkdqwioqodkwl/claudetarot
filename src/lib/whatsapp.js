/**
 * Cliente mínimo de la WhatsApp Cloud API (Graph API de Meta), sin dependencias.
 *
 * Usa `env.WHATSAPP_TOKEN` (token de sistema/permanente, secret) y
 * `env.WHATSAPP_PHONE_NUMBER_ID` (texto, va en wrangler.jsonc). El número de
 * destino siempre en formato E.164 sin "+" (como lo manda la propia API).
 */

const GRAPH_VERSION = "v21.0";

function graphUrl(env, path) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

async function llamar(env, path, body) {
  const res = await fetch(graphUrl(env, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const texto = await res.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { raw: texto };
  }
  if (!res.ok) {
    const msg = datos?.error?.message || texto || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return datos;
}

/** Manda un mensaje de texto libre. Solo funciona dentro de la ventana de 24h. */
export async function enviarTexto(env, waId, texto) {
  const datos = await llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to: waId,
    type: "text",
    text: { body: texto, preview_url: true }
  });
  return datos.messages?.[0]?.id || null;
}

/** Marca un mensaje entrante como leído (doble check azul). */
export async function marcarLeido(env, waMessageId) {
  try {
    await llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: waMessageId
    });
  } catch (err) {
    console.error("WhatsApp marcarLeido:", err.message);
  }
}

/** Resuelve la URL temporal de un media (foto, audio, documento…) por su id. */
export async function urlDeMedia(env, mediaId) {
  const res = await fetch(graphUrl(env, mediaId), {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }
  });
  if (!res.ok) throw new Error(`No se pudo resolver el media ${mediaId}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Verifica la firma `X-Hub-Signature-256` que manda Meta en cada webhook,
 * con HMAC-SHA256 sobre el cuerpo crudo y `WHATSAPP_APP_SECRET`. Sin esto
 * cualquiera podría mandar mensajes falsos al webhook.
 */
export async function firmaValida(env, cuerpoCrudo, firmaHeader) {
  if (!env.WHATSAPP_APP_SECRET) return true; // no configurado: no se bloquea, pero conviene ponerlo
  if (!firmaHeader || !firmaHeader.startsWith("sha256=")) return false;

  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.WHATSAPP_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpoCrudo));
  const hex = [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const esperado = firmaHeader.slice("sha256=".length);

  if (hex.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}
