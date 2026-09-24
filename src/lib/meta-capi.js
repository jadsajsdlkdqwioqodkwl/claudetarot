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
export async function construirEventoCapi({ waId, ctwaClid, wabaId, valor, moneda, eventName = "Purchase", eventId, contentName, firstName, lastName, email, testEventCode }) {
  const telefonoHash = waId ? await sha256Hex(String(waId).replace(/\D/g, "")) : null;
  // fn/ln/em son extra para el Event Match Quality — ctwa_clid + ph ya son,
  // por sí solos, el par que Meta documenta como suficiente para un evento
  // de Click-to-WhatsApp: ctwa_clid conecta directo con el clic al anuncio,
  // y ph identifica a la persona. El resto solo suma un poco más de EMQ,
  // y es lo único con lo que cuenta un reporte manual sin ctwa_clid.
  const nombreHash = firstName ? await sha256Hex(String(firstName).trim().toLowerCase()) : null;
  const apellidoHash = lastName ? await sha256Hex(String(lastName).trim().toLowerCase()) : null;
  const emailHash = email ? await sha256Hex(String(email).trim().toLowerCase()) : null;

  if (!telefonoHash && !nombreHash && !emailHash) throw new Error("Necesita al menos el WhatsApp, el nombre o el email del contacto para poder mandarlo.");

  // Sin ctwa_clid no es un clic a un anuncio real — "business_messaging" con
  // messaging_channel "whatsapp" exige ese campo y Meta lo rechaza
  // ("Invalid parameter") si falta. Para un reporte manual (venta que no
  // vino de un anuncio, o donde no se guardó el ctwa_clid) se manda como
  // "system_generated": mismo dataset, sin pedir el clic al anuncio, solo
  // sirve para atribución/optimización general en vez de para el anuncio
  // puntual que originó la conversación.
  //
  // Con ctwa_clid, el user_data es exactamente el que documenta Meta para
  // "Conversions API for Business Messaging": whatsapp_business_account_id +
  // ctwa_clid (sin el WABA id, Meta responde "Invalid parameter"). El clic
  // ya identifica a la persona, así que no se mezclan ph/fn/ln/em ahí.
  if (ctwaClid && !wabaId) throw new Error("Falta WHATSAPP_BUSINESS_ACCOUNT_ID para reportar una venta de un anuncio.");
  const evento = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: ctwaClid ? "business_messaging" : "system_generated",
    ...(ctwaClid ? { messaging_channel: "whatsapp" } : {}),
    user_data: ctwaClid
      ? { whatsapp_business_account_id: String(wabaId), ctwa_clid: ctwaClid }
      : {
          ...(telefonoHash ? { ph: [telefonoHash] } : {}),
          ...(nombreHash ? { fn: [nombreHash] } : {}),
          ...(apellidoHash ? { ln: [apellidoHash] } : {}),
          ...(emailHash ? { em: [emailHash] } : {})
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
    // "Invalid parameter" solo no dice nada — Meta pone el motivo real en
    // error_user_title / error_user_msg.
    const e = datos?.error || {};
    const detalle = [e.error_user_title, e.error_user_msg].filter(Boolean).join(": ");
    throw new Error([e.message || texto || `HTTP ${res.status}`, detalle].filter(Boolean).join(" — "));
  }
  return datos;
}
