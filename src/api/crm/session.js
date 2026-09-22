/** GET /api/crm/session — le dice al frontend si la cookie sigue viva, y con qué rol. */

import { sesionActual } from "../../lib/crm-auth.js";

export async function onRequestGet({ request, env }) {
  const sesion = await sesionActual(request, env);
  return new Response(
    JSON.stringify({
      authenticated: sesion !== null,
      role: sesion?.role || null,
      displayName: sesion?.displayName || null,
      esCuentaDeVendedor: Boolean(sesion?.agentId)
    }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
