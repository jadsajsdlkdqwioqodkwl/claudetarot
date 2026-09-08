/**
 * GET /api/temario-diag?token=… — diagnóstico de la conexión con GHL para el
 * formulario de public/temario-diplomado.html.
 *
 * Mismo criterio que /api/diag (Sheets): sin credenciales no se pierde el
 * lead, así que este endpoint solo lee, nunca escribe. La comprobación de
 * acceso llama a GET /locations/:id, que no crea ni cambia ningún contacto.
 *
 * Apagado por defecto: sin el secret DIAG_TOKEN responde 404. Reusa el mismo
 * secret que /api/diag — es un solo Worker con un solo dueño.
 *   npx wrangler secret put DIAG_TOKEN
 */

import { mismoToken } from "../lib/token.js";
import { verificarAcceso } from "../lib/ghl.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export async function onRequestGet({ request, env }) {
  if (!env.DIAG_TOKEN) {
    return json({ error: "Diagnóstico apagado. Define el secret DIAG_TOKEN para encenderlo." }, 404);
  }
  const url = new URL(request.url);
  if (!mismoToken(url.searchParams.get("token") || "", env.DIAG_TOKEN)) {
    return json({ error: "Token inválido." }, 401);
  }

  const pasos = [];
  const anota = (nombre, ok, detalle) => { pasos.push({ paso: nombre, ok, detalle }); return ok; };
  const terminar = (veredicto) => json({ veredicto, pasos });

  /* 1 — ¿Están las variables? */
  const requeridas = ["GHL_API_KEY", "GHL_LOCATION_ID"];
  const faltan = requeridas.filter((k) => !env[k]);
  if (!anota("variables de entorno", faltan.length === 0,
    faltan.length ? `faltan: ${faltan.join(", ")}` : "las dos están definidas")) {
    return terminar(
      "Faltan variables. GHL_API_KEY va como secret " +
      "(npx wrangler secret put GHL_API_KEY) y GHL_LOCATION_ID en wrangler.jsonc."
    );
  }

  anota("tag que se le pone al contacto", true, env.GHL_LEAD_TAG || "lead-diplomado-importacion (por defecto)");

  /* 2 — ¿El token tiene acceso a esa location? */
  try {
    const { nombre } = await verificarAcceso(env);
    anota("acceso a la location de GHL", true, nombre);
  } catch (err) {
    anota("acceso a la location de GHL", false, err.message);
    return terminar(
      "GHL rechazó el token o el locationId. Revisa que el Private Integration Token " +
      "tenga el scope de contactos y que GHL_LOCATION_ID sea el de esa misma cuenta."
    );
  }

  const roto = pasos.find((p) => !p.ok);
  return terminar(roto
    ? `Todo conecta, pero revisa: ${roto.paso}.`
    : "Cadena completa OK. Un envío del formulario debería crear el contacto con su tag en GHL.");
}
