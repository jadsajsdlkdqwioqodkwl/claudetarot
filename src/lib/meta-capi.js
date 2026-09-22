/**
 * Meta Conversions API para "Click to WhatsApp": manda un evento de compra
 * usando el ctwa_clid del contacto, para que el anuncio que originó la
 * conversación se lleve el crédito de la venta en Ads Manager. Disparado a
 * mano desde el CRM (nunca automático) — un admin revisa el pedido y decide.
 *
 * Dos secrets nuevos: META_CAPI_ACCESS_TOKEN y META_CAPI_DATASET_ID (el
 * dataset de "Business messaging" en Events Manager — NO es el Pixel ID de
 * la web, ese es para otra cosa).
 *
 * La forma exacta de este payload es la que documenta Meta para "Click to
 * WhatsApp Ads" hoy, pero Meta cambia estas cosas entre versiones — antes de
 * confiar en esto en producción, mándate una venta de prueba con
 * test_event_code y confírmala en Events Manager → Test Events.
 */

async function sha256Hex(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Arma el cuerpo del evento — función pura, sin red, para poder probarla
 * sola (hashing del teléfono, forma del payload) sin necesitar credenciales
 * reales de Meta.
 */
export async function construirEventoCapi({ waId, ctwaClid, valor, moneda, eventName = "Purchase", eventId, contentName, testEventCode }) {
  if (!waId) throw new Error("Falta el WhatsApp del contacto.");
  const telefonoHash = await sha256Hex(String(waId).replace(/\D/g, ""));

  const evento = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: {
      ph: [telefonoHash],
      ...(ctwaClid ? { ctwa_clid: ctwaClid } : {})
    },
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

export async function enviarEventoCapi(env, payload) {
  if (!env.META_CAPI_ACCESS_TOKEN || !env.META_CAPI_DATASET_ID) {
    throw new Error("Falta configurar META_CAPI_ACCESS_TOKEN o META_CAPI_DATASET_ID.");
  }
  const url = `https://graph.facebook.com/v21.0/${env.META_CAPI_DATASET_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const texto = await res.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { raw: texto };
  }
  if (!res.ok) {
    throw new Error(datos?.error?.message || texto || `HTTP ${res.status}`);
  }
  return datos;
}
