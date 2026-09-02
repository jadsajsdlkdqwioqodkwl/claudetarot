/**
 * Cliente mínimo de la API de GoHighLevel (LeadConnector v2) para el Worker.
 *
 * Reemplaza al Webhook entrante de un Workflow (bloqueado en el plan actual
 * de la cuenta): el Worker llama directo a la API con un token de Private
 * Integration, así que el pedido igual llega a GHL sin pasar por esa
 * función. Requiere GHL_PRIVATE_TOKEN (secreto) y GHL_LOCATION_ID (var).
 */

const API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

function headers(env) {
  return {
    Authorization: `Bearer ${env.GHL_PRIVATE_TOKEN}`,
    Version: API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}

async function llamar(env, ruta, opciones) {
  const res = await fetch(`${API_BASE}${ruta}`, opciones);
  const texto = await res.text();
  let cuerpo;
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    cuerpo = { raw: texto };
  }
  if (!res.ok) {
    throw new Error(`GHL ${ruta} (${res.status}): ${texto.slice(0, 300)}`);
  }
  return cuerpo;
}

/**
 * Crea el contacto o, si ya existe uno con el mismo teléfono, lo actualiza —
 * así un cliente que pide dos veces no genera un duplicado.
 * @returns {Promise<string>} el contactId
 */
export async function upsertContacto(env, { nombre, telefono, tags, source }) {
  const body = await llamar(env, "/contacts/upsert", {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      locationId: env.GHL_LOCATION_ID,
      firstName: nombre,
      phone: `+${telefono}`,
      tags,
      source
    })
  });
  const id = body?.contact?.id || body?.id;
  if (!id) throw new Error(`GHL /contacts/upsert no devolvió un id: ${JSON.stringify(body)}`);
  return id;
}

/** Deja el resumen legible del pedido en el propio contacto. */
export async function agregarNota(env, contactId, texto) {
  await llamar(env, `/contacts/${contactId}/notes`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({ body: texto })
  });
}

/**
 * Mete el pedido a un Pipeline como Opportunity. Opcional: si no configuraste
 * GHL_PIPELINE_ID/GHL_PIPELINE_STAGE_ID, el llamador se salta este paso — el
 * contacto y su nota ya quedan registrados igual.
 */
export async function crearOportunidad(env, { contactId, nombre, total }) {
  await llamar(env, "/opportunities/", {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      locationId: env.GHL_LOCATION_ID,
      pipelineId: env.GHL_PIPELINE_ID,
      pipelineStageId: env.GHL_PIPELINE_STAGE_ID,
      contactId,
      name: `Pedido — ${nombre}`,
      monetaryValue: total,
      status: "open"
    })
  });
}
