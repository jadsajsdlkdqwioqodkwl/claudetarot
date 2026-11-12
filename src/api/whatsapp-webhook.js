/**
 * Webhook de la WhatsApp Cloud API.
 *
 * GET  — verificación que hace Meta una sola vez al configurar el webhook.
 * POST — cada mensaje entrante y cada actualización de estado (enviado,
 *        entregado, leído) de los que mandamos nosotros.
 *
 * Meta reintenta el POST si no responde 200 rápido, así que el handler
 * guarda todo en D1 en el propio request (D1 es rápido) y no hace ninguna
 * llamada de red antes de responder.
 */

import { activarPlanTrasAviso, rearmarPlanShalom, programarPlan } from "../lib/planes-plantilla.js";
import { esBotonVerCatalogo, mandarCatalogoPorBoton } from "../lib/catalogo-boton.js";
import { respuestaCobroSiAplica } from "../lib/cobro-auto.js";
import { contactosDesdeWebhook, unsupportedDesdeWebhook, systemDesdeWebhook } from "../lib/mensajes-especiales.js";
import {
  obtenerOCrearContacto,
  obtenerOCrearConversacion,
  registrarMensajeEntrante,
  cancelarSeguimientosPendientes,
  actualizarEstadoMensaje,
  registrarPedidoCatalogo,
  nombresDeProductos,
  guardarProductosEnCache,
  idPorWaMessageId,
  registrarReaccionCliente,
  obtenerAjuste,
  guardarAjuste,
  registrarEventoCapi,
  agregarEtiquetaMeta,
  guardarAnuncioDelContacto,
  ORIGEN_SEGUIMIENTO_AUTO
} from "../lib/crm-db.js";
import { reportarEventoMeta } from "../lib/meta-capi.js";
import { firmaValida, listarProductosCatalogo } from "../lib/whatsapp.js";
import { programarSeguimientoDeInteresados } from "../lib/crm-interesados.js";
import { mandarSecuenciaBienvenida } from "../lib/crm-welcome-sequence.js";
import { notificarMensajeNuevo } from "../lib/crm-push.js";
import { notificarTelegram } from "../lib/telegram.js";
import { lineaDePhoneId, envDeLinea } from "../lib/lineas.js";
import { asignarProductoSiAplica, productoPorId } from "../lib/productos.js";
import { esDueno, stagingGuardar, stagingActivarLote } from "../lib/boletas-staging.js";
import { registrarBoletaLog } from "./asesor-boletas-log.js";
import { mandarTexto, mandarMediaPorId, pausaEnvio } from "../lib/crm-send.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // _2: el de la app de la segunda marca (URO), que apunta al mismo webhook.
  const tokens = [env.WHATSAPP_VERIFY_TOKEN, env.WHATSAPP_VERIFY_TOKEN_2].filter(Boolean);
  if (modo === "subscribe" && token && tokens.includes(token)) {
    return new Response(challenge || "", { status: 200 });
  }
  return json({ error: "Token de verificación inválido." }, 403);
}

// El aviso de "una sola vista" lo manda Meta como un booleano colgado del
// propio objeto de media (image/video) — no siempre en el mismo lugar según
// la versión de la API, así que se revisan las dos formas conocidas.
function esVistaUnica(msg) {
  return Boolean(msg.image?.view_once || msg.video?.view_once || msg.view_once);
}

function tipoYCuerpo(msg) {
  switch (msg.type) {
    case "text":
      return { type: "text", body: msg.text?.body || "" };
    case "image":
      return { type: "image", body: msg.image?.caption || "", mediaId: msg.image?.id, mediaMime: msg.image?.mime_type };
    case "video":
      return { type: "video", body: msg.video?.caption || "", mediaId: msg.video?.id, mediaMime: msg.video?.mime_type };
    case "audio":
      return { type: "audio", mediaId: msg.audio?.id, mediaMime: msg.audio?.mime_type };
    case "document":
      // El texto que el cliente escribe junto al archivo es el caption; el nombre va aparte.
      return { type: "document", body: msg.document?.caption || "", fileName: msg.document?.filename || null, mediaId: msg.document?.id, mediaMime: msg.document?.mime_type };
    case "sticker":
      return { type: "sticker", mediaId: msg.sticker?.id, mediaMime: msg.sticker?.mime_type };
    case "location": {
      // lat|lng|nombre|dirección — el nombre/dirección solo viene cuando el
      // cliente comparte un lugar guardado, no su ubicación en vivo.
      const loc = msg.location || {};
      return { type: "location", body: [loc.latitude, loc.longitude, loc.name || "", loc.address || ""].join("|") };
    }
    case "button":
      return { type: "text", body: msg.button?.text || "" };
    case "order": {
      const items = msg.order?.product_items || [];
      const total = items.reduce((s, i) => s + (i.item_price || 0) * (i.quantity || 1), 0);
      const resumen = items.map((i) => `${i.quantity}× ${i.product_retailer_id}`).join(", ");
      return { type: "order", body: resumen, order: { catalogId: msg.order?.catalog_id, items, total, currency: items[0]?.currency } };
    }
    case "interactive": {
      const r = msg.interactive?.button_reply || msg.interactive?.list_reply;
      if (r?.title) return { type: "text", body: r.title };
      // Otras respuestas interactivas (formulario «flow» nfm_reply, permiso de llamada…): antes entraban como un texto VACÍO y
      // nadie veía que el cliente respondió (auditoría 2026-11-11 contra la doc. oficial del webhook «messages»).
      const it = msg.interactive || {};
      const nfm = it.nfm_reply;
      const cuerpo = nfm ? `[Respuesta de formulario] ${String(nfm.body || nfm.name || "")} ${String(nfm.response_json || "").slice(0, 600)}`.trim()
        : it.call_permission_reply ? `[Permiso de llamada: ${it.call_permission_reply.response || "?"}]`
        : `[Respuesta interactiva: ${it.type || "?"}] ${JSON.stringify(it).slice(0, 400)}`;
      return { type: "text", body: cuerpo };
    }
    // Tarjeta de contacto reenviada (uno o varios): se guarda todo lo que el cliente compartió (nombre, teléfonos,
    // correos, empresa, direcciones) y el CRM la pinta como WhatsApp. Antes se perdía: solo quedaba "[contacts]".
    case "contacts":
      return { type: "contacts", body: contactosDesdeWebhook(msg.contacts) };
    // Tipo que la Cloud API no entrega (encuesta, edición, GIF, invitación a grupo…): se guarda qué fue y por qué.
    case "unsupported":
      return { type: "unsupported", body: unsupportedDesdeWebhook(msg) };
    // Aviso de Meta: el cliente cambió de número (o de id).
    case "system":
      return { type: "system", body: systemDesdeWebhook(msg) };
    default:
      // Tipo que este CRM no conoce (Meta agrega tipos nuevos): se guarda con lo que traiga, nunca vacío, para que alguien lo vea.
      return { type: msg.type || "unknown", body: `[Mensaje de tipo «${msg.type || "desconocido"}»] ${JSON.stringify(msg[msg.type] ?? {}).slice(0, 400)}` };
  }
}

/** Rellena `name` en cada item del pedido, resolviendo contra el caché o Meta. */
async function resolverNombresPedido(env, order) {
  const ids = order.items.map((i) => i.product_retailer_id).filter(Boolean);
  let mapa = await nombresDeProductos(env.CRM_DB, ids);
  const faltan = ids.filter((id) => !mapa[id]?.name);

  if (faltan.length && (order.catalogId || env.WHATSAPP_CATALOG_ID)) {
    try {
      const productos = await listarProductosCatalogo(env, order.catalogId || env.WHATSAPP_CATALOG_ID);
      await guardarProductosEnCache(env.CRM_DB, order.catalogId || env.WHATSAPP_CATALOG_ID, productos);
      mapa = await nombresDeProductos(env.CRM_DB, ids);
    } catch (err) {
      console.error("Resolver nombres del pedido:", err.message);
    }
  }

  order.items = order.items.map((i) => ({ ...i, name: mapa[i.product_retailer_id]?.name || null }));
  return order;
}

/**
 * ¿Chat nuevo que vino de un anuncio? Cada número tiene su propio chat con
 * el cliente: cuenta que ESE chat sea nuevo y que el mensaje traiga el clic
 * del anuncio (antes: contacto nuevo con ctwa_clid, que es lo mismo con un
 * solo número).
 */
const chatNuevoDeAnuncio = (contacto, conversacion, referral, texto) =>
  Boolean(conversacion._isNew && (referral?.ctwa_clid || (contacto._isNew && (contacto.ctwa_clid || esSaludoDeAnuncio(texto)))));

/**
 * Meta no siempre adjunta el `referral` del anuncio (2026-10-31: 33 de 436 chats nuevos en 4 días
 * llegaron sin él y se quedaron sin bienvenida). El texto prellenado del botón del anuncio delata
 * de dónde viene: un contacto nuevo que abre con él se trata como llegado de un anuncio.
 */
const esSaludoDeAnuncio = (texto) =>
  /^¡?\s*hola!?[\s,.]*(me gustar[ií]a (conseguir )?m[aá]s informaci[oó]n|quiero m[aá]s informaci[oó]n)/i.test(String(texto || "").trim());

/**
 * El producto del chat apaga la bienvenida si el admin lo pidió
 * (bienvenida_auto = 0). En otra línea sin producto reconocido no sale
 * ninguna: la general es la de Tarot Store.
 */
async function bienvenidaPermitida(env, conversacion) {
  const producto = await productoPorId(env.CRM_DB, conversacion.producto_id);
  if (producto) return producto.bienvenida_auto !== 0;
  return !conversacion.linea_id;
}

/** Si el contacto es nuevo y vino de un anuncio, manda la respuesta rápida configurada como bienvenida. */
async function mandarBienvenidaSiAplica(env, contacto, conversacion, waMessageId, referral, texto) {
  if (!chatNuevoDeAnuncio(contacto, conversacion, referral, texto)) return;
  try {
    if (!(await bienvenidaPermitida(env, conversacion))) return;
    const mandados = await mandarSecuenciaBienvenida(env, conversacion.id, contacto.wa_id, "Bienvenida automática", null, { pruebas: true, ultimoWaId: waMessageId });
    // Siempre que sale la bienvenida sale también el seguimiento de interesados de su tienda (aunque el automático esté apagado).
    if (mandados) await programarSeguimientoDeInteresados(env, conversacion.id);
  } catch (err) {
    console.error("Bienvenida automática:", err.message);
    notificarTelegram(env, `⚠️ *Bienvenida automática fallida*\n\nChat: ${contacto.wa_id}\nError: ${String(err.message).replace(/[_*`[]/g, "")}`).catch(() => {});
  }
}

/**
 * Si el contacto es nuevo y vino de un anuncio, y un admin configuró una
 * secuencia para leads (ajuste `ad_followup_sequence_id`) con lo automático
 * encendido (`ad_followup_auto`), la programa sola — aparte de la
 * bienvenida instantánea de arriba, para
 * insistir días después si no contestó. Como cualquier seguimiento
 * "tras no respuesta", se cancela sola en cuanto el cliente escribe o alguien le
 * manda algo a mano (ver cancelarSeguimientosPendientes).
 */
async function programarSeguimientoAutomaticoSiAplica(env, contacto, conversacion, referral, texto) {
  if (!chatNuevoDeAnuncio(contacto, conversacion, referral, texto)) return;
  try {
    if ((await obtenerAjuste(env.CRM_DB, "ad_followup_auto")) === "0") return;
    // La misma secuencia que sale tras la bienvenida; reemplaza la ya programada, no se duplica.
    await programarSeguimientoDeInteresados(env, conversacion.id);
  } catch (err) {
    console.error("Seguimiento automático de anuncio:", err.message);
  }
}

/**
 * Contacto nuevo: le avisa a Meta que la conversación empezó (LeadSubmitted
 * si vino de un anuncio, Contact si no) y deja el chat con la etiqueta
 * "contact". Va dentro del mismo request del webhook, no suma requests.
 */
async function reportarConversacionSiAplica(env, contacto, conversacion, referral) {
  if (!conversacion._isNew) return;
  // En otra línea el clic es del chat (el contacto guarda solo el de Tarot Store).
  const ctwaClid = conversacion.linea_id ? referral?.ctwa_clid || null : contacto.ctwa_clid;
  if (conversacion.linea_id && ctwaClid) {
    await env.CRM_DB.prepare("UPDATE conversations SET ctwa_clid = ? WHERE id = ?").bind(ctwaClid, conversacion.id).run()
      .catch((err) => console.error("Clic del chat:", err.message));
  }
  await agregarEtiquetaMeta(env.CRM_DB, conversacion.id, "contact").catch((err) => console.error("Etiqueta contact:", err.message));
  const base = { conversationId: conversacion.id, valor: 0, moneda: "PEN", createdBy: "Automático" };
  try {
    const r = await reportarEventoMeta(env, {
      tipo: "conversacion",
      waId: contacto.wa_id,
      ctwaClid,
      valor: 0,
      eventId: `capi-conversacion-${conversacion.id}`
    });
    await registrarEventoCapi(env.CRM_DB, { ...base, status: "enviado", eventName: r.eventName, modo: r.modo, error: r.aviso });
  } catch (err) {
    console.error("CAPI conversación:", err.message);
    await registrarEventoCapi(env.CRM_DB, { ...base, status: "fallido", eventName: ctwaClid ? "LeadSubmitted" : "Contact", error: err.message.slice(0, 500) }).catch(() => {});
  }
}

/**
 * Foto → guarda media_id en staging.
 * "ENVIAR" → activa el lote y avisa por Telegram.
 * Cualquier otro texto → ignora silenciosamente.
 */
async function manejarMensajeDueno(env, db, msg) {
  const { type, body, mediaId, mediaMime } = tipoYCuerpo(msg);
  if (type === "image" && mediaId) {
    await stagingGuardar(db, msg.id, mediaId, mediaMime || "image/jpeg");
    return;
  }
  if (type === "text" && body?.trim() === "ENVIAR") {
    const { cantidad, loteId } = await stagingActivarLote(db);
    if (cantidad === 0) {
      await notificarTelegram(env, "Boletas staging: el dueño mandó ENVIAR pero no hay fotos pendientes.").catch(() => {});
    } else {
      await notificarTelegram(env, `Boletas staging: lote ${loteId} activado — ${cantidad} foto${cantidad !== 1 ? "s" : ""} listas para la Routine.`).catch(() => {});
    }
  }
}

/**
 * Cuando el cliente responde al botón de la plantilla, su ventana de 24 h se abre.
 * Si tenía boletas en staging con status='pendiente_ventana' y su mensaje pre-calculado,
 * las despachamos automáticamente sin que el dueño tenga que hacer nada.
 */
async function despacharBoletasPendientesVentana(env, db, conversationId, waId) {
  // Reclamo atómico: mueve pendiente_ventana → en_proceso para esta conversación.
  // Evita doble envío si llegan dos mensajes entrantes simultáneos.
  const claimed = await db
    .prepare("UPDATE boletas_staging SET status = 'en_proceso' WHERE conversation_id = ? AND status = 'pendiente_ventana'")
    .bind(conversationId)
    .run();
  if (!claimed.meta?.changes) return;

  const { results: items } = await db
    .prepare(
      "SELECT id, media_id, media_mime, mensaje_texto, courier, saldo, nombre_boleta, nro_orden FROM boletas_staging " +
      "WHERE conversation_id = ? AND status = 'en_proceso' ORDER BY id"
    )
    .bind(conversationId)
    .all();
  if (!items?.length) return;

  // La boleta es la que lleva el mensaje pre-calculado; el dueño no siempre manda primero la boleta.
  const boleta = items.find((i) => i.mensaje_texto) || items[0];
  const caja = items.find((i) => i.id !== boleta.id) || null;

  if (!boleta?.mensaje_texto) {
    // Pre-migración 0065: revertir para no bloquear el item
    await db
      .prepare("UPDATE boletas_staging SET status = 'pendiente_ventana' WHERE conversation_id = ? AND status = 'en_proceso'")
      .bind(conversationId)
      .run();
    return;
  }

  await mandarMediaPorId(env, conversationId, waId, boleta.media_id, boleta.media_mime || "image/jpeg", "asesor-boletas-auto", { subirEnBandeja: false });
  if (caja?.media_id) {
    await mandarMediaPorId(env, conversationId, waId, caja.media_id, caja.media_mime || "image/jpeg", "asesor-boletas-auto", { subirEnBandeja: false });
  }
  await pausaEnvio(env, conversationId);
  await mandarTexto(env, conversationId, waId, boleta.mensaje_texto, "asesor-boletas-auto", undefined, { subirEnBandeja: false });
  for (const item of items) {
    await db.prepare("UPDATE boletas_staging SET status = 'enviado' WHERE id = ?").bind(item.id).run();
  }

  // Aplicar cobro y etiquetas (igual que la Routine en ventana abierta)
  const courier = (boleta.courier || "").toLowerCase();
  const saldoNum = parseFloat(String(boleta.saldo || "0").replace(/[^\d.]/g, "")) || 0;
  try {
    if (saldoNum > 0) {
      await programarPlan(env, conversationId, courier || "shalom", { estado: "pendiente", quien: "asesor-boletas-auto" });
      await agregarEtiquetaMeta(db, conversationId, "cobro_3x").catch(() => {});
    } else {
      await agregarEtiquetaMeta(db, conversationId, "saldo_pagado").catch(() => {});
    }
    if (courier === "shalom" || !courier) {
      await agregarEtiquetaMeta(db, conversationId, "shalom_codigo_pendiente").catch(() => {});
    }
  } catch (err) {
    console.error("boletas-auto cobro/etiquetas:", err.message);
  }

  // Registrar en "Boletas auto" (pestaña del libro de ventas)
  registrarBoletaLog(env, {
    nombre: boleta.nombre_boleta || "",
    wa_id: waId,
    courier: boleta.courier || "",
    nro_orden: boleta.nro_orden || "",
    saldo: boleta.saldo || "",
    staging_ids: items.map((i) => i.id),
    ventana: "pendiente"
  }).catch((err) => console.error("boletas-auto log:", err.message));
}

async function procesarCambio(envBase, db, value, origen) {
  const contactoMeta = value.contacts?.[0];
  // A qué número de WhatsApp escribió (Tarot Store = principal, o una línea
  // de productos/marca). Todo lo que se mande desde aquí sale por ese número.
  const linea = await lineaDePhoneId(db, envBase, value.metadata?.phone_number_id, value.metadata?.display_phone_number);
  const env = envDeLinea(envBase, linea);

  // Si el dueño manda fotos y "ENVIAR" en el mismo batch, las fotos van primero.
  const _msgs = [...(value.messages || [])].sort((a, b) => {
    if (!esDueno(env, a.from) || !esDueno(env, b.from)) return 0;
    return (a.type === "image" ? 0 : 1) - (b.type === "image" ? 0 : 1);
  });
  for (const msg of _msgs) {
    // Cliente con «nombre de usuario» de WhatsApp: llega sin `from` (no comparte su número) y con su id de negocio en
    // `from_user_id`. Del 1 al 10/11/2026 esos mensajes se perdían (241 personas); ahora abren su chat con ese id.
    const userId = msg.from_user_id || (_msgs.length === 1 ? contactoMeta?.user_id : null) || null;
    const waId = msg.from || userId;
    // El perfil (nombre, @usuario) es el de ESTE remitente: un aviso puede traer mensajes de varias personas y antes se usaba
    // siempre el primero de la lista (doc. oficial: `contacts[]` es una lista; se cruza por wa_id o user_id).
    const perfil = (value.contacts || []).find((c) => (msg.from && c.wa_id === msg.from) || (msg.from_user_id && c.user_id === msg.from_user_id))
      || (_msgs.length === 1 ? contactoMeta : null);
    // Fotos de boleta y comandos que manda el dueño desde su número personal
    // al número empresa → staging; no se procesan como chat de cliente.
    if (esDueno(env, waId)) {
      if (msg.id && (await idPorWaMessageId(db, msg.id))) continue;
      await manejarMensajeDueno(env, db, msg).catch((err) => console.error("Mensaje dueño:", err.message));
      continue;
    }
    try {
    // Meta reintenta el webhook si no recibe el 200 a tiempo: el mismo mensaje
    // puede llegar dos veces. Sin esto quedaba duplicado en el chat, contaba
    // doble en el embudo y volvía a cancelar/avisar.
    if (msg.id && (await idPorWaMessageId(db, msg.id))) continue;
    if (!waId) throw new Error("El mensaje llegó sin número ni id de WhatsApp: el CRM no puede abrir el chat (el mensaje completo queda guardado en webhook_errores.payload).");
    // Los datos del anuncio del contacto (CAPI, "vino de un anuncio") son
    // los de Tarot Store: el clic de un anuncio de otra línea no se guarda
    // ahí (el producto del chat sale del referral igual).
    const contacto = await obtenerOCrearContacto(db, msg.from || null, perfil?.profile?.name, linea ? null : msg.referral, { userId, username: perfil?.profile?.username || null });
    if (!linea && !contacto._isNew && !contacto.ctwa_clid && msg.referral?.ctwa_clid) {
      // Ya nos conocía por otra línea y ahora llega por un anuncio de Tarot Store.
      await guardarAnuncioDelContacto(db, contacto, msg.referral).catch((err) => console.error("Anuncio del contacto:", err.message));
    }
    const conversacion = await obtenerOCrearConversacion(db, contacto.id, linea?.id || null);

    // Una reacción no es un mensaje nuevo — solo marca la que ya existe. Un
    // emoji vacío ("") es al cliente sacándose su reacción anterior.
    if (msg.type === "reaction") {
      await registrarReaccionCliente(db, conversacion.id, msg.reaction?.message_id, msg.reaction?.emoji || null);
      continue;
    }

    const { type, body, fileName, mediaId, mediaMime, order } = tipoYCuerpo(msg);
    let bodyFinal = body;
    let ordenResuelta = order;
    // «Enviar mensaje al negocio» desde un producto del catálogo: Meta manda el producto en `context.referred_product`. Sin esto
    // el «hola, info» llegaba sin decir de QUÉ producto preguntaba.
    if (msg.context?.referred_product?.product_retailer_id && type !== "order") {
      bodyFinal = `${bodyFinal || ""}\n[Pregunta por el producto del catálogo: ${msg.context.referred_product.product_retailer_id}]`.trim();
    }
    if (type === "order" && order) {
      ordenResuelta = await resolverNombresPedido(env, order);
      bodyFinal = ordenResuelta.items.map((i) => `${i.quantity}× ${i.name || i.product_retailer_id}`).join(", ");
    }
    const replyToMessageId = msg.context?.id ? await idPorWaMessageId(db, msg.context.id) : null;
    await registrarMensajeEntrante(db, conversacion.id, { waMessageId: msg.id, type, body: bodyFinal, fileName, mediaId, mediaMime, replyToMessageId, viewOnce: esVistaUnica(msg) });
    await cancelarSeguimientosPendientes(db, conversacion.id);
    // De qué producto es el chat (anuncio, palabra clave o línea): elige
    // bienvenida, secuencia y respuestas rápidas.
    await asignarProductoSiAplica(db, conversacion, { referral: msg.referral, texto: type === "text" ? bodyFinal : "" })
      .catch((err) => console.error("Producto del chat:", err.message));
    if (type === "order" && ordenResuelta) {
      await registrarPedidoCatalogo(db, conversacion.id, msg.id, ordenResuelta);
    }
    // Bloqueado (si se coló igual): queda guardado, sin bienvenida ni avisos.
    if (conversacion.blocked) continue;
    // Boleta con ventana pendiente: el cliente acaba de abrir la ventana → despachar automáticamente.
    await despacharBoletasPendientesVentana(env, db, conversacion.id, contacto.wa_id)
      .catch((err) => console.error("Boletas pendiente_ventana:", err.message));
    // Respondió al "aviso de envío": se abrió su ventana y arranca el plan de recojo (4, 7 y 21 días).
    await rearmarPlanShalom(env, conversacion.id, bodyFinal).catch((err) => console.error("Re-armar recojo:", err.message));
    // Killswitch del chat: sin bienvenida ni seguimiento automático.
    if (!conversacion.pausa_auto) {
      await activarPlanTrasAviso(env, conversacion.id).catch((err) => console.error("Plan tras el aviso de envío:", err.message));
      if (type === "text" && esBotonVerCatalogo(bodyFinal)) {
        await mandarCatalogoPorBoton(env, conversacion.id, contacto.wa_id).catch((err) => console.error("Botón Ver catálogo:", err.message));
      }
      // Cliente en cobro (boleta enviada, saldo pendiente) que pregunta por su saldo, el Yape o su clave: sale sola la
      // rápida «Cobro» con su saldo y el número de Yape (cobro-auto.js). La clave de retiro nunca.
      if (type === "text") {
        await respuestaCobroSiAplica(env, conversacion.id, contacto.wa_id, bodyFinal).catch((err) => console.error("Cobro automático:", err.message));
      }
      const textoEntrante = type === "text" ? bodyFinal : "";
      await mandarBienvenidaSiAplica(env, contacto, conversacion, msg.id, msg.referral, textoEntrante);
      await programarSeguimientoAutomaticoSiAplica(env, contacto, conversacion, msg.referral, textoEntrante);
    }
    await reportarConversacionSiAplica(env, contacto, conversacion, msg.referral);
    await notificarMensajeNuevo(env, conversacion, contacto, { type, body: bodyFinal, origen }).catch((err) => console.error("Push:", err.message));
    } catch (err) {
      console.error(`Webhook msg ${msg.id || "?"} de ${waId}: ${err.message}`);
      // Se guarda el mensaje ENTERO tal como lo mandó Meta: lo que no se pudo procesar se puede recuperar después.
      const payload = JSON.stringify({ msg, contacts: value.contacts || null, metadata: value.metadata || null }).slice(0, 20000);
      await db.prepare("INSERT INTO webhook_errores (wa_id, wa_message_id, error, payload) VALUES (?, ?, ?, ?)")
        .bind(waId || null, msg.id || null, String(err.message).slice(0, 500), payload)
        .run()
        .catch(() => db.prepare("INSERT INTO webhook_errores (wa_id, wa_message_id, error) VALUES (?, ?, ?)")
          .bind(waId || null, msg.id || null, String(err.message).slice(0, 500)).run())
        .catch((e) => console.error("webhook_errores:", e.message));
      notificarTelegram(env, `⚠️ *Mensaje entrante no procesado*\n\nChat: ${waId || "?"}\nError: ${String(err.message).slice(0, 300).replace(/[_*`[]/g, "")}`).catch(() => {});
    }
  }

  for (const st of value.statuses || []) {
    const err = st.errors?.[0];
    const errorDetail = err ? `${err.title || err.code || "Error"}${err.error_data?.details ? `: ${err.error_data.details}` : ""}` : null;
    await actualizarEstadoMensaje(db, st.id, st.status, errorDetail);
    // 131050 = el cliente eligió dejar de recibir mensajes de marketing: se etiqueta el chat para que el equipo lo vea.
    if (Number(err?.code) === 131050 && (st.recipient_id || st.recipient_user_id)) {
      await db.prepare(`UPDATE conversations SET meta_tags = TRIM(COALESCE(meta_tags, '') || ' no_marketing')
                        WHERE contact_id IN (SELECT id FROM contacts WHERE wa_id = ? OR wa_id = ?) AND (' ' || COALESCE(meta_tags, '') || ' ') NOT LIKE '% no_marketing %'`)
        .bind(String(st.recipient_id || ""), String(st.recipient_user_id || "")).run().catch((e) => console.error("no_marketing:", e.message));
    }
  }
  // Los avisos de entregado / leído traen el @usuario y el id del cliente (doc. «Business-scoped user IDs»): se guardan para quien
  // ya tenía chat antes de que existieran esas columnas.
  if ((value.statuses || []).length) {
    for (const c of value.contacts || []) {
      if (!(c?.wa_id || c?.user_id) || !(c.user_id || c.profile?.username)) continue;
      // Con número: su fila va por wa_id. Sin número: su wa_id en el CRM ES el id de negocio (user_id).
      await db.prepare("UPDATE contacts SET user_id = COALESCE(?, user_id), username = COALESCE(?, username) WHERE wa_id = ? OR wa_id = ?")
        .bind(c.user_id || null, c.profile?.username || null, String(c.wa_id || c.user_id), String(c.user_id || c.wa_id)).run().catch(() => {});
    }
  }
}

/**
 * Campo "calls" del webhook (llamadas de voz/video al número de WhatsApp
 * Business). Antes se descartaba junto con cualquier campo que no fuera
 * "messages" — una llamada perdida real no dejaba ningún rastro en el chat.
 *
 * Meta no documenta un único nombre de campo para el estado de la llamada
 * entre las distintas versiones de la API, así que se revisan los alias más
 * comunes (`status` y `event`) para reconocer una perdida/rechazada.
 */
async function procesarLlamadas(env, db, value, origen) {
  const linea = await lineaDePhoneId(db, env, value.metadata?.phone_number_id, value.metadata?.display_phone_number);
  for (const call of value.calls || []) {
    const userId = call.from_user_id || null;
    const waId = call.from || userId;
    if (!waId) continue;
    const contacto = await obtenerOCrearContacto(db, call.from || null, null, null, { userId });
    const conversacion = await obtenerOCrearConversacion(db, contacto.id, linea?.id || null);

    const estado = String(call.status || call.event || "").toLowerCase();
    const perdida = /missed|no.?answer|reject|declin|unanswered|timeout/.test(estado);
    const body = perdida
      ? "📞 Llamada perdida"
      : `📞 Llamada${call.duration ? ` (${call.duration}s)` : ""}${estado ? ` — ${estado}` : ""}`;

    await registrarMensajeEntrante(db, conversacion.id, { waMessageId: call.id || null, type: "call", body });
    await cancelarSeguimientosPendientes(db, conversacion.id);
    if (conversacion.blocked) continue;
    await notificarMensajeNuevo(env, conversacion, contacto, { type: "call", body, origen }).catch((err) => console.error("Push:", err.message));
  }
}

/**
 * Todo aviso de Meta que NO es «messages» ni «calls» (auditoría 2026-11-11: se descartaban en silencio). Son los que avisan de un
 * problema de la cuenta: plantilla rechazada o pausada, calidad o límite del número, alerta o infracción de la cuenta, cambio de
 * categoría de una plantilla, baja de marketing de un cliente (`user_preferences`) y mensajes enviados desde la app del teléfono
 * (`smb_message_echoes`). Queda el último de cada tipo en crm_settings (`webhook_campo_<campo>`) y los importantes van al Telegram
 * del dueño. Solo llegan los campos a los que la app de Meta está suscrita (Meta for Developers → WhatsApp → Configuración → Webhook).
 */
const CAMPOS_QUE_AVISAN = /^(account_alerts|account_update|account_review_update|business_capability_update|message_template_status_update|message_template_quality_update|template_category_update|phone_number_quality_update|phone_number_name_update|security)$/;
async function procesarOtroCampo(env, db, campo, value) {
  const texto = JSON.stringify(value || {}).slice(0, 1500);
  await guardarAjuste(db, `webhook_campo_${String(campo).slice(0, 60)}`, `${new Date().toISOString()} ${texto}`).catch(() => {});
  if (campo === "user_preferences") {
    for (const p of value?.user_preferences || []) {
      const baja = /stop/i.test(String(p.value || ""));
      const ids = [String(p.wa_id || ""), String(p.user_id || "")].filter(Boolean);
      if (!ids.length) continue;
      await db.prepare(baja
        ? `UPDATE conversations SET meta_tags = TRIM(COALESCE(meta_tags, '') || ' no_marketing') WHERE contact_id IN (SELECT id FROM contacts WHERE wa_id IN (?, ?)) AND (' ' || COALESCE(meta_tags, '') || ' ') NOT LIKE '% no_marketing %'`
        : `UPDATE conversations SET meta_tags = TRIM(REPLACE(' ' || COALESCE(meta_tags, '') || ' ', ' no_marketing ', ' ')) WHERE contact_id IN (SELECT id FROM contacts WHERE wa_id IN (?, ?))`)
        .bind(ids[0], ids[1] || ids[0]).run().catch((e) => console.error("user_preferences:", e.message));
    }
    return;
  }
  if (CAMPOS_QUE_AVISAN.test(String(campo))) {
    await notificarTelegram(env, `⚠️ *Aviso de Meta sobre la cuenta de WhatsApp* (${String(campo).replace(/[_*`[]/g, " ")})\n\n${texto.slice(0, 700).replace(/[_*`[]/g, " ")}`).catch(() => {});
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  const cuerpoCrudo = await request.text();

  if (!(await firmaValida(env, cuerpoCrudo, request.headers.get("X-Hub-Signature-256")))) {
    // Para diagnosticar una app nueva (secreto mal puesto): solo la hora y el número, nada del cliente.
    const phoneId = cuerpoCrudo.match(/"phone_number_id"\s*:\s*"(\d+)"/)?.[1] || "?";
    await guardarAjuste(env.CRM_DB, "webhook_ultimo_rechazo", `${new Date().toISOString()} firma inválida · phone_number_id ${phoneId}`).catch(() => {});
    // 200 igual (no se procesa nada): con un 401 Meta frena toda la cola de
    // esa app por horas y los mensajes buenos que vienen después no llegan.
    return json({ ok: false });
  }

  let payload;
  try {
    payload = JSON.parse(cuerpoCrudo);
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  if (!env.CRM_DB) {
    console.error("Webhook de WhatsApp: falta el binding CRM_DB.");
    return json({ ok: true }); // 200 igual: no queremos que Meta reintente sin parar
  }

  // Último aviso por número (diagnóstico de números nuevos): llegó y con qué phone_number_id.
  const phoneIds = [...new Set((payload.entry || []).flatMap((e) => (e.changes || []).map((c) => c.value?.metadata?.phone_number_id)).filter(Boolean))];
  if (phoneIds.length) waitUntil(guardarAjuste(env.CRM_DB, "webhook_ultimo_ok", `${new Date().toISOString()} · ${phoneIds.join(",")}`).catch(() => {}));

  // Meta llama al mismo Worker que sirve /crm: con esto el aviso de
  // Telegram trae un botón que abre el chat.
  const origen = new URL(request.url).origin;
  const tareas = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "calls") {
        tareas.push(procesarLlamadas(env, env.CRM_DB, change.value, origen));
        continue;
      }
      if (change.field !== "messages") {
        tareas.push(procesarOtroCampo(env, env.CRM_DB, change.field, change.value));
        continue;
      }
      tareas.push(procesarCambio(env, env.CRM_DB, change.value, origen));
    }
  }

  // Se procesa en segundo plano pero sin perder errores: Meta solo necesita
  // el 200 rápido, no el resultado.
  waitUntil(
    Promise.all(tareas).catch(async (err) => {
      console.error("Webhook WhatsApp:", err.message);
      if (env.CRM_DB) await guardarAjuste(env.CRM_DB, "webhook_ultimo_error", `${new Date().toISOString()}: ${err.message.slice(0, 300)}`).catch(() => {});
    })
  );

  return json({ ok: true });
}
