/**
 * Cliente mínimo de la API de GoHighLevel (GHL) para Cloudflare Workers.
 *
 * Un solo uso: crear o actualizar un contacto y ponerle un tag. Ese tag es
 * todo lo que necesita el retargeting — no se crea Opportunity ni se toca
 * ningún pipeline, porque no hace falta para eso.
 *
 * Usa el endpoint de "upsert": si el WhatsApp ya existe como contacto en esa
 * location, lo actualiza (y le suma el tag) en vez de duplicarlo.
 */

const GHL_API_BASE = "https://services.leadconnectorhq.com";

// Versión de la API que GHL exige en cada request. No es la versión de
// nuestro código: es un contrato con GHL que solo cambia si ellos lo piden.
const GHL_API_VERSION = "2021-07-28";

/**
 * @param {object} env  Necesita GHL_API_KEY (secret) y GHL_LOCATION_ID.
 * @param {{ nombre: string, telefono: string, fuente: string }} lead
 *   telefono ya en E.164 sin el "+" (como lo entrega toE164Peru).
 */
export async function upsertContactoConTag(env, { nombre, telefono, fuente }) {
  const apiKey = env.GHL_API_KEY;
  const locationId = env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) {
    throw new Error("Faltan GHL_API_KEY o GHL_LOCATION_ID");
  }

  const tag = env.GHL_LEAD_TAG || "lead-diplomado-importacion";

  const res = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      locationId,
      name: nombre,
      phone: `+${telefono}`,
      tags: [tag],
      source: fuente || "Landing temario-diplomado"
    })
  });

  const crudo = await res.text();
  if (!res.ok) {
    throw new Error(`GHL ${res.status}: ${crudo.slice(0, 300)}`);
  }

  try {
    return JSON.parse(crudo);
  } catch {
    return {};
  }
}

/**
 * GET /locations/:id — no crea ni cambia nada, solo confirma que el token
 * tiene acceso a esa location. Lo usa /api/temario-diag para no tener que
 * inventar (y luego limpiar) un contacto de prueba cada vez que se revisa.
 */
export async function verificarAcceso(env) {
  const apiKey = env.GHL_API_KEY;
  const locationId = env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) {
    throw new Error("Faltan GHL_API_KEY o GHL_LOCATION_ID");
  }

  const res = await fetch(`${GHL_API_BASE}/locations/${locationId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_API_VERSION,
      Accept: "application/json"
    }
  });
  const crudo = await res.text();
  if (!res.ok) {
    throw new Error(`GHL ${res.status}: ${crudo.slice(0, 300)}`);
  }
  const datos = JSON.parse(crudo);
  return { nombre: datos.location?.name || datos.name || locationId };
}
