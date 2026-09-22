/**
 * Webhook de WhatsApp Cloud API.
 *
 * GET  — verificación de suscripción que hace Meta al guardar esta URL en
 *        App Dashboard → WhatsApp → Configuration → Webhook.
 * POST — mensajes entrantes. Meta reintenta el POST si no responde 200
 *        rápido, así que se contesta de inmediato y el trabajo real
 *        (Sheets, Telegram) va detrás con waitUntil.
 */

import { registrarMensaje, upsertContacto } from "../lib/whatsapp-hoja.js";
import { notificarTelegram } from "../lib/telegram.js";
import { fechaLima } from "./order.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge") ?? "";

  const esperado = env.WHATSAPP_VERIFY_TOKEN;
  if (modo === "subscribe" && esperado && token === esperado) {
    return new Response(desafio, { status: 200 });
  }
  return new Response("Verificación rechazada", { status: 403 });
}

// Legacy Markdown de Telegram: mismo saneo que usa lib/telegram.js.
function limpiar(texto) {
  return String(texto ?? "").replace(/[_*`[]/g, "");
}

function mensajeWhatsappNuevo({ nombre, telefono, cuerpo }) {
  return (
    `💬 *WhatsApp nuevo* 💬\n\n` +
    `👤 *Nombre:* ${limpiar(nombre) || "(sin nombre)"}\n` +
    `📱 *Número:* +${telefono}\n` +
    `📝 *Mensaje:* ${limpiar(cuerpo)}`
  );
}

/** Saca un texto legible del mensaje entrante, sea cual sea su tipo. */
function textoDe(msg) {
  return (
    msg.text?.body ??
    msg.button?.text ??
    msg.interactive?.button_reply?.title ??
    msg.interactive?.list_reply?.title ??
    `[${msg.type}]`
  );
}

async function procesarMensaje(env, msg, contactos) {
  const contacto = contactos.find((c) => c.wa_id === msg.from);
  const nombre = contacto?.profile?.name || "";
  const cuerpo = textoDe(msg);
  const fecha = fechaLima();

  try {
    // Log crudo primero, contacto después: si el contacto falla, el mensaje
    // ya quedó guardado — lo importante nunca se pierde por lo secundario.
    await registrarMensaje(env, { fecha, direccion: "in", waId: msg.from, nombre, tipo: msg.type, texto: cuerpo, messageId: msg.id });
    await upsertContacto(env, { waId: msg.from, nombre, fecha, ultimoMensaje: cuerpo.slice(0, 120) });
  } catch (err) {
    // Un fallo de Sheets no puede perder el aviso: igual se manda a Telegram.
    console.error("WhatsApp → Sheets:", err.message);
  }

  await notificarTelegram(env, mensajeWhatsappNuevo({ nombre, telefono: msg.from, cuerpo }));
}

async function procesarWebhook(body, env) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const valor = change.value ?? {};
      const contactos = valor.contacts ?? [];
      for (const msg of valor.messages ?? []) {
        await procesarMensaje(env, msg, contactos);
      }
      // value.statuses (delivered/read/failed de mensajes salientes) se
      // ignora por ahora: no hay todavía envío saliente que necesite ese
      // seguimiento.
    }
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }

  waitUntil(procesarWebhook(body, env).catch((err) => console.error("WhatsApp webhook:", err.message)));
  return json({ ok: true });
}
