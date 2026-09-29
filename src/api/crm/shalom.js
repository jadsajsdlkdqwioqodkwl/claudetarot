/**
 * Links de Shalom — la ventana del CRM donde el admin y quien esté en
 * SHALOM_AGENTES (Danitza) ven cada pedido de provincia con su link de
 * seguimiento, su clave única de recojo y el mensaje listo para mandarlo.
 *
 * GET  /api/crm/shalom
 *      Pedidos Shalom abiertos (y los pagados de los últimos 7 días), con
 *      nombre y chat del cliente, clave, estado, fotos y el mensaje que dejó
 *      el asesor (sugerencia tipo "envio"), si hay.
 * POST /api/crm/shalom   (JSON)
 *      { codigo, accion: "enviar", texto }     → le manda el mensaje al cliente
 *            (texto libre si su ventana de 24 h está abierta; si no, la
 *            plantilla PLANTILLA_ENVIO con su nombre y el link)
 *      { codigo, accion: "estado", estado }    → cambia el estado (nunca hacia atrás)
 *      { codigo, accion: "saldo_pagado" }      → saldo en 0: la página le muestra la clave
 * POST /api/crm/shalom   (multipart: codigo + fotos[])
 *      Sube la boleta y las fotos del envío a su link y lo pone "En camino".
 */

import { conAuth } from "../../lib/crm-auth.js";
import { getValues, updateValues } from "../../lib/google-sheets.js";
import {
  RANGO_DATOS_VENTA, ESTADOS_ENVIO, indiceVenta, letraVenta, claveDe, telefonoDe, aNumero, esCodigo, manejaShalom
} from "../../lib/ventas.js";
import { hojaVentas, olvidarCache } from "../../lib/ventas-hoja.js";
import { buscarFila } from "../asesor-ventas.js";
import { fueraDeVentana } from "./scheduled.js";
import { mandarTexto } from "../../lib/crm-send.js";
import { enviarTemplate } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente } from "../../lib/crm-db.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";
const MAX_FOTOS = 6;
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const col = (nombre) => letraVenta(indiceVenta(nombre));
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/** R2: la primera foto es boletas/<código> (la que ya usaba el asesor); las demás, boletas/<código>-2…-6. */
export const claveFoto = (codigo, n) => (n <= 1 ? `boletas/${codigo}` : `boletas/${codigo}-${n}`);

export async function contarFotos(env, codigo) {
  if (!env.CRM_MEDIA) return 0;
  const { objects } = await env.CRM_MEDIA.list({ prefix: `boletas/${codigo}` });
  return objects.filter((o) => o.key === `boletas/${codigo}` || new RegExp(`^boletas/${codigo}-\\d$`).test(o.key)).length;
}

async function chatDe(env, cel) {
  if (!cel) return null;
  return env.CRM_DB.prepare(
    `SELECT conv.id, c.wa_id, COALESCE(c.name, c.profile_name) AS nombre, conv.last_inbound_at
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id
     WHERE c.wa_id LIKE ? ORDER BY conv.last_message_at DESC LIMIT 1`
  ).bind(`%${cel.slice(-9)}`).first();
}

async function get({ env }) {
  const filas = await getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`);
  const hace7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const i = (n) => indiceVenta(n);
  const elegidas = filas
    .filter((f) => String(f[i("Envío")] || "").trim() === "Shalom" && esCodigo(String(f[i("Código")] || "")))
    .filter((f) => {
      const estado = String(f[i("Estado")] || "Pendiente").trim();
      if (estado === "Cancelado") return false;
      return estado !== "Pagado" || String(f[i("Fecha")] || "") >= hace7;
    })
    .slice(-80)
    .reverse();

  const { results: sugs } = await env.CRM_DB.prepare(
    "SELECT id, wa_id, texto, motivo, created_at FROM asesor_sugerencias WHERE tipo = 'envio' AND estado = 'pendiente' ORDER BY created_at DESC"
  ).all();

  const pedidos = [];
  for (const f of elegidas) {
    const codigo = String(f[i("Código")]).trim().toUpperCase();
    const contacto = String(f[i("DNI / WSP")] || "");
    const cel = telefonoDe(contacto);
    const chat = await chatDe(env, cel);
    const sug = sugs.find((s) => cel && String(s.wa_id || "").endsWith(cel.slice(-9)));
    pedidos.push({
      codigo,
      link: `${SITIO}/${codigo}`,
      fecha: String(f[i("Fecha")] || ""),
      contacto,
      nombre: chat?.nombre || "",
      conversation_id: chat?.id || null,
      ventana_abierta: chat ? !(await fueraDeVentana(env.CRM_DB, chat.id, new Date())) : false,
      adelanto: aNumero(f[i("Adelanto")]),
      saldo: aNumero(f[i("Saldo")]),
      clave: claveDe(f[i("Clave Shalom / Notas")]),
      estado: String(f[i("Estado")] || "Pendiente").trim(),
      fotos: String(f[i("Drive ID")] || "").startsWith("r2:") ? await contarFotos(env, codigo) : (f[i("Drive ID")] ? 1 : 0),
      sugerencia: sug ? { id: sug.id, texto: sug.texto, motivo: sug.motivo } : null
    });
  }
  return json({ pedidos, plantilla: Boolean(env.PLANTILLA_ENVIO) });
}

async function filaDe(env, codigo) {
  const filas = await getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`);
  return buscarFila(filas, { codigo });
}

async function subirFotos(env, request) {
  if (!env.CRM_MEDIA) return json({ error: "Falta el bucket R2." }, 503);
  const form = await request.formData().catch(() => null);
  const codigo = String(form?.get("codigo") || "").trim().toUpperCase();
  if (!esCodigo(codigo)) return json({ error: "Código inválido." }, 400);
  const archivos = (form.getAll("fotos") || []).filter((a) => a && typeof a !== "string");
  if (!archivos.length) return json({ error: "Elige al menos una foto." }, 400);
  const hallada = await filaDe(env, codigo);
  if (!hallada) return json({ error: "No encontré ese pedido en la hoja Ventas." }, 404);

  let n = await contarFotos(env, codigo);
  let subidas = 0;
  for (const a of archivos) {
    if (n >= MAX_FOTOS) break;
    if (!/^image\/(jpeg|png|webp)$/.test(a.type) || a.size > MAX_FOTO_BYTES) continue;
    n += 1;
    await env.CRM_MEDIA.put(claveFoto(codigo, n), await a.arrayBuffer(), { httpMetadata: { contentType: a.type } });
    subidas += 1;
  }
  if (!subidas) return json({ error: "Las fotos tienen que ser JPG, PNG o WEBP de hasta 8 MB (máximo 6 por pedido)." }, 400);

  const { fila, valores } = hallada;
  const hoja = hojaVentas(env);
  await updateValues(env, `${hoja}!${col("Drive ID")}${fila}`, [[`r2:boletas/${codigo}`]]);
  const actual = String(valores[indiceVenta("Estado")] || "Pendiente").trim();
  if (ESTADOS_ENVIO.indexOf("En camino") > ESTADOS_ENVIO.indexOf(actual)) {
    await updateValues(env, `${hoja}!${col("Estado")}${fila}`, [["En camino"]]);
  }
  olvidarCache();
  return json({ ok: true, subidas, fotos: n });
}

async function cambiarEstado(env, codigo, estado) {
  if (!ESTADOS_ENVIO.includes(estado)) return json({ error: "Estado inválido." }, 400);
  const hallada = await filaDe(env, codigo);
  if (!hallada) return json({ error: "No encontré ese pedido." }, 404);
  const { fila } = hallada;
  const hoja = hojaVentas(env);
  await updateValues(env, `${hoja}!${col("Estado")}${fila}`, [[estado]]);
  if (estado === "En destino") await updateValues(env, `${hoja}!${col("En destino desde")}${fila}`, [[hoyLima()]]);
  olvidarCache();
  return json({ ok: true });
}

async function saldoPagado(env, codigo) {
  const hallada = await filaDe(env, codigo);
  if (!hallada) return json({ error: "No encontré ese pedido." }, 404);
  await updateValues(env, `${hojaVentas(env)}!${col("Saldo")}${hallada.fila}`, [[0]]);
  olvidarCache();
  return json({ ok: true });
}

async function enviar(env, codigo, texto, quien) {
  texto = String(texto || "").trim().slice(0, 4096);
  if (!texto) return json({ error: "El mensaje está vacío." }, 400);
  const hallada = await filaDe(env, codigo);
  if (!hallada) return json({ error: "No encontré ese pedido." }, 404);
  const cel = telefonoDe(String(hallada.valores[indiceVenta("DNI / WSP")] || ""));
  const chat = await chatDe(env, cel);
  if (!chat) return json({ error: "No encontré el chat de este cliente en el CRM." }, 404);

  let via = "texto";
  if (!(await fueraDeVentana(env.CRM_DB, chat.id, new Date()))) {
    await mandarTexto(env, chat.id, chat.wa_id, texto, quien);
  } else if (env.PLANTILLA_ENVIO) {
    const nombre = (chat.nombre || "").split(/\s+/)[0] || "estimad@";
    const link = `${SITIO}/${codigo}`;
    const waMessageId = await enviarTemplate(env, chat.wa_id, env.PLANTILLA_ENVIO, "es", [nombre, link]);
    await registrarMensajeSaliente(env.CRM_DB, chat.id, { waMessageId, type: "template", body: `Plantilla: ${env.PLANTILLA_ENVIO} · ${link}`, sentBy: quien });
    via = "plantilla";
  } else {
    return json({ error: "Pasaron más de 24 h desde su último mensaje y no hay plantilla de envío aprobada: copia el link y mándalo cuando el cliente escriba." }, 422);
  }
  await env.CRM_DB.prepare(
    "UPDATE asesor_sugerencias SET estado = 'aprobada', texto = ?, resuelto_por = ?, resuelto_at = datetime('now') WHERE tipo = 'envio' AND estado = 'pendiente' AND conversation_id = ?"
  ).bind(texto, quien, chat.id).run();
  return json({ ok: true, via });
}

async function post({ request, env, agent }) {
  if (!manejaShalom(agent, env)) return json({ error: "Esta ventana es solo para quien maneja los envíos de Shalom." }, 403);
  if ((request.headers.get("Content-Type") || "").includes("multipart/form-data")) return subirFotos(env, request);
  const p = await request.json().catch(() => null);
  const codigo = String(p?.codigo || "").trim().toUpperCase();
  if (!esCodigo(codigo)) return json({ error: "Código inválido." }, 400);
  const quien = agent?.displayName || agent?.username || "CRM";
  try {
    if (p.accion === "enviar") return await enviar(env, codigo, p.texto, quien);
    if (p.accion === "estado") return await cambiarEstado(env, codigo, p.estado);
    if (p.accion === "saldo_pagado") return await saldoPagado(env, codigo);
  } catch (err) {
    console.error("Shalom:", err.message);
    return json({ error: err.message }, 502);
  }
  return json({ error: "Acción inválida." }, 400);
}

async function getProtegido(ctx) {
  if (!manejaShalom(ctx.agent, ctx.env)) return json({ error: "Esta ventana es solo para quien maneja los envíos de Shalom." }, 403);
  try {
    return await get(ctx);
  } catch (err) {
    console.error("Shalom GET:", err.message);
    return json({ error: `No pude leer la hoja Ventas: ${err.message}` }, 502);
  }
}

export const onRequestGet = conAuth(getProtegido);
export const onRequestPost = conAuth(post);
