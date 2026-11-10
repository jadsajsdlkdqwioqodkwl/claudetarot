/**
 * POST /api/asesor/mandar — envío directo al cliente desde la Routine de boletas.
 *
 * Excepción autorizada por el dueño (2026-10-29): el despacho de boletas de
 * provincia sale automáticamente, sin pasar por ✨ Sugerencias. Solo se usa
 * desde la Routine de boletas; cualquier otro envío automático sigue yendo
 * por enviar.py con aprobación humana.
 *
 *   { tipo: "despachar", conversation_id?, wa_id?, staging_ids: [boleta, caja], texto,
 *     courier: "Shalom"|"Olva", saldo, nro_orden, nombre_boleta?, dni_boleta?, adelanto?, forzar? }
 *     → EL despacho completo en una llamada (2026-10-31): comprueba que no se haya mandado ya
 *       (nro_orden y chat), mira la ventana de 24 h en D1 y:
 *       · abierta  → foto boleta, foto caja, texto; etiquetas; plan de cobro; staging 'enviado'; log en «Boletas auto».
 *       · cerrada  → staging 'pendiente_ventana' con el texto guardado + plantilla aviso_envio_shalom;
 *                    el webhook manda fotos+texto solo cuando el cliente responde.
 *       En los dos casos registra la venta en la pestaña Ventas (fila nueva si no existía) con la foto de la boleta.
 *   { tipo: "registrar-venta", staging_id, adelanto? }
 *     → vuelve a registrar en Ventas la venta de una boleta ya despachada (foto + orden); no le escribe al cliente.
 *   { tipo: "texto", conversation_id?, wa_id?, texto }            (se rechaza si la ventana está cerrada)
 *   { tipo: "foto-staging", conversation_id?, wa_id?, staging_id } (se rechaza si la ventana está cerrada)
 *   { tipo: "cobro", conversation_id?, wa_id?, courier: "shalom"|"olva" }
 *     → programa el plan de recojo (3 seguimientos) y aplica el tag cobro_3x
 *   { tipo: "etiqueta", conversation_id?, wa_id?, etiqueta }
 *   { tipo: "plantilla", conversation_id?, wa_id?, plantilla, params? }
 *     → envía una plantilla WhatsApp (ej. aviso_envio_shalom) cuando la ventana está cerrada
 *
 * Se acepta conversation_id O wa_id; si solo viene wa_id, se busca la
 * conversación más reciente de ese contacto.
 */

import { idWa } from "../lib/whatsapp.js";
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { mandarTexto, mandarMediaPorId, pausaEnvio, mandarConEscribiendo } from "../lib/crm-send.js";
import { agregarEtiquetaMeta, registrarMensajeSaliente } from "../lib/crm-db.js";
import { programarPlan, aplicarOlva } from "../lib/planes-plantilla.js";
import { enviarTemplate, descargarMedia } from "../lib/whatsapp.js";
import { fueraDeVentana } from "./crm/scheduled.js";
import { stagingActualizar, stagingVerificarNroOrden } from "../lib/boletas-staging.js";
import { registrarBoletaLog } from "./asesor-boletas-log.js";
import { crear as crearVenta, actualizar as actualizarVenta } from "./asesor-ventas.js";

const PLANTILLA_AVISO = "aviso_envio_shalom";
const PRECIO_KIT = 89;

/**
 * La venta de provincia en la pestaña Ventas: si no hay fila con ese DNI la crea, y le cuelga la
 * foto de la boleta (R2) con el saldo y el nro de orden. Nunca frena el despacho: devuelve lo que pasó.
 */
async function registrarVenta(env, conv, datos, foto) {
  if (!datos.dni_boleta) return { omitido: "la boleta no trae DNI" };
  const saldoNum = parseFloat(String(datos.saldo).replace(/[^\d.]/g, "")) || 0;
  const adelanto = datos.adelanto || (saldoNum === 0 ? String(PRECIO_KIT) : saldoNum < PRECIO_KIT ? String(PRECIO_KIT - saldoNum) : "");
  const creada = await (await crearVenta(env, {
    dni: datos.dni_boleta, celular: conv.waId.slice(-9), envio: datos.courier, adelanto, saldo: datos.saldo
  })).json();
  if (creada.error) return creada;
  let imagen_base64 = null;
  try {
    const { blob } = await descargarMedia(env, foto.media_id);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    imagen_base64 = btoa(bin);
  } catch (err) {
    console.error("registrarVenta foto:", err.message);
  }
  const r = await (await actualizarVenta(env, {
    dni: datos.dni_boleta, imagen_base64, mime: foto.media_mime || "image/jpeg", saldo: datos.saldo, orden: datos.nro_orden
  }, Boolean(imagen_base64))).json();
  return { codigo: creada.codigo, fila_nueva: Boolean(creada.nuevo), foto: Boolean(imagen_base64), ...(r.error ? { error: r.error } : {}) };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

// Boletas y tracking no suben el chat en la bandeja: solo sube cuando el cliente escribe (dueño, 2026-11-04).
const SIN_SUBIR = { subirEnBandeja: false };

async function resolverConversacion(db, conversationId, waId) {
  if (conversationId) {
    const row = await db.prepare(
      "SELECT c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ? LIMIT 1"
    ).bind(conversationId).first();
    return row ? { convId: conversationId, waId: row.wa_id } : null;
  }
  if (waId) {
    const row = await db.prepare(
      "SELECT conv.id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE c.wa_id = ? ORDER BY conv.id DESC LIMIT 1"
    ).bind(waId).first();
    return row ? { convId: row.id, waId } : null;
  }
  return null;
}

async function mandarPlantillaAviso(env, conv) {
  const waMessageId = await mandarConEscribiendo(env, conv.convId, (e) => enviarTemplate(e, conv.waId, PLANTILLA_AVISO, "es_PE", []));
  await registrarMensajeSaliente(env.CRM_DB, conv.convId, {
    waMessageId, type: "template", body: `Plantilla: ${PLANTILLA_AVISO}`, sentBy: "asesor-boletas"
  });
  return waMessageId;
}

async function despachar(env, conv, p) {
  const db = env.CRM_DB;
  const ids = Array.isArray(p.staging_ids) ? p.staging_ids.map(Number).filter(Boolean) : [];
  const texto = String(p.texto || "").trim();
  const nroOrden = String(p.nro_orden || "").trim();
  const courier = String(p.courier || "").trim();
  const saldo = String(p.saldo ?? "").trim();
  if (ids.length !== 2 || ids[0] === ids[1]) return json({ error: "staging_ids debe traer exactamente 2 fotos distintas (boleta y caja)." }, 400);
  if (!texto || !nroOrden || !courier) return json({ error: "Faltan texto, nro_orden o courier." }, 400);
  if (!texto.includes(nroOrden)) return json({ error: "El texto no lleva el nro_orden: revisa el mensaje antes de mandarlo." }, 400);

  const contacto = await db.prepare(
    "SELECT c.shalom_code FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
  ).bind(conv.convId).first();
  const retiro = String(contacto?.shalom_code || "").trim();
  if (retiro && texto.includes(retiro)) return json({ error: `El texto lleva el código de retiro (${retiro}): ese NUNCA va al cliente.` }, 400);

  const { results: fotos } = await db.prepare(
    "SELECT id, media_id, media_mime, status FROM boletas_staging WHERE id IN (?, ?)"
  ).bind(ids[0], ids[1]).all();
  if ((fotos || []).length !== 2 || fotos.some((f) => !f.media_id)) return json({ error: "No encontré las dos fotos en staging." }, 404);
  const ordenadas = ids.map((id) => fotos.find((f) => f.id === id));

  if (!p.forzar) {
    const usada = fotos.find((f) => ["enviado", "pendiente_ventana", "en_proceso"].includes(f.status));
    if (usada) return json({ error: "ya_procesado", detalle: `la foto ${usada.id} ya está ${usada.status}` }, 409);
    const previo = await stagingVerificarNroOrden(db, nroOrden);
    if (previo && !ids.includes(previo.id)) {
      return json({ error: "ya_procesado", detalle: `el nro_orden ${nroOrden} ya salió (staging ${previo.id}, ${previo.status}, ${previo.created_at})` }, 409);
    }
    const enChat = await db.prepare(
      "SELECT id, created_at FROM messages WHERE conversation_id = ? AND direction = 'out' AND status <> 'failed' AND " +
      "(instr(COALESCE(body, ''), ?) > 0 OR (sent_by IN ('asesor-boletas', 'asesor-boletas-auto') AND type = 'text' AND created_at >= datetime('now', '-10 days'))) " +
      "ORDER BY id DESC LIMIT 1"
    ).bind(conv.convId, nroOrden).first();
    if (enChat) return json({ error: "ya_despachado_en_chat", detalle: `este chat ya recibió su comprobante (mensaje ${enChat.id}, ${enChat.created_at}); forzar:true solo si es otro pedido` }, 409);
  }

  const datos = {
    conversation_id: conv.convId, courier, nro_orden: nroOrden, saldo, mensaje_texto: texto,
    nombre_boleta: p.nombre_boleta ? String(p.nombre_boleta) : null,
    dni_boleta: p.dni_boleta ? String(p.dni_boleta).replace(/\D/g, "") : null
  };
  const ventaDatos = { ...datos, adelanto: p.adelanto ? String(p.adelanto) : "" };
  const esOlva = courier.toLowerCase() === "olva";
  const log = {
    nombre: datos.nombre_boleta || "", wa_id: conv.waId, courier, nro_orden: nroOrden, saldo, staging_ids: ids
  };

  const cerrada = await fueraDeVentana(db, conv.convId, new Date());
  if (cerrada) {
    await stagingActualizar(db, ids[0], { status: "pendiente_ventana", ...datos });
    await stagingActualizar(db, ids[1], { status: "pendiente_ventana", conversation_id: conv.convId });
    const waMessageId = await mandarPlantillaAviso(env, conv);
    await agregarEtiquetaMeta(db, conv.convId, "bot_boleta").catch(() => {});
    if (esOlva) await aplicarOlva(env, conv.convId, true, "asesor-boletas").catch(() => {});
    registrarBoletaLog(env, { ...log, ventana: "plantilla" }).catch((err) => console.error("boletas log:", err.message));
    const ventas = await registrarVenta(env, conv, ventaDatos, ordenadas[0]).catch((err) => ({ error: err.message }));
    return json({ ok: true, ventana: "cerrada", motivo: cerrada, plantilla: PLANTILLA_AVISO, wa_message_id: waMessageId, ventas });
  }

  const enviados = [];
  for (const f of ordenadas) {
    enviados.push(await mandarMediaPorId(env, conv.convId, conv.waId, f.media_id, f.media_mime || "image/jpeg", "asesor-boletas", SIN_SUBIR));
  }
  await pausaEnvio(env, conv.convId);
  enviados.push(await mandarTexto(env, conv.convId, conv.waId, texto, "asesor-boletas", undefined, SIN_SUBIR));
  await stagingActualizar(db, ids[0], { status: "enviado", ...datos });
  await stagingActualizar(db, ids[1], { status: "enviado", conversation_id: conv.convId });
  await agregarEtiquetaMeta(db, conv.convId, "bot_boleta").catch(() => {});

  const saldoNum = parseFloat(saldo.replace(/[^\d.]/g, "")) || 0;
  let cobro = "sin saldo";
  if (saldoNum > 0) {
    const r = await programarPlan(env, conv.convId, esOlva ? "olva" : "shalom", { estado: "pendiente", quien: "asesor-boletas" });
    cobro = r.error || `${r.pasos?.length || 0} seguimientos`;
    await agregarEtiquetaMeta(db, conv.convId, "cobro_3x").catch(() => {});
  } else {
    await agregarEtiquetaMeta(db, conv.convId, "saldo_pagado").catch(() => {});
  }
  if (esOlva) await db.prepare("UPDATE contacts SET olva = 1 WHERE id = (SELECT contact_id FROM conversations WHERE id = ?)").bind(conv.convId).run().catch(() => {});
  else await agregarEtiquetaMeta(db, conv.convId, "shalom_codigo_pendiente").catch(() => {});
  registrarBoletaLog(env, { ...log, ventana: "abierta" }).catch((err) => console.error("boletas log:", err.message));
  const ventas = await registrarVenta(env, conv, ventaDatos, ordenadas[0]).catch((err) => ({ error: err.message }));
  return json({ ok: true, ventana: "abierta", wa_message_ids: enviados, cobro, ventas });
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);

  const p = await request.json().catch(() => null);
  if (!p?.tipo) return json({ error: "Falta tipo." }, 400);

  // Reparación (2026-11-07): vuelve a registrar en la pestaña Ventas la venta de una boleta YA despachada (con su foto y
  // nro de orden), sacando el chat de la propia foto. No le escribe al cliente. Para las que se perdieron cuando la
  // Routine despachó en paralelo (ver conCandadoVentas en asesor-ventas.js).
  if (p.tipo === "registrar-venta") {
    const s = await env.CRM_DB.prepare(
      "SELECT id, media_id, media_mime, conversation_id, courier, dni_boleta, nro_orden, saldo, status FROM boletas_staging WHERE id = ?"
    ).bind(Number(p.staging_id) || 0).first();
    if (!s?.media_id) return json({ error: "No encontré esa foto en staging." }, 404);
    if (!["enviado", "pendiente_ventana"].includes(s.status)) return json({ error: `Esa boleta no está despachada (${s.status}).` }, 409);
    const convS = await resolverConversacion(env.CRM_DB, Number(s.conversation_id) || null, null);
    if (!convS) return json({ error: "Esa boleta no tiene chat." }, 404);
    const ventas = await registrarVenta(env, convS, { dni_boleta: s.dni_boleta, courier: s.courier, saldo: s.saldo, nro_orden: s.nro_orden, adelanto: p.adelanto ? String(p.adelanto) : "" }, s)
      .catch((err) => ({ error: err.message }));
    return json({ ok: !ventas.error, staging_id: s.id, ventas }, ventas.error ? 422 : 200);
  }

  let waIdNorm = idWa(p.wa_id) || null;
  // Número peruano de 9 dígitos: agregar código de país
  if (waIdNorm?.length === 9) waIdNorm = "51" + waIdNorm;
  const conv = await resolverConversacion(
    env.CRM_DB,
    Number(p.conversation_id) || null,
    waIdNorm
  );
  if (!conv) return json({ error: "No encontré la conversación." }, 404);

  try {
    if (p.tipo === "despachar") return await despachar(env, conv, p);


    if (p.tipo === "texto" || p.tipo === "foto-staging") {
      // Fuera de la ventana de 24 h WhatsApp lo rechaza (131047) y el cliente no recibe nada: solo plantilla.
      const cerrada = await fueraDeVentana(env.CRM_DB, conv.convId, new Date());
      if (cerrada && !p.forzar) return json({ error: "ventana_cerrada", detalle: cerrada, usar: "tipo despachar (manda la plantilla y deja todo en pendiente_ventana)" }, 409);
    }

    if (p.tipo === "texto") {
      if (!p.texto) return json({ error: "Falta texto." }, 400);
      // La clave de retiro (shalom_code) NUNCA va al cliente por el asesor, en ningún tipo de envío (dueño, 2026-11-04).
      const ct = await env.CRM_DB.prepare("SELECT c.shalom_code FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?").bind(conv.convId).first().catch(() => null);
      const clave = String(ct?.shalom_code || "").trim();
      if (clave && String(p.texto).includes(clave)) return json({ error: `El texto lleva la clave de retiro (${clave}): esa NUNCA va al cliente.` }, 400);
      await pausaEnvio(env, conv.convId);
      const waMessageId = await mandarTexto(env, conv.convId, conv.waId, String(p.texto), "asesor-boletas", undefined, SIN_SUBIR);
      await agregarEtiquetaMeta(env.CRM_DB, conv.convId, "bot_boleta").catch(() => {});
      return json({ ok: true, wa_message_id: waMessageId });
    }

    if (p.tipo === "foto-staging") {
      const stagingId = Number(p.staging_id);
      if (!stagingId) return json({ error: "Falta staging_id." }, 400);
      const item = await env.CRM_DB.prepare(
        "SELECT media_id, media_mime FROM boletas_staging WHERE id = ? LIMIT 1"
      ).bind(stagingId).first();
      if (!item?.media_id) return json({ error: "No encontré esa foto en staging." }, 404);
      const waMessageId = await mandarMediaPorId(env, conv.convId, conv.waId, item.media_id, item.media_mime, "asesor-boletas", SIN_SUBIR);
      await agregarEtiquetaMeta(env.CRM_DB, conv.convId, "bot_boleta").catch(() => {});
      return json({ ok: true, wa_message_id: waMessageId });
    }

    if (p.tipo === "etiqueta") {
      const etiqueta = String(p.etiqueta || "").trim();
      if (!etiqueta) return json({ error: "Falta etiqueta." }, 400);
      await agregarEtiquetaMeta(env.CRM_DB, conv.convId, etiqueta);
      return json({ ok: true });
    }

    if (p.tipo === "plantilla") {
      const plantilla = String(p.plantilla || "").trim();
      const params = Array.isArray(p.params) ? p.params.map((v) => String(v)) : [];
      const idioma = String(p.idioma || "es_PE").slice(0, 10);
      if (!plantilla) return json({ error: "Falta plantilla." }, 400);
      const waMessageId = await mandarConEscribiendo(env, conv.convId, (e) => enviarTemplate(e, conv.waId, plantilla, idioma, params));
      await registrarMensajeSaliente(env.CRM_DB, conv.convId, {
        waMessageId, type: "template", body: `Plantilla: ${plantilla}`, sentBy: "asesor-boletas"
      });
      return json({ ok: true, wa_message_id: waMessageId });
    }

    if (p.tipo === "cobro") {
      const courier = String(p.courier || "").toLowerCase();
      if (courier !== "shalom" && courier !== "olva") return json({ error: "courier debe ser 'shalom' u 'olva'." }, 400);
      const resultado = await programarPlan(env, conv.convId, courier, { estado: "pendiente", quien: "asesor-boletas" });
      if (resultado.error) return json({ error: resultado.error }, 400);
      await agregarEtiquetaMeta(env.CRM_DB, conv.convId, "cobro_3x").catch(() => {});
      return json({ ok: true, pasos: resultado.pasos?.length || 0 });
    }

    return json({ error: "tipo inválido (despachar | texto | foto-staging | etiqueta | cobro | plantilla)." }, 400);
  } catch (err) {
    console.error("asesor-mandar:", err.message);
    return json({ error: err.message }, 502);
  }
}
