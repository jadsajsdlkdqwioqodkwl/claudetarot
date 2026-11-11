/**
 * Herramientas → Comentarios de Facebook e Instagram (dueño, 2026-11-11). Solo admin.
 * GET   /api/crm/redes → { config, token: bool, cuentas, ultimos: [...], hoy: { vistos, respondidos, dm, imagenes } }
 * PATCH /api/crm/redes { activo?, facebook?, instagram?, palabras?: [], comentario?, dm?, imagen_url?,
 *                       token?, app_secret? (se guardan y nunca se devuelven) }
 * POST  /api/crm/redes { accion: "suscribir" } → suscribe la página a la app (comentarios y mensajes).
 */
import { conAdmin } from "../../lib/crm-auth.js";
import { leerConfig, guardarConfig, cuentasPropias, envRedes, suscribirPagina } from "../../lib/redes.js";
import { obtenerAjuste, guardarAjuste } from "../../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function get({ request, env: envBase }) {
  const db = envBase.CRM_DB;
  // Token de verificación del webhook: se crea una vez y se muestra para pegarlo en la app de Meta.
  let verify = envBase.META_VERIFY_TOKEN || await obtenerAjuste(db, "redes_verify_token").catch(() => null);
  if (!verify) {
    verify = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await guardarAjuste(db, "redes_verify_token", verify);
  }
  const env = await envRedes(envBase);
  const config = await leerConfig(db);
  let cuentas = null;
  let errorToken = null;
  if (env.META_PAGE_TOKEN) cuentas = await cuentasPropias(env).catch((err) => { errorToken = err.message; return null; });
  const { results } = await db.prepare(
    "SELECT plataforma, autor, texto, palabra, respondido, dm_enviado, imagen_enviada, error, created_at FROM redes_comentarios ORDER BY id DESC LIMIT 30"
  ).all().catch(() => ({ results: [] }));
  const hoy = await db.prepare(
    `SELECT COUNT(*) AS vistos, SUM(respondido) AS respondidos, SUM(dm_enviado) AS dm, SUM(imagen_enviada) AS imagenes
     FROM redes_comentarios WHERE created_at >= datetime('now', '-24 hours')`
  ).first().catch(() => null);
  return json({ config, token: Boolean(env.META_PAGE_TOKEN), app_secret: Boolean(env.META_APP_SECRET), cuentas, error_token: errorToken, ultimos: results || [], hoy,
    webhook: { url: `${new URL(request.url).origin}/api/meta/webhook`, verify_token: verify } });
}

async function patch({ request, env }) {
  const p = await request.json().catch(() => null);
  if (!p || typeof p !== "object") return json({ error: "Solicitud inválida." }, 400);
  try {
    if (p.token !== undefined && String(p.token).trim()) {
      await guardarAjuste(env.CRM_DB, "redes_token", String(p.token).trim().slice(0, 1000));
      await guardarAjuste(env.CRM_DB, "redes_cuentas", ""); // otra página o token: se vuelven a leer
    }
    if (p.app_secret !== undefined && String(p.app_secret).trim()) await guardarAjuste(env.CRM_DB, "redes_app_secret", String(p.app_secret).trim().slice(0, 200));
    return json({ ok: true, config: await guardarConfig(env.CRM_DB, p) });
  } catch (err) {
    return json({ error: err.message }, 400);
  }
}

async function post({ request, env: envBase }) {
  const p = await request.json().catch(() => null);
  if (p?.accion !== "suscribir") return json({ error: "Solicitud inválida." }, 400);
  const env = await envRedes(envBase);
  if (!env.META_PAGE_TOKEN) return json({ error: "Primero guarda el token de la página." }, 400);
  try {
    return json({ ok: true, ...(await suscribirPagina(env)) });
  } catch (err) {
    return json({ error: `Meta respondió: ${err.message}` }, 422);
  }
}

export const onRequestGet = conAdmin(get);
export const onRequestPost = conAdmin(post);
export const onRequestPatch = conAdmin(patch);
