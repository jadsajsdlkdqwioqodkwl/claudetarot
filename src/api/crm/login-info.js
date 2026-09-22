/** GET /api/crm/login-info — le dice al formulario si debe pedir el código 2FA. Sin auth: no revela nada sensible. */

export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({ requiere2FA: Boolean(env.CRM_TOTP_SECRET) }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
