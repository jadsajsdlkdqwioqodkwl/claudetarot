/** GET /api/crm/session — le dice al frontend si la cookie sigue viva, y con qué rol. Al abrir el CRM, de paso, renueva la sesión. */

import { sesionActual, conSesionRenovada } from "../../lib/crm-auth.js";

export async function onRequestGet({ request, env }) {
  const sesion = await sesionActual(request, env);
  const respuesta = new Response(
    JSON.stringify({
      authenticated: sesion !== null,
      role: sesion?.role || null,
      displayName: sesion?.displayName || null,
      esCuentaDeVendedor: Boolean(sesion?.agentId)
    }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
  );
  return conSesionRenovada(respuesta, env, sesion);
}
