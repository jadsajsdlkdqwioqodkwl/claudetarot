/**
 * API del panel de WhatsApp (public/panel.html).
 *
 * GET  ?accion=conversaciones          → lista de contactos, más reciente primero
 * GET  ?accion=mensajes&wa_id=…        → la conversación completa con ese contacto
 * POST { waId, estrella?, etiquetas?, notas? } → edita el contacto (nunca el mensaje)
 *
 * Mismo DIAG_TOKEN que el resto de endpoints de administración. El envío de
 * mensajes vive aparte, en /api/whatsapp-send.
 */

import { listarContactos, listarMensajesDe, actualizarContacto } from "../lib/whatsapp-hoja.js";
import { mismoToken } from "../lib/token.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

function autorizado(request, env) {
  return Boolean(env.DIAG_TOKEN) && mismoToken(new URL(request.url).searchParams.get("token") || "", env.DIAG_TOKEN);
}

export async function onRequestGet({ request, env }) {
  if (!autorizado(request, env)) return json({ error: "Token inválido." }, 401);

  const url = new URL(request.url);
  const accion = url.searchParams.get("accion");

  try {
    if (accion === "conversaciones") {
      return json({ ok: true, conversaciones: await listarContactos(env) });
    }

    if (accion === "mensajes") {
      const waId = url.searchParams.get("wa_id") || "";
      if (!waId) return json({ error: "Falta wa_id." }, 400);
      return json({ ok: true, mensajes: await listarMensajesDe(env, waId) });
    }

    return json({ error: "accion debe ser 'conversaciones' o 'mensajes'." }, 400);
  } catch (err) {
    console.error("Panel WhatsApp:", err.message);
    return json({ ok: false, error: err.message }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  if (!autorizado(request, env)) return json({ error: "Token inválido." }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const waId = String(body.waId ?? "").trim();
  if (!waId) return json({ error: "Falta waId." }, 400);

  const campos = {};
  if (typeof body.estrella === "boolean") campos.estrella = body.estrella;
  if (typeof body.etiquetas === "string") campos.etiquetas = body.etiquetas.slice(0, 200);
  if (typeof body.notas === "string") campos.notas = body.notas.slice(0, 2000);

  try {
    await actualizarContacto(env, waId, campos);
    return json({ ok: true });
  } catch (err) {
    console.error("Panel WhatsApp:", err.message);
    return json({ ok: false, error: err.message }, 502);
  }
}
