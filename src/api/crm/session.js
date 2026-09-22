/** GET /api/crm/session — le dice al frontend si la cookie sigue viva. */

import { sesionValida } from "../../lib/crm-auth.js";

export async function onRequestGet({ request, env }) {
  const ok = await sesionValida(request, env);
  return new Response(JSON.stringify({ authenticated: ok }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
