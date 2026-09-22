/**
 * POST /api/whatsapp-send?token=… — manda un mensaje de WhatsApp y lo deja
 * registrado en WSP_Mensajes, igual que uno entrante.
 *
 * Es la pieza que le falta a un mensaje saliente para que la conversación
 * quede completa en el Sheet: /api/whatsapp (el webhook) solo ve lo que
 * escribe el cliente, nunca lo que contesta el vendedor.
 *
 * MVP a propósito: protegido con el mismo DIAG_TOKEN que /api/diag y
 * /api/setup, sin login por trabajador todavía. Lo llama el panel
 * (public/panel.html) para contestar.
 *
 * Body JSON: {"to":"51987654321","texto":"…","worker":"Ana"}
 */

import { enviarTexto } from "../lib/whatsapp.js";
import { registrarMensaje, upsertContacto } from "../lib/whatsapp-hoja.js";
import { mismoToken } from "../lib/token.js";
import { fechaLima } from "./order.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
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

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const para = String(body.to ?? "").replace(/\D/g, "");
  const texto = String(body.texto ?? "").trim();
  const worker = String(body.worker ?? "").trim();

  if (!para || !texto) {
    return json({ error: "Faltan 'to' y/o 'texto'." }, 400);
  }

  try {
    const respuesta = await enviarTexto(env, para, texto);
    const messageId = respuesta.messages?.[0]?.id || "";
    const fecha = fechaLima();

    await registrarMensaje(env, { fecha, direccion: "out", waId: para, tipo: "text", texto, messageId, worker });
    await upsertContacto(env, { waId: para, fecha, ultimoMensaje: texto.slice(0, 120) });

    return json({ ok: true, messageId });
  } catch (err) {
    console.error("WhatsApp send:", err.message);
    return json({ ok: false, error: err.message }, 502);
  }
}
