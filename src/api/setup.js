/**
 * POST /api/setup?token=… — deja la hoja lista como CRM desde el propio Worker.
 *
 * Existe para no tener que llevar la clave privada a ninguna máquina: el Worker
 * ya la tiene como secret, así que prepara la hoja él mismo. Es la misma rutina
 * que `npm run setup:sheet`, y es idempotente.
 *
 * Protegido con el mismo DIAG_TOKEN que /api/diag; sin él responde 404.
 *
 * Es POST y no GET a propósito: modifica la hoja, y un GET lo dispararía
 * cualquier precarga del navegador o rastreador que viera la URL.
 */

import { prepararHoja } from "../lib/crm-setup.js";
import { mismoToken } from "../lib/token.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export async function onRequestPost({ request, env }) {
  if (!env.DIAG_TOKEN) {
    return json({ error: "Apagado. Define el secret DIAG_TOKEN para encenderlo." }, 404);
  }
  if (!mismoToken(new URL(request.url).searchParams.get("token") || "", env.DIAG_TOKEN)) {
    return json({ error: "Token inválido." }, 401);
  }

  try {
    const pasos = await prepararHoja(env);
    return json({ ok: true, pasos });
  } catch (err) {
    console.error("Setup:", err.message);
    return json({ ok: false, error: err.message }, 502);
  }
}
