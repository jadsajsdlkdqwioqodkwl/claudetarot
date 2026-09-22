/** POST /api/crm/logout — borra la cookie de sesión. */

import { cookieDeCierre } from "../../lib/crm-auth.js";

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": cookieDeCierre()
    }
  });
}
