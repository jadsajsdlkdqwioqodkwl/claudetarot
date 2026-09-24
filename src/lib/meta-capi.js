/**
 * Meta Conversions API para WhatsApp: le cuenta a Meta qué pasó en el chat
 * (conversación iniciada, intención de compra, venta) para que optimice a
 * quién mostrarle los anuncios.
 *
 * Dos caminos:
 *  - "anuncio": el contacto trae ctwa_clid (vino de un Click-to-WhatsApp).
 *    Meta solo acepta estos eventos (action_source "business_messaging") en
 *    el dataset vinculado a la WABA, que se obtiene con GET/POST
 *    /{WABA_ID}/dataset — NO en cualquier dataset/pixel. Mandarlos a otro
 *    dataset da "no hay ninguna cuenta de WhatsApp Business vinculada a este
 *    conjunto de datos" (así fallaron todos los reportes con ctwa_clid).
 *  - "manual": sin ctwa_clid (o si el camino de anuncio falla), se manda como
 *    "system_generated" con el teléfono hasheado a META_CAPI_DATASET_ID.
 */

import { obtenerAjuste, guardarAjuste } from "./crm-db.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const AJUSTE_DATASET_WABA = "capi_waba_dataset";

/**
 * Nombres que acepta Meta en cada camino (business_messaging no acepta
 * Contact ni Lead). `etiqueta` es la que queda en el chat para filtrar.
 */
export const EVENTOS = {
  conversacion: { anuncio: "LeadSubmitted", manual: "Contact", etiqueta: "contact" },
  lead: { anuncio: "QualifiedLead", manual: "Lead", etiqueta: "lead" },
  venta: { anuncio: "Purchase", manual: "Purchase", etiqueta: "purchase" }
};

async function sha256Hex(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const esClicReal = (ctwaClid) => Boolean(ctwaClid) && !String(ctwaClid).startsWith("SIMULADO");

/** Arma el cuerpo del evento — función pura, sin red. */
export async function construirEventoCapi({ modo, waId, ctwaClid, wabaId, valor, moneda, eventName, eventId, contentName, firstName, lastName, email, testEventCode }) {
  let user_data;
  if (modo === "anuncio") {
    if (!wabaId) throw new Error("Falta WHATSAPP_BUSINESS_ACCOUNT_ID.");
    user_data = { whatsapp_business_account_id: String(wabaId), ctwa_clid: ctwaClid };
  } else {
    const telefonoHash = waId ? await sha256Hex(String(waId).replace(/\D/g, "")) : null;
    const nombreHash = firstName ? await sha256Hex(String(firstName).trim().toLowerCase()) : null;
    const apellidoHash = lastName ? await sha256Hex(String(lastName).trim().toLowerCase()) : null;
    const emailHash = email ? await sha256Hex(String(email).trim().toLowerCase()) : null;
    if (!telefonoHash && !nombreHash && !emailHash) throw new Error("Necesita al menos el WhatsApp, el nombre o el email del contacto para poder mandarlo.");
    user_data = {
      ...(telefonoHash ? { ph: [telefonoHash] } : {}),
      ...(nombreHash ? { fn: [nombreHash] } : {}),
      ...(apellidoHash ? { ln: [apellidoHash] } : {}),
      ...(emailHash ? { em: [emailHash] } : {})
    };
  }

  const evento = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: modo === "anuncio" ? "business_messaging" : "system_generated",
    ...(modo === "anuncio" ? { messaging_channel: "whatsapp" } : {}),
    user_data,
    custom_data: {
      currency: moneda || "PEN",
      value: Number(valor) || 0,
      ...(contentName ? { content_name: contentName } : {})
    }
  };
  if (eventId) evento.event_id = String(eventId);

  const payload = { data: [evento] };
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
}

async function graph(metodo, ruta, token, cuerpo) {
  const url = `${GRAPH}/${ruta}${ruta.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: metodo,
    headers: cuerpo ? { "Content-Type": "application/json" } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const texto = await res.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { raw: texto };
  }
  if (!res.ok || datos?.error) {
    // "Invalid parameter" solo no dice nada — el motivo real viene en error_user_title / error_user_msg.
    const e = datos?.error || {};
    const detalle = [e.error_user_title, e.error_user_msg].filter(Boolean).join(": ");
    throw new Error([e.message || texto || `HTTP ${res.status}`, detalle].filter(Boolean).join(" — "));
  }
  return datos;
}

const tokensDisponibles = (env) =>
  [
    ["WHATSAPP_TOKEN", env.WHATSAPP_TOKEN],
    ["META_CAPI_ACCESS_TOKEN", env.META_CAPI_ACCESS_TOKEN]
  ].filter(([, t]) => t);

/**
 * Dataset vinculado a la WABA (lo crea si todavía no existe). Se guarda en
 * crm_settings para no preguntarle a Meta en cada evento.
 */
async function datasetDeWaba(env) {
  const guardado = await obtenerAjuste(env.CRM_DB, AJUSTE_DATASET_WABA);
  if (guardado) {
    try {
      return JSON.parse(guardado);
    } catch { /* se vuelve a resolver */ }
  }
  const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!waba) throw new Error("Falta WHATSAPP_BUSINESS_ACCOUNT_ID.");

  const errores = [];
  for (const [nombreToken, token] of tokensDisponibles(env)) {
    try {
      let datos = await graph("GET", `${waba}/dataset`, token);
      let id = datos?.id || datos?.data?.[0]?.id;
      if (!id) {
        datos = await graph("POST", `${waba}/dataset`, token);
        id = datos?.id || datos?.data?.[0]?.id;
      }
      if (!id) throw new Error(`Meta no devolvió el dataset: ${JSON.stringify(datos)}`);
      const resuelto = { id: String(id), token: nombreToken };
      await guardarAjuste(env.CRM_DB, AJUSTE_DATASET_WABA, JSON.stringify(resuelto));
      return resuelto;
    } catch (err) {
      errores.push(`${nombreToken}: ${err.message}`);
    }
  }
  throw new Error(`No se pudo obtener el dataset de la WABA (${errores.join(" | ") || "sin tokens"})`);
}

/**
 * Manda un evento eligiendo solo el camino. `tipo` es una clave de EVENTOS.
 * Devuelve { modo, eventName, respuesta, aviso } — `aviso` explica por qué
 * un contacto con ctwa_clid terminó yendo como manual.
 */
export async function reportarEventoMeta(env, { tipo, waId, ctwaClid, valor, moneda, eventId, contentName, firstName, lastName, email, testEventCode }) {
  const nombres = EVENTOS[tipo];
  if (!nombres) throw new Error(`Tipo de evento desconocido: ${tipo}`);
  const base = { waId, ctwaClid, valor, moneda, eventId, contentName, firstName, lastName, email, testEventCode };

  let aviso = null;
  if (esClicReal(ctwaClid)) {
    try {
      const dataset = await datasetDeWaba(env);
      const payload = await construirEventoCapi({ ...base, modo: "anuncio", wabaId: env.WHATSAPP_BUSINESS_ACCOUNT_ID, eventName: nombres.anuncio });
      const respuesta = await graph("POST", `${dataset.id}/events`, env[dataset.token], payload);
      return { modo: "anuncio", eventName: nombres.anuncio, respuesta, aviso: null };
    } catch (err) {
      aviso = `Vía anuncio falló (${err.message}); se mandó como manual.`;
      // Por si el dataset/token guardado dejó de servir: la próxima vez se vuelve a resolver.
      await guardarAjuste(env.CRM_DB, AJUSTE_DATASET_WABA, "").catch(() => {});
    }
  }

  if (!env.META_CAPI_ACCESS_TOKEN || !env.META_CAPI_DATASET_ID) {
    throw new Error(aviso || "Falta configurar META_CAPI_ACCESS_TOKEN o META_CAPI_DATASET_ID.");
  }
  const payload = await construirEventoCapi({ ...base, modo: "manual", eventName: nombres.manual });
  const respuesta = await graph("POST", `${env.META_CAPI_DATASET_ID}/events`, env.META_CAPI_ACCESS_TOKEN, payload);
  return { modo: "manual", eventName: nombres.manual, respuesta, aviso };
}
