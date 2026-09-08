/**
 * POST /api/temario-lead — el formulario de public/temario-diplomado.html.
 *
 * A diferencia de /api/order, aquí no hay nada que guardar como "fuente de
 * verdad" propia: GHL ES el CRM. El Worker solo valida, filtra bots y
 * reenvía el contacto con su tag — así el lead entra directo a la
 * automatización de retargeting que ya tiene armada Conde School.
 */

import { validarLead, limpiar } from "../lib/lead.js";
import { upsertContactoConTag } from "../lib/ghl.js";

const MAX_BODY_BYTES = 4 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

/** Mismo criterio que /api/order: sin binding, nunca se pierde un lead por esto. */
async function dentroDelLimite(env, ip) {
  if (!env.TEMARIO_LEAD_LIMIT || !ip) return true;
  try {
    const { success } = await env.TEMARIO_LEAD_LIMIT.limit({ key: ip });
    return success;
  } catch (err) {
    console.error("Rate limit:", err.message);
    return true;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "El formulario es demasiado grande." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "No pudimos leer el formulario." }, 400);
  }

  // Honeypot: si un bot llenó el campo oculto, respondemos 200 sin llamar a GHL.
  if (limpiar(payload.website, 50)) {
    return json({ ok: true });
  }

  const { errors, lead } = validarLead(payload);
  if (errors.length) {
    return json({ error: "Revisa los datos del formulario.", fields: errors }, 422);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await dentroDelLimite(env, ip))) {
    return json(
      { error: "Recibimos varias solicitudes desde tu conexión. Espera un minuto e inténtalo de nuevo." },
      429
    );
  }

  try {
    await upsertContactoConTag(env, {
      nombre: lead.nombre,
      telefono: lead.telefono,
      fuente: "Landing temario-diplomado"
    });
  } catch (err) {
    console.error("GHL:", err.message);
    return json(
      { error: "No pudimos registrar tu solicitud en este momento. Intenta de nuevo en un minuto." },
      502
    );
  }

  return json({ ok: true });
}
