/** GET /api/crm/login-info — le dice al formulario qué modo de login usar. Sin auth: no revela nada sensible. */

export async function onRequestGet({ env }) {
  const fila = await env.CRM_DB?.prepare("SELECT COUNT(*) AS n FROM agents WHERE active = 1").first().catch(() => null);
  const modoAgentes = (fila?.n || 0) > 0;

  return new Response(
    JSON.stringify({ modoAgentes, requiere2FA: modoAgentes ? true : Boolean(env.CRM_TOTP_SECRET) }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
