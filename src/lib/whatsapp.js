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

/** Lista los Message Templates de la cuenta (solo sirven los `APPROVED`). */
export async function listarTemplates(env) {
  const res = await fetch(
    graphUrl(env, `${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status,language,category,components&limit=100`),
    { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } }
  );
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos?.error?.message || `HTTP ${res.status}`);
  return datos.data || [];
}

/** Manda un template ya aprobado — el único tipo de mensaje válido fuera de la ventana de 24h. */
export async function enviarTemplate(env, waId, nombre, idioma, parametros) {
  const components = parametros?.length
    ? [{ type: "body", parameters: parametros.map((texto) => ({ type: "text", text: texto })) }]
    : undefined;

  const datos = await llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to: waId,
    type: "template",
    template: { name: nombre, language: { code: idioma || "es" }, ...(components ? { components } : {}) }
  });
  return datos.messages?.[0]?.id || null;
}

/**
 * Manda el catálogo conectado a este número como un mensaje interactivo con
 * botón "Ver catálogo". No necesita el Catalog ID: usa el que ya está
 * conectado al número en WhatsApp Manager.
 */
export async function enviarCatalogo(env, waId, texto) {
  const datos = await llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to: waId,
    type: "interactive",
    interactive: {
      type: "catalog_message",
      body: { text: texto || "Mira nuestro catálogo completo:" },
      action: { name: "catalog_message" }
    }
  });
  return datos.messages?.[0]?.id || null;
}

/** Lista los productos del catálogo, para elegir uno y mandarlo suelto. */
export async function listarProductosCatalogo(env, catalogId) {
  const res = await fetch(
    graphUrl(env, `${catalogId}/products?fields=name,retailer_id,image_url,availability&limit=200`),
    { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } }
  );
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos?.error?.message || `HTTP ${res.status}`);
  return datos.data || [];
}

/** Manda la tarjeta de un solo producto del catálogo. */
export async function enviarProducto(env, waId, catalogId, retailerId, texto) {
  const datos = await llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to: waId,
    type: "interactive",
    interactive: {
      type: "product",
      body: texto ? { text: texto } : undefined,
      action: { catalog_id: catalogId, product_retailer_id: retailerId }
    }
  });
  return datos.messages?.[0]?.id || null;
}

/** Manda una imagen o video ya subido a la Cloud API (ver subirMedia). */
export async function enviarMedia(env, waId, type, mediaId, caption) {
  const cuerpo = { messaging_product: "whatsapp", to: waId, type };
  cuerpo[type] = caption ? { id: mediaId, caption } : { id: mediaId };
  const datos = await llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, cuerpo);
  return datos.messages?.[0]?.id || null;
}

/** Sube un archivo a la Cloud API y devuelve su media id, para mandarlo después. */
export async function subirMedia(env, blob, mime, nombreArchivo) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", blob, nombreArchivo || "archivo");
  form.append("type", mime);

  const res = await fetch(graphUrl(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/media`), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
    body: form
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos?.error?.message || `HTTP ${res.status}`);
  return datos.id;
}

/** Descarga los bytes de un media por su id (ya resuelta la URL temporal). */
export async function descargarMedia(env, mediaId) {
  const { url, mime_type } = await urlDeMedia(env, mediaId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } });
  if (!res.ok) throw new Error(`No se pudo descargar el media: HTTP ${res.status}`);
  return { blob: await res.blob(), mime: mime_type || res.headers.get("Content-Type") || "application/octet-stream" };
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
