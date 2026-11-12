/**
 * POST /api/asesor/ventas — el asesor (Routine de Claude) registra ventas de
 * provincia en la pestaña "Ventas" y les cuelga la boleta de Shalom, para que
 * cada cliente tenga su página de seguimiento /TS-… sin que nadie escriba a mano.
 *
 * Por qué existe: la boleta sale 1–3 días después de la venta, cuando la
 * ventana de 24 h de WhatsApp ya se cerró. Así que el link se crea el MISMO
 * día de la venta (accion "crear") y viaja en el mensaje de confirmación; la
 * boleta llega después a esa misma página (accion "boleta") sin escribirle.
 *
 * Misma clave que /api/asesor/avisos (x-asesor-clave). Cuerpos:
 *   { accion: "crear",  dni, celular, envio: "Shalom", adelanto, saldo, clave?, notas? }
 *       → { codigo, link, clave, nuevo }  (si ya hay una venta abierta con ese DNI, devuelve esa)
 *       Sin clave, un envío Shalom recibe una de las claves fijas (3114/3144/3143,
 *       la menos usada entre los pedidos abiertos) y queda anotada en la fila.
 *   { accion: "boleta", codigo? | dni, imagen_base64, mime?, orden?, cod_shalom?, estado? }
 *       → guarda la foto en R2 y pone la venta "En camino" (o el estado dado)
 *   { accion: "estado", codigo? | dni, estado, clave? }
 *
 * Nota: hasta ahora la pestaña Ventas la escribían solo las vendedoras. El
 * asesor escribe filas nuevas y, en filas existentes, solo Estado, la clave
 * (antes de la barra, respetando las notas) y el voucher si no tenía.
 */

import { getValues, updateValues } from "../lib/google-sheets.js";
import { COLUMNAS_VENTA, RANGO_DATOS_VENTA, ESTADOS_ENVIO, ENVIOS, nuevoCodigo, indiceVenta, letraVenta, esCodigo, claveDe, clavesShalom, elegirClaveShalom, contieneCodigo } from "../lib/ventas.js";
import { hojaVentas, olvidarCache } from "../lib/ventas-hoja.js";
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { activarCobroPorCodigo } from "../lib/planes-plantilla.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";
const MAX_IMAGEN = 6 * 1024 * 1024;
const CERRADOS = new Set(["Pagado", "Cancelado"]);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const col = (nombre) => letraVenta(indiceVenta(nombre));
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/** Fila (número de hoja) y valores de la venta que calza con el código o el DNI. */
export function buscarFila(filas, { codigo, dni }) {
  const iCod = indiceVenta("Código");
  const iCont = indiceVenta("DNI / WSP");
  const iEst = indiceVenta("Estado");
  const cod = String(codigo || "").trim().toUpperCase();
  const d = soloDigitos(dni);
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    if (cod && String(f[iCod] || "").trim().toUpperCase() === cod) return { fila: i + 2, valores: f };
    if (!cod && d.length >= 8 && new RegExp(`(^|\\D)${d}(\\D|$)`).test(String(f[iCont] || "")) && !CERRADOS.has(String(f[iEst] || "").trim())) {
      return { fila: i + 2, valores: f };
    }
  }
  return null;
}

/** La celda "Clave Shalom / Notas" con la clave nueva adelante y las notas intactas. */
export function conClave(celda, clave) {
  const partes = String(celda || "").split("/");
  const notas = partes.length > 1 ? partes.slice(1).join("/").trim() : (partes[0].trim() && !/^[A-Za-z0-9-]{1,12}$/.test(partes[0].trim()) ? partes[0].trim() : "");
  return notas ? `${clave} / ${notas}` : String(clave);
}

/** Claves de los pedidos abiertos (una por pedido), para repartir las fijas parejo. */
export function clavesAbiertas(filas) {
  return filas
    .filter((f) => !CERRADOS.has(String(f[indiceVenta("Estado")] || "").trim()) && String(f[indiceVenta("Código")] || "").trim())
    .map((f) => claveDe(f[indiceVenta("Clave Shalom / Notas")]))
    .filter(Boolean);
}

async function leerFilas(env) {
  return getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`);
}

/**
 * Candado en D1 para crear ventas de a una (2026-11-07). La Routine de boletas mandó 9 despachos a la vez: cada uno leyó
 * la hoja, eligió «la primera fila vacía» y escribió ahí, así que varios cayeron en la MISMA fila y se pisaron (5 de 9
 * ventas del 6/11 se perdieron y después salía «No encontré esa venta»). Con el candado, la segunda espera a que la
 * primera termine de escribir. D1 hace el INSERT … ON CONFLICT de forma atómica; el candado vence solo a los 30 s.
 */
const CANDADO_VENTAS = "candado_ventas_crear";
export async function conCandadoVentas(env, fn, { intentos = 80, esperaMs = 250 } = {}) {
  const db = env.CRM_DB;
  if (!db) return fn();
  const yo = `${Math.random().toString(36).slice(2)}${Date.now()}`;
  for (let i = 0; i < intentos; i++) {
    const valor = `${Date.now() + 30_000}|${yo}`;
    const r = await db.prepare(
      `INSERT INTO crm_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value
       WHERE CAST(substr(crm_settings.value, 1, instr(crm_settings.value, '|') - 1) AS INTEGER) < ?`
    ).bind(CANDADO_VENTAS, valor, Date.now()).run().catch(() => null);
    if (r?.meta?.changes) {
      try {
        return await fn();
      } finally {
        await db.prepare("DELETE FROM crm_settings WHERE key = ? AND value = ?").bind(CANDADO_VENTAS, valor).run().catch(() => {});
      }
    }
    await new Promise((res) => setTimeout(res, esperaMs + Math.random() * esperaMs));
  }
  return fn(); // ~30 s sin poder tomarlo (candado colgado): sigue como antes antes que perder la venta
}

export async function crear(env, p) {
  return conCandadoVentas(env, () => crearSinCandado(env, p));
}

async function crearSinCandado(env, p) {
  const dni = soloDigitos(p.dni).slice(0, 12);
  const celular = soloDigitos(p.celular).slice(-9);
  if (!dni && !celular) return json({ error: "Falta DNI o celular." }, 400);
  // Sin `envio` se asume Shalom (como siempre); uno que no está en la lista es un error, no un Shalom en silencio.
  if (p.envio && !ENVIOS.includes(p.envio)) return json({ error: `Envío «${p.envio}» no válido (${ENVIOS.join(", ")}).` }, 400);
  const envio = p.envio || "Shalom";

  const filas = await leerFilas(env);
  const existente = dni ? buscarFila(filas, { dni }) : null;
  if (existente) {
    const codigo = existente.valores[indiceVenta("Código")];
    const claveExistente = claveDe(existente.valores[indiceVenta("Clave Shalom / Notas")]);
    return json({ codigo, link: `${SITIO}/${codigo}`, clave: claveExistente, nuevo: false });
  }

  const usados = new Set(filas.map((f) => String(f[indiceVenta("Código")] || "").toUpperCase()));
  let codigo = nuevoCodigo();
  while (usados.has(codigo)) codigo = nuevoCodigo();

  // Primera fila vacía de verdad (columna Fecha y Código vacías).
  let fila = filas.length + 2;
  for (let i = 0; i < filas.length; i++) {
    if (!String(filas[i][0] || "").trim() && !String(filas[i][indiceVenta("Código")] || "").trim()) { fila = i + 2; break; }
  }
  const hoja = hojaVentas(env);
  const fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const contacto = [dni, celular].filter(Boolean).join(" / ");
  const claveShalom = String(p.clave || "").trim() || (envio === "Shalom" ? elegirClaveShalom(clavesShalom(env), clavesAbiertas(filas)) : "");
  const clave = [claveShalom, p.notas].filter((x) => x && String(x).trim()).join(" / ");
  // A–F y J–K por separado: G, H e I son ARRAYFORMULA de la fila 2 y escribir
  // encima (aunque sea vacío) rompe la columna entera.
  await updateValues(env, `${hoja}!A${fila}:F${fila}`, [[fecha, contacto, envio, p.adelanto ?? "", p.saldo ?? "", clave]]);
  await updateValues(env, `${hoja}!${col("Estado")}${fila}:${col("Código")}${fila}`, [["Pendiente", codigo]]);
  olvidarCache();
  return json({ codigo, link: `${SITIO}/${codigo}`, clave: claveShalom, nuevo: true });
}

export async function actualizar(env, p, conImagen) {
  const filas = await leerFilas(env);
  const hallada = buscarFila(filas, { codigo: p.codigo, dni: p.dni });
  if (!hallada) return json({ error: "No encontré esa venta (ni por código ni por DNI)." }, 404);
  const { fila, valores } = hallada;
  const codigo = String(valores[indiceVenta("Código")] || "").trim().toUpperCase();
  if (!esCodigo(codigo)) return json({ error: "Esa fila no tiene código válido." }, 422);
  const hoja = hojaVentas(env);

  if (conImagen) {
    if (!env.CRM_MEDIA) return json({ error: "Falta el bucket R2." }, 503);
    const bytes = Uint8Array.from(atob(String(p.imagen_base64 || "")), (c) => c.charCodeAt(0));
    if (!bytes.length || bytes.length > MAX_IMAGEN) return json({ error: "Imagen vacía o demasiado grande." }, 400);
    await env.CRM_MEDIA.put(`boletas/${codigo}`, bytes, { httpMetadata: { contentType: /^image\/(jpeg|png|webp)$/.test(p.mime) ? p.mime : "image/jpeg" } });
    await updateValues(env, `${hoja}!${col("Drive ID")}${fila}`, [[`r2:boletas/${codigo}`]]);
  }

  const estado = p.estado || (conImagen ? "En camino" : null);
  if (estado) {
    if (!ESTADOS_ENVIO.includes(estado)) return json({ error: "Estado inválido." }, 400);
    const actual = String(valores[indiceVenta("Estado")] || "").trim();
    // Nunca hacia atrás: una boleta vieja no devuelve a "En camino" algo ya pagado.
    if (ESTADOS_ENVIO.indexOf(estado) > ESTADOS_ENVIO.indexOf(actual) || !actual) {
      await updateValues(env, `${hoja}!${col("Estado")}${fila}`, [[estado]]);
      if (estado === "En destino") {
        const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
        await updateValues(env, `${hoja}!${col("En destino desde")}${fila}`, [[hoy]]);
      }
    }
  }
  // Clave adelante (la página solo publica eso) y orden/código de Shalom en
  // las notas, que nunca salen a la página.
  const original = String(valores[indiceVenta("Clave Shalom / Notas")] || "");
  let celda = p.clave ? conClave(original, p.clave) : original;
  const extra = [p.orden && `Orden ${p.orden}`, p.cod_shalom && `Cód ${p.cod_shalom}`].filter(Boolean).join(" · ");
  if (extra && !celda.includes(extra)) celda = celda.includes("/") ? `${celda} · ${extra}` : `${celda.trim() || "-"} / ${extra}`;
  if (celda !== original) await updateValues(env, `${hoja}!${col("Clave Shalom / Notas")}${fila}`, [[celda]]);

  // Saldo calculado por la Routine (opcional): actualiza la Sheets y D1 en un solo call.
  if (p.saldo !== undefined) {
    await updateValues(env, `${hoja}!${col("Saldo")}${fila}`, [[String(p.saldo)]]);
    if (env.CRM_DB) {
      const celda_wsp = String(valores[indiceVenta("DNI / WSP")] || "");
      // Acepta tanto "51987654321" (11 dígitos) como "987654321" (9 dígitos sin prefijo)
      const telRaw = celda_wsp.match(/\b(51\d{9}|\d{9})\b/)?.[1] || "";
      const waId = telRaw.length === 9 ? "51" + telRaw : telRaw;
      if (waId) {
        const cont = await env.CRM_DB.prepare("SELECT id FROM contacts WHERE wa_id = ? LIMIT 1").bind(waId).first();
        if (cont?.id) {
          await env.CRM_DB.prepare("UPDATE contacts SET saldo = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(String(p.saldo), cont.id).run();
        }
      }
    }
  }

  olvidarCache();
  return json({ ok: true, codigo, link: `${SITIO}/${codigo}` });
}

/** «dd/mm» de la columna Fecha → Date (UTC, mediodía) del año más reciente que no quede después de `tope`. */
function fechaDeFila(texto, tope) {
  const m = String(texto || "").match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  let d = new Date(Date.UTC(tope.getUTCFullYear(), Number(m[2]) - 1, Number(m[1]), 12));
  if (d.getTime() > tope.getTime() + 86400000) d = new Date(Date.UTC(tope.getUTCFullYear() - 1, Number(m[2]) - 1, Number(m[1]), 12));
  return d;
}

/**
 * Pone Saldo = 0 en la hoja a los clientes de agencia (Shalom u Olva) a quienes ya se les mandó su clave de
 * retiro (el chat tiene la etiqueta `saldo_pagado` Y existe un mensaje nuestro con su clave). Solo cuenta la
 * venta abierta más reciente del celular y solo si es anterior al mensaje de la clave: una compra nueva del mismo
 * cliente no hereda el pago viejo. El Estado NO se toca («Pagado» sigue siendo paquete recogido). Único escritor
 * de esa celda: el cron; los demás procesos solo marcan el chat en D1, así dos procesos a la vez no se pisan.
 * Nunca toca filas «Pagado» o «Cancelado». Devuelve cuántas filas marcó.
 */
export async function sincronizarSaldosPagados(env) {
  if (!env.CRM_DB) return { marcadas: 0 };
  const { results } = await env.CRM_DB.prepare(
    "SELECT c.wa_id, c.shalom_code, m.created_at, m.body FROM conversations conv JOIN contacts c ON c.id = conv.contact_id " +
    "JOIN messages m ON m.conversation_id = conv.id AND m.direction = 'out' AND COALESCE(c.shalom_code, '') <> '' AND instr(COALESCE(m.body, ''), c.shalom_code) > 0 " +
    "WHERE (' ' || COALESCE(conv.meta_tags, '') || ' ') LIKE '% saldo_pagado %' AND conv.last_message_at >= datetime('now', '-30 days') " +
    "ORDER BY m.id DESC LIMIT 300"
  ).all();
  // Por celular, el momento más reciente en que de verdad salió su clave (hora de Lima).
  const claveEnviada = new Map();
  for (const r of results || []) {
    const cel = String(r.wa_id).slice(-9);
    if (claveEnviada.has(cel) || !contieneCodigo(r.body, r.shalom_code)) continue;
    claveEnviada.set(cel, new Date(new Date(String(r.created_at).replace(" ", "T") + "Z").getTime() - 5 * 3600 * 1000));
  }
  if (!claveEnviada.size) return { marcadas: 0 };
  const filas = await leerFilas(env);
  const hoja = hojaVentas(env);
  const hechos = new Set();
  let marcadas = 0;
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    const envio = String(f[indiceVenta("Envío")] || "").trim();
    const estado = String(f[indiceVenta("Estado")] || "").trim();
    if (!["Shalom", "Olva"].includes(envio) || CERRADOS.has(estado)) continue;
    const cel = (String(f[indiceVenta("DNI / WSP")] || "").match(/\b(51\d{9}|\d{9})\b/)?.[1] || "").slice(-9);
    const cuando = claveEnviada.get(cel);
    if (!cuando || hechos.has(cel)) continue;
    hechos.add(cel); // solo la venta abierta más reciente de ese celular
    const fecha = fechaDeFila(f[indiceVenta("Fecha")], cuando);
    if (!fecha || fecha.getTime() > cuando.getTime() + 86400000) continue; // compra posterior a la clave: no es de esa clave
    const saldo = String(f[indiceVenta("Saldo")] ?? "").trim();
    if (saldo !== "" && Number(saldo.replace(/[^\d.]/g, "")) === 0) continue; // ya está en 0
    await updateValues(env, `${hoja}!${col("Saldo")}${i + 2}`, [[0]]);
    marcadas++;
  }
  if (marcadas) olvidarCache();
  return { marcadas };
}

/**
 * { accion: "clave_crm", whatsapp, clave?, pisar? } — la clave de recojo de Shalom / Olva en la FICHA del cliente del CRM
 * (`contacts.shalom_code`, lo que la vendedora ve en el chat como «Clave Shalom»). Antes `shalom.py clave` solo la escribía en la
 * hoja Ventas y en el CRM no aparecía (dueño 2026-11-11: «le pasó la clave a Claude, Claude dijo que ya estaba y en el CRM no salía»).
 * Hace lo mismo que cuando una vendedora la escribe en el perfil: guarda la clave y deja el cobro del saldo POR APROBAR en cada
 * chat (nunca sale solo desde aquí). Sin `clave` solo consulta. La respuesta NUNCA lleva la clave: solo si quedó puesta.
 * La clave no se le manda al cliente desde aquí ni se escribe en Telegram.
 */
async function claveEnCrm(env, p) {
  const wa = String(p.whatsapp || "").replace(/\D/g, "").slice(-9);
  if (wa.length !== 9) return json({ error: "Falta whatsapp (9 dígitos)." }, 400);
  const c = await env.CRM_DB.prepare("SELECT id, wa_id, shalom_code, COALESCE(name, profile_name, '') AS nombre FROM contacts WHERE substr(wa_id, -9) = ? ORDER BY id DESC LIMIT 1").bind(wa).first();
  if (!c) return json({ ok: false, sin_chat: true, whatsapp: wa });
  const tenia = String(c.shalom_code || "").trim();
  const clave = String(p.clave || "").trim();
  if (!clave) return json({ ok: true, whatsapp: wa, nombre: c.nombre, tiene_clave: Boolean(tenia) });
  if (!/^\d{4}$/.test(clave)) return json({ error: "La clave debe ser de 4 dígitos." }, 400);
  if (tenia === clave) return json({ ok: true, whatsapp: wa, nombre: c.nombre, tiene_clave: true, ya_estaba: true });
  // Ya tiene OTRA clave (un pedido anterior, o la de Olva): no se pisa sola; quien llama decide con `pisar`.
  if (tenia && !p.pisar) return json({ ok: false, whatsapp: wa, nombre: c.nombre, tiene_clave: true, tenia_otra: true });
  await env.CRM_DB.prepare("UPDATE contacts SET shalom_code = ?, updated_at = datetime('now') WHERE id = ?").bind(clave, c.id).run();
  const { results: chats } = await env.CRM_DB.prepare("SELECT id FROM conversations WHERE contact_id = ?").bind(c.id).all();
  let cobro = 0;
  for (const ch of chats || []) {
    const r = await activarCobroPorCodigo(env, ch.id, clave, { estado: "por_aprobar", quien: "Asesor (clave del día)" }).catch(() => ({}));
    if (r.pasos) cobro++;
  }
  const leida = await env.CRM_DB.prepare("SELECT shalom_code FROM contacts WHERE id = ?").bind(c.id).first();
  return json({ ok: String(leida?.shalom_code || "") === clave, whatsapp: wa, nombre: c.nombre, tiene_clave: String(leida?.shalom_code || "") === clave, cambiada: Boolean(tenia), cobro_por_aprobar: cobro });
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const p = await request.json().catch(() => null);
  try {
    if (p?.accion === "crear") return await crear(env, p);
    if (p?.accion === "boleta") return await actualizar(env, p, true);
    if (p?.accion === "estado") return await actualizar(env, p, false);
    if (p?.accion === "clave_crm") return await claveEnCrm(env, p);
  } catch (err) {
    console.error("Asesor ventas:", err.message);
    return json({ error: err.message }, 502);
  }
  return json({ error: "Acción inválida." }, 400);
}

/**
 * GET /api/asesor/ventas-lista?dni=XXXXXXXX
 * Busca en Sheets Ventas la fila con ese DNI y devuelve los datos del cliente
 * que la Routine necesita para despachar la boleta: wa_id (con código de país),
 * adelanto, saldo, código de seguimiento, courier y clave.
 */
export async function onRequestGetVentasLista({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const url = new URL(request.url);
  const dni = soloDigitos(url.searchParams.get("dni") || "");
  if (!dni || dni.length < 7) return json({ error: "dni inválido (mínimo 7 dígitos)." }, 400);
  try {
    const filas = await leerFilas(env);
    const hallada = buscarFila(filas, { dni });
    if (!hallada) return json({ encontrado: false });
    const { valores } = hallada;
    const celdaContact = String(valores[indiceVenta("DNI / WSP")] || "");
    // Extrae número de teléfono de la celda (puede ser "45781234 / 987654321" o solo "987654321")
    const partes = celdaContact.split("/").map((s) => soloDigitos(s.trim())).filter(Boolean);
    const tel = partes.find((p) => p.length >= 9) || "";
    // Normalizar a wa_id con código de país (Perú = 51)
    const waId = tel.length === 9 ? "51" + tel : tel.length >= 11 ? tel : "";
    return json({
      encontrado: true,
      wa_id: waId || null,
      dni: partes.find((p) => p.length <= 9 && p.length >= 7 && p !== tel) || dni,
      adelanto: String(valores[indiceVenta("Adelanto")] || ""),
      saldo: String(valores[indiceVenta("Saldo")] || ""),
      codigo: String(valores[indiceVenta("Código")] || ""),
      courier: String(valores[indiceVenta("Envío")] || ""),
      clave: String(valores[indiceVenta("Clave Shalom / Notas")] || ""),
      estado: String(valores[indiceVenta("Estado")] || "")
    });
  } catch (err) {
    console.error("Asesor ventas-lista:", err.message);
    return json({ error: err.message }, 502);
  }
}

export { COLUMNAS_VENTA };
