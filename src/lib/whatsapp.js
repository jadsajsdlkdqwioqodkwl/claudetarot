/**
 * Cliente mínimo de WhatsApp Cloud API (Graph API) para Cloudflare Workers.
 * Sin SDK: todo con fetch, en el mismo estilo que lib/google-sheets.js.
 */

const GRAPH_VERSION = "v22.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

function authHeaders(env) {
  const token = env.WHATSAPP_TOKEN;
  if (!token) throw new Error("Falta el secret WHATSAPP_TOKEN");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function llamar(env, ruta, body) {
  if (!env.WHATSAPP_PHONE_NUMBER_ID) throw new Error("Falta WHATSAPP_PHONE_NUMBER_ID");
  const res = await fetch(`${GRAPH_URL}/${ruta}`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WhatsApp Graph API rechazó ${ruta} (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Pide el código de verificación (OTP) del número, paso previo al registro.
 * Meta lo manda por SMS o llamada de voz al teléfono físico, no al access
 * token ni al Worker: hay que estar delante del celular para recibirlo.
 */
export function pedirCodigo(env, { metodo = "SMS", idioma = "es_LA" } = {}) {
  return llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/request_code`, {
    code_method: metodo,
    language: idioma
  });
}

/** Confirma el código de 6 dígitos que llegó por SMS o voz. */
export function verificarCodigo(env, codigo) {
  return llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/verify_code`, { code: String(codigo) });
}

/**
 * Registra el número para la Cloud API. El "pin" de este paso NO es el
 * código que llega por SMS: es un PIN nuevo de 6 dígitos, elegido acá, que
 * queda como verificación en dos pasos del número — Meta lo vuelve a pedir
 * si el número se re-registra más adelante, así que hay que guardarlo.
 */
export function registrarNumero(env, pin) {
  return llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/register`, {
    messaging_product: "whatsapp",
    pin: String(pin)
  });
}

/** Manda un mensaje de texto simple. `para` en formato E.164 sin "+". */
export function enviarTexto(env, para, texto) {
  return llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to: para,
    type: "text",
    text: { body: texto }
  });
}

/** Marca un mensaje entrante como leído (el doble check azul). */
export function marcarLeido(env, messageId) {
  return llamar(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId
  });
}
