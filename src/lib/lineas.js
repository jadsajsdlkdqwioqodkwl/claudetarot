/**
 * Varios números de WhatsApp en el mismo CRM (tabla `lineas`, 0045).
 *
 * Todos los números apuntan al mismo webhook. El de Tarot Store es la línea
 * "principal": WHATSAPP_PHONE_NUMBER_ID de wrangler.jsonc, y sus chats tienen
 * conversations.linea_id NULL (todo lo que ya existía sigue igual). Cada
 * número nuevo que llega por el webhook se registra solo en `lineas` con el
 * token de siempre; el admin le pone nombre/marca en CRM → Productos.
 *
 * Para mandar, nada cambia en whatsapp.js: `envDeLinea` devuelve el mismo
 * `env` con WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN, WABA y catálogo de esa
 * línea, y crm-send.js lo resuelve solo a partir del chat (envDeConversacion).
 */

const CACHE_MS = 60 * 1000;
let cacheLineas = { at: 0, lista: [] };
const lineaDeConv = new Map(); // conversation_id -> linea_id (null = principal); no cambia nunca

export async function listarLineas(db, { fresco = false } = {}) {
  if (!db) return [];
  if (!fresco && Date.now() - cacheLineas.at < CACHE_MS) return cacheLineas.lista;
  try {
    const { results } = await db.prepare("SELECT * FROM lineas ORDER BY id ASC").all();
    cacheLineas = { at: Date.now(), lista: results };
  } catch (err) {
    // Sin la migración 0045 todavía: todo es la línea principal.
    console.error("Líneas:", err.message);
    cacheLineas = { at: Date.now(), lista: [] };
  }
  return cacheLineas.lista;
}

export function olvidarLineas() {
  cacheLineas = { at: 0, lista: [] };
}

/**
 * La línea de un número que escribió al webhook (metadata.phone_number_id).
 * null = la principal. Un número desconocido se registra solo.
 */
export async function lineaDePhoneId(db, env, phoneNumberId, displayPhone) {
  if (!phoneNumberId || String(phoneNumberId) === String(env.WHATSAPP_PHONE_NUMBER_ID)) return null;
  const lineas = await listarLineas(db);
  const existente = lineas.find((l) => String(l.phone_number_id) === String(phoneNumberId));
  if (existente) return existente;
  try {
    const nueva = await db.prepare(
      `INSERT INTO lineas (nombre, phone_number_id) VALUES (?, ?)
       ON CONFLICT(phone_number_id) DO UPDATE SET phone_number_id = excluded.phone_number_id
       RETURNING *`
    ).bind(`Número ${displayPhone || phoneNumberId}`, String(phoneNumberId)).first();
    olvidarLineas();
    return nueva;
  } catch (err) {
    console.error("Registrar línea nueva:", err.message);
    return null;
  }
}

/** El `env` con los datos de Meta de esa línea (null/undefined = la principal, el env tal cual). */
export function envDeLinea(env, linea) {
  if (!linea || !linea.phone_number_id || String(linea.phone_number_id) === String(env.WHATSAPP_PHONE_NUMBER_ID)) return env;
  return {
    ...env,
    WHATSAPP_PHONE_NUMBER_ID: linea.phone_number_id,
    WHATSAPP_TOKEN: (linea.token_var && env[linea.token_var]) || env.WHATSAPP_TOKEN,
    // Sin la WABA propia no se cae a la de Tarot Store (plantillas y CAPI irían a la cuenta equivocada).
    WHATSAPP_BUSINESS_ACCOUNT_ID: linea.waba_id || "",
    WHATSAPP_CATALOG_ID: linea.catalog_id || "",
    // Nunca el píxel de Tarot Store: sin pixel_id, los eventos manuales de esta línea no salen.
    META_CAPI_DATASET_ID: linea.pixel_id || "",
    // El CAPI de esa marca va con su propio token (el usuario del sistema de su portafolio, con el píxel asignado).
    META_CAPI_ACCESS_TOKEN: (linea.token_var && env[linea.token_var]) || "",
    LINEA_ID: linea.id
  };
}

export async function lineaPorId(db, id) {
  if (!id) return null;
  return (await listarLineas(db)).find((l) => l.id === Number(id)) || null;
}

/** El `env` para mandarle a un chat: por el número al que escribió el cliente. */
export async function envDeConversacion(env, conversationId) {
  if (!env?.CRM_DB || !conversationId || env.LINEA_ID) return env;
  let lineaId = lineaDeConv.get(conversationId);
  if (lineaId === undefined) {
    try {
      const fila = await env.CRM_DB.prepare("SELECT linea_id FROM conversations WHERE id = ?").bind(conversationId).first();
      lineaId = fila?.linea_id || null;
    } catch {
      lineaId = null; // sin la migración: principal
    }
    if (lineaDeConv.size > 5000) lineaDeConv.clear();
    lineaDeConv.set(conversationId, lineaId);
  }
  if (!lineaId) return env;
  return envDeLinea(env, await lineaPorId(env.CRM_DB, lineaId));
}
