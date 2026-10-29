/**
 * GET /api/crm/salud — estado del sistema: último webhook recibido,
 * rechazos de firma, errores de procesamiento y errores de "escribiendo…".
 * Solo admin.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { obtenerAjuste } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const esAdmin = (agent) => agent?.role === "admin";

async function handler({ request, env, agent }) {
  if (!esAdmin(agent)) return json({ error: "Solo admin." }, 403);
  const db = env.CRM_DB;

  const [ultimoOk, ultimoRechazo, ultimoError, ultimoErrorEscribiendo] = await Promise.all([
    obtenerAjuste(db, "webhook_ultimo_ok"),
    obtenerAjuste(db, "webhook_ultimo_rechazo"),
    obtenerAjuste(db, "webhook_ultimo_error"),
    obtenerAjuste(db, "ultimo_error_escribiendo"),
  ]);

  const alertas = [];
  if (ultimoRechazo) alertas.push({ tipo: "firma_invalida", etiqueta: "Firma inválida (webhook rechazado)", valor: ultimoRechazo });
  if (ultimoError) alertas.push({ tipo: "error_procesamiento", etiqueta: "Error al procesar webhook", valor: ultimoError });
  if (ultimoErrorEscribiendo) alertas.push({ tipo: "error_escribiendo", etiqueta: "Error al enviar «escribiendo…»", valor: ultimoErrorEscribiendo });

  return json({
    webhook_ultimo_ok: ultimoOk,
    alertas,
    hay_alertas: alertas.length > 0,
  });
}

export const onRequestGet = conAuth(handler);
