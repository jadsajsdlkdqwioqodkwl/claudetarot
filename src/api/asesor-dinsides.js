/**
 * Pedidos de Lima → Dinsides Courier (dueño, 2026-11-08). Lo que antes hacía la asesora pegando el chat en un Project de Claude
 * y corriendo un script en la consola del navegador, ahora lo arma el Worker con lo que el sistema ya sabe (registro del reporte
 * «Pedidos y ventas», hoja «Pedidos auto», el chat: pin de ubicación, nombre) y lo registra en Dinsides por su propia API web.
 * Una persona interviene SOLO donde hace falta: dirección y distrito dudosos, zona roja, estados sin confirmar (`bloqueos`).
 *
 *   GET  /api/asesor/dinsides?fecha=AAAA-MM-DD      (x-asesor-clave)  fecha = día de ENTREGA (por defecto, mañana según la regla)
 *        → { fecha, fecha_venta, credenciales, pedidos: [ficha…], registrados, candidatos_crm }
 *          ficha = armarPedido() + { whatsapp, conversation_id, origen, estado_reporte, direcciones_chat, hoja: {fila, dinsides} }
 *          candidatos_crm = chats de la noche con pin o dirección en texto o compra marcada que NO están en el reporte: la
 *          «cuarta corrida» que revisa que no se quede nadie fuera.
 *   GET  /api/asesor/dinsides?zona=lat,lng           → en qué zona del mapa de cobertura cae un punto.
 *   POST /api/asesor/dinsides { accion: "probar" }   → entra a Dinsides y lee el formulario real (sin registrar nada): opciones de
 *          traslado, turnos, tipos de pago y diferencias de la tabla de distritos frente al repo.
 *   POST { accion: "registrar", fecha, pedidos: [{ whatsapp, …correcciones }], simular?: true }
 *          → arma cada ficha (lo del sistema + las correcciones que mande la Routine o la persona: distrito, direccion, coordenadas,
 *            nombre, telefono, cobrar, tipo_pago, nota, fecha_entrega, kits, empaque), descarta los que tienen bloqueos o ya se
 *            registraron, y manda UN listado a Dinsides. Con `simular` hace todo menos el POST final (pedido de prueba sin crear nada).
 *            Después de registrar: memoria en R2 (dinsides/FECHA.json + dinsides/indice.json), columna «Dinsides» y «Enviado» de la
 *            hoja «Pedidos auto», etiqueta `dinsides_registrado` en el chat. Sin credenciales responde 503 con el script de consola.
 *   POST { accion: "marcar", fecha, whatsapp, nro?, motivo? } → lo registró una persona a mano: misma memoria, sin tocar Dinsides.
 *   POST { accion: "script", fecha, pedidos? }  → el script de consola (F12) para las fichas listas, por si se quiere hacer a mano.
 *
 * Reglas: nunca escribe al cliente; nunca inventa dirección ni distrito; nunca registra dos veces el mismo WhatsApp en 3 días
 * (salvo `forzar`); todo lo que no registró lo devuelve con el motivo para que la Routine lo reporte.
 */
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { armarPedido, fechaEntrega, hoyLima, zonaDe, scriptConsola, payloadRegistro, resumenFicha, limpiarCoordenadas, buscarDistrito } from "../lib/dinsides.js";
import { login, formulario, registrar as registrarEnDinsides, hayCredenciales, listado, anular as anularEnDinsides, editar as editarEnDinsides, claseSeguimiento } from "../lib/dinsides-cliente.js";
import { filasPedidosAuto, marcarDinsidesEnHoja, upsertPedidosAuto } from "./asesor-pedidos-sheet.js";
import { agregarEtiquetaMeta } from "../lib/crm-db.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const LIMA_MS = 5 * 3600 * 1000;
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const n9 = (v) => String(v ?? "").replace(/\D/g, "").slice(-9);
const sumarDias = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const ahoraLima = () => new Date(Date.now() - LIMA_MS).toISOString().replace("T", " ").slice(0, 16);
const sqlFecha = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const DIRECCION_RE = /\b(av|avenida|jr|jiron|jirón|calle|ca|mz|mza|manzana|lt|lote|urb|urbanizacion|urbanización|psje|pasaje|dpto|departamento|piso|block|cuadra|altura|referencia|ref|frente|espalda|costado|esquina|paradero|km)\b/i;

async function puerta(request, env) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB || !env.CRM_MEDIA) return json({ error: "Falta la base o el almacenamiento del CRM." }, 503);
  return null;
}

// ---------- memoria en R2 ----------
async function leerJson(env, key, porDefecto) {
  const obj = await env.CRM_MEDIA.get(key);
  if (!obj) return porDefecto;
  try { return JSON.parse(await obj.text()); } catch { return porDefecto; }
}
const escribirJson = (env, key, datos) => env.CRM_MEDIA.put(key, JSON.stringify(datos), { httpMetadata: { contentType: "application/json" } });
const registroDe = (env, fecha) => leerJson(env, `dinsides/${fecha}.json`, { fecha, registros: [], corridas: [] });
const indice = (env) => leerJson(env, "dinsides/indice.json", {});

async function anotarRegistros(env, fecha, nuevos, corrida) {
  const reg = await registroDe(env, fecha);
  const idx = await indice(env);
  for (const r of nuevos) {
    reg.registros = reg.registros.filter((x) => n9(x.whatsapp) !== n9(r.whatsapp));
    reg.registros.push(r);
    idx[n9(r.whatsapp)] = { fecha, cuando: r.cuando, modo: r.modo, nombre: r.nombre, nro: r.nro || "" };
  }
  reg.corridas.push({ ...corrida, cuando: ahoraLima(), registrados: nuevos.length });
  await escribirJson(env, `dinsides/${fecha}.json`, reg);
  await escribirJson(env, "dinsides/indice.json", idx);
  return reg;
}

// ---------- lo que el sistema sabe de cada pedido ----------
async function datosDelChat(env, whatsapp) {
  const wa = n9(whatsapp);
  if (!wa) return null;
  const conv = await env.CRM_DB.prepare(
    `SELECT conv.id, conv.assigned_agent, conv.meta_tags, c.wa_id, COALESCE(c.name, c.profile_name, '') AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE substr(c.wa_id, -9) = ? ORDER BY conv.id DESC LIMIT 1`
  ).bind(wa).first();
  if (!conv) return null;
  const pin = await env.CRM_DB.prepare(
    "SELECT body, created_at FROM messages WHERE conversation_id = ? AND direction = 'in' AND type = 'location' ORDER BY id DESC LIMIT 1"
  ).bind(conv.id).first();
  const { results } = await env.CRM_DB.prepare(
    "SELECT body, created_at FROM messages WHERE conversation_id = ? AND direction = 'in' AND type = 'text' AND created_at >= ? ORDER BY id DESC LIMIT 60"
  ).bind(conv.id, sqlFecha(new Date(Date.now() - 4 * 86400000))).all();
  const direcciones = (results || []).map((m) => String(m.body || "").trim())
    .filter((b) => b.length >= 8 && (DIRECCION_RE.test(b) || /maps\.|goo\.gl|-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/i.test(b)))
    .reverse().slice(-6).map((b) => b.slice(0, 220));
  return {
    conversation_id: conv.id, asesora: conv.assigned_agent || "", nombre_crm: conv.nombre, etiquetas: conv.meta_tags || "",
    ubicacion: pin?.body || "", ubicacion_cuando: pin?.created_at || "", direcciones_chat: direcciones,
    ya_etiquetado: / dinsides_registrado /.test(` ${conv.meta_tags || ""} `)
  };
}

/** Pedidos de Lima para esa fecha de entrega: registro del reporte (pedidos-estado) + filas de la hoja «Pedidos auto». */
async function pedidosDelSistema(env, fecha) {
  const estado = await leerJson(env, `pedidos-estado/${fecha}.json`, null);
  const porWa = new Map();
  for (const p of estado?.pedidos || []) {
    const k = n9(p.whatsapp);
    if (!k) continue;
    porWa.set(k, { ...p, origen: "reporte" });
  }
  let hoja = [];
  if (env.GOOGLE_SHEET_ID) { try { hoja = await filasPedidosAuto(env); } catch (err) { hoja = []; console.error("dinsides: hoja", err.message); } }
  const hojaPorWa = new Map();
  for (const f of hoja) {
    const k = n9(f.whatsapp);
    if (!k || f.enviado) continue;
    if (f.fecha_entrega !== fecha && !(porWa.has(k) && !f.fecha_entrega)) continue;
    hojaPorWa.set(k, f);
    if (!porWa.has(k)) {
      porWa.set(k, { nombre: f.nombre, whatsapp: f.whatsapp, destino: f.destino, estado: String(f.estado || "").split(" / ")[0], vendedora: f.vendedora,
        direccion_o_agencia: f.direccion_o_agencia, kits: f.kits, empaque: f.empaque, pago: f.pago, nota: f.nota, fecha_entrega: f.fecha_entrega, origen: "hoja" });
    }
  }
  return { pedidos: [...porWa.values()], hoja: hojaPorWa, estado_existe: Boolean(estado), conocidos: new Set(porWa.keys()) };
}

/** Lo que una persona escribió en la columna «Dinsides» de la hoja: «ok», «distrito: Comas», «manual 1234», «no». */
function leerColumnaDinsides(texto) {
  const t = String(texto || "").trim();
  if (!t) return {};
  const out = { texto: t };
  if (/^(no|omitir|saltar|descartar)\b/i.test(t)) out.omitir = t;
  if (/^manual\b/i.test(t) || /^registrad[oa]\b/i.test(t)) out.hecho = t;
  const d = t.match(/distrito\s*[:=]\s*([^;|\n]+)/i);
  if (d) out.distrito = d[1].trim();
  const dir = t.match(/direcci[oó]n\s*[:=]\s*([^;|\n]+)/i);
  if (dir) out.direccion = dir[1].trim();
  const c = t.match(/coord(?:enadas)?\s*[:=]\s*(-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+)/i);
  if (c) out.coordenadas = c[1];
  if (/^ok\b/i.test(t)) out.ok = true;
  return out;
}

async function armarTodo(env, fecha, correcciones = new Map()) {
  const { pedidos, hoja, conocidos } = await pedidosDelSistema(env, fecha);
  const reg = await registroDe(env, fecha);
  const idx = await indice(env);
  const registradosPorWa = new Map(reg.registros.filter((r) => !r.anulado).map((r) => [n9(r.whatsapp), r]));
  const fechaObjetivo = fecha;
  const fichas = [];
  for (const p of pedidos) {
    const k = n9(p.whatsapp);
    const destino = String(p.destino || "").toUpperCase();
    if (destino === "PROVINCIA") continue;
    const chat = await datosDelChat(env, k).catch(() => null);
    const fila = hoja.get(k);
    const col = leerColumnaDinsides(fila?.dinsides);
    const corr = correcciones.get(k) || {};
    const base = {
      ...p, nombre: corr.nombre || p.nombre || chat?.nombre_crm || "", ubicacion: chat?.ubicacion || "",
      direccion_o_agencia: corr.direccion || col.direccion || (fila?.direccion_o_agencia && fila.direccion_o_agencia !== p.direccion_o_agencia && fila.actualizado > (p.actualizado || "") ? fila.direccion_o_agencia : p.direccion_o_agencia),
      distrito: corr.distrito || col.distrito || p.distrito || "", coordenadas: corr.coordenadas || col.coordenadas || p.coordenadas || "",
      telefono: corr.telefono || p.telefono || "", cobrar: corr.cobrar ?? p.cobrar, tipo_pago: corr.tipo_pago || p.tipo_pago,
      nota: corr.nota ?? p.nota, fecha_entrega: corr.fecha_entrega || p.fecha_entrega || "", kits: corr.kits ?? p.kits, empaque: corr.empaque ?? p.empaque,
      estado: corr.estado || (col.ok ? "CONFIRMADO" : p.estado)
    };
    const f = armarPedido(base, { fecha_objetivo: fechaObjetivo });
    f.whatsapp = "51" + k;
    f.conversation_id = chat?.conversation_id || null;
    f.asesora = p.vendedora || chat?.asesora || "";
    f.origen = p.origen;
    f.estado_reporte = p.estado || "";
    f.destino = destino || "?";
    f.direcciones_chat = chat?.direcciones_chat || [];
    f.ubicacion = chat?.ubicacion ? { body: chat.ubicacion, cuando: chat.ubicacion_cuando } : null;
    f.hoja = fila ? { fila: fila.fila, dinsides: fila.dinsides || "", enviado: fila.enviado || "" } : null;
    if (!destino) f.bloqueos.unshift("DESTINO sin definir en el reporte: confirmar que es Lima");
    if (col.omitir) f.bloqueos.unshift(`La hoja dice «${col.omitir}»: no se registra`);
    const ya = registradosPorWa.get(k) || (idx[k] && Math.abs(new Date(idx[k].fecha) - new Date(fecha)) <= 3 * 86400000 ? idx[k] : null);
    if (col.hecho) f.ya_registrado = { modo: "manual (hoja)", detalle: col.hecho };
    else if (ya) f.ya_registrado = { modo: ya.modo, cuando: ya.cuando, fecha: ya.fecha || fecha, nro: ya.nro || "" };
    // La etiqueta del chat NO bloquea (un cliente puede volver a comprar; 2026-11-08): solo avisa. La memoria R2 (3 días) sí bloquea.
    else if (chat?.ya_etiquetado) f.alertas.push("el chat ya tiene la etiqueta dinsides_registrado (un pedido anterior); verificar que no sea repetido");
    f.listo = f.listo && !f.ya_registrado;
    fichas.push(f);
  }
  // Pedidos que la Routine agrega (candidatos del CRM que el reporte no trae): vienen completos en la corrección.
  for (const [k, corr] of correcciones) {
    if (fichas.some((f) => n9(f.whatsapp) === k) || !(corr.direccion || corr.distrito || corr.nombre)) continue;
    const chat = await datosDelChat(env, k).catch(() => null);
    const base = { whatsapp: "51" + k, nombre: corr.nombre || chat?.nombre_crm || "", direccion_o_agencia: corr.direccion || "", distrito: corr.distrito || "",
      coordenadas: corr.coordenadas || "", ubicacion: chat?.ubicacion || "", telefono: corr.telefono || "", cobrar: corr.cobrar, tipo_pago: corr.tipo_pago,
      nota: corr.nota || "", fecha_entrega: corr.fecha_entrega || "", kits: corr.kits, empaque: corr.empaque, estado: corr.estado || "CONFIRMADO", destino: "LIMA" };
    const f = armarPedido(base, { fecha_objetivo: fechaObjetivo });
    f.whatsapp = "51" + k; f.conversation_id = chat?.conversation_id || null; f.asesora = chat?.asesora || ""; f.origen = "routine"; f.estado_reporte = base.estado;
    f.destino = "LIMA"; f.direcciones_chat = chat?.direcciones_chat || []; f.ubicacion = chat?.ubicacion ? { body: chat.ubicacion } : null; f.hoja = null; f.base = base;
    const ya = registradosPorWa.get(k) || (idx[k] && Math.abs(new Date(idx[k].fecha) - new Date(fecha)) <= 3 * 86400000 ? idx[k] : null);
    if (ya) f.ya_registrado = { modo: ya.modo, cuando: ya.cuando, fecha: ya.fecha || fecha, nro: ya.nro || "" };
    else if (chat?.ya_etiquetado) f.alertas.push("el chat ya tiene la etiqueta dinsides_registrado (un pedido anterior); verificar que no sea repetido");
    f.listo = f.listo && !f.ya_registrado;
    fichas.push(f);
  }
  await comprobarConElMapa(fichas.filter((f) => f.listo));
  return { fichas, registro: reg, conocidos };
}

/** Cruza el historial de Dinsides con las filas de «Pedidos auto» y los chats: los ojos del reporte. */
async function cruzarEstados(env, cookie, { desde, hasta, marcar }) {
  const lista = await listado(env, cookie, { desde, hasta });
  let hoja = [];
  if (env.GOOGLE_SHEET_ID) { try { hoja = await filasPedidosAuto(env); } catch (err) { console.error("dinsides estados: hoja", err.message); } }
  const porTel = new Map();
  for (const f of hoja) { const k = n9(f.whatsapp); if (k) (porTel.get(k) || porTel.set(k, []).get(k)).push(f); }
  const resumen = { entregados: [], anulados: [], rechazados: [], pendientes: [], otros: [], sin_fila_en_hoja: [], marcados: 0, etiquetados: 0 };
  for (const ped of lista) {
    const clase = claseSeguimiento(ped.seguimiento);
    // Un pedido anulado no marca la fila si ese mismo teléfono tiene otro pedido vigente para la misma entrega (duplicado anulado).
    if (clase === "anulado" && lista.some((o) => o !== ped && o.telefono === ped.telefono && o.fecha_entrega === ped.fecha_entrega && claseSeguimiento(o.seguimiento) !== "anulado")) {
      resumen.anulados.push({ id_pedido: ped.id_pedido, nombre: ped.nombre, telefono: ped.telefono, distrito: ped.distrito, fecha_entrega: ped.fecha_entrega, seguimiento: ped.seguimiento, monto: ped.monto_cobrar, duplicado_anulado: true });
      continue;
    }
    const filas = porTel.get(ped.telefono) || [];
    const fila = filas.find((f) => f.fecha_entrega === ped.fecha_entrega) || filas.find((f) => !f.enviado) || filas[filas.length - 1] || null;
    const item = { id_pedido: ped.id_pedido, nombre: ped.nombre, telefono: ped.telefono, distrito: ped.distrito, fecha_entrega: ped.fecha_entrega, seguimiento: ped.seguimiento,
      monto: ped.monto_cobrar, fila_hoja: fila?.fila || null, dinsides_hoja: fila?.dinsides || "" };
    (resumen[{ entregado: "entregados", anulado: "anulados", rechazado: "rechazados", pendiente: "pendientes" }[clase] || "otros"]).push(item);
    if (!fila) { if (clase !== "anulado") resumen.sin_fila_en_hoja.push(item); continue; }
    if (!marcar) continue;
    const yaDice = String(fila.dinsides || "").toLowerCase();
    if (clase === "entregado" && !/entregado/.test(yaDice)) {
      await marcarDinsidesEnHoja(env, fila.whatsapp, `entregado ${ped.fecha_entrega} #${ped.id_pedido}`, `Dinsides entregado ${ped.fecha_entrega}`).catch(() => null);
      resumen.marcados++;
      const chat = await datosDelChat(env, ped.telefono).catch(() => null);
      if (chat?.conversation_id) { await agregarEtiquetaMeta(env.CRM_DB, chat.conversation_id, "dinsides_entregado").catch(() => null); resumen.etiquetados++; }
    } else if ((clase === "anulado" || clase === "rechazado") && !/anulado|rechazado/.test(yaDice)) {
      await marcarDinsidesEnHoja(env, fila.whatsapp, `${clase} ${ped.fecha_entrega} #${ped.id_pedido}: ${ped.seguimiento}`).catch(() => null);
      resumen.marcados++;
      const chat = await datosDelChat(env, ped.telefono).catch(() => null);
      if (chat?.conversation_id) { await agregarEtiquetaMeta(env.CRM_DB, chat.conversation_id, `dinsides_${clase}`).catch(() => null); resumen.etiquetados++; }
    }
  }
  resumen.total = lista.length;
  return resumen;
}

/** Chats de la noche (y del día anterior) con pinta de pedido de Lima que el reporte no trae (pin, dirección en texto o compra marcada). */
async function candidatosCrm(env, fechaVenta, conocidos) {
  const ini = new Date(`${fechaVenta}T00:00:00Z`).getTime() + LIMA_MS - 86400000;
  const desde = sqlFecha(new Date(ini));
  const { results } = await env.CRM_DB.prepare(
    `SELECT conv.id AS conversation_id, conv.assigned_agent, conv.meta_tags, c.wa_id, COALESCE(c.name, c.profile_name, '') AS nombre,
            m.type, m.body, m.created_at
     FROM messages m JOIN conversations conv ON conv.id = m.conversation_id JOIN contacts c ON c.id = conv.contact_id
     WHERE m.created_at >= ? AND m.direction = 'in'
       AND (m.type = 'location' OR (m.type = 'text' AND (instr(lower(m.body), ' av') > 0 OR instr(lower(m.body), 'jr') > 0 OR instr(lower(m.body), 'calle') > 0
            OR instr(lower(m.body), 'mz') > 0 OR instr(lower(m.body), 'lote') > 0 OR instr(lower(m.body), 'urb') > 0 OR instr(lower(m.body), 'dpto') > 0
            OR instr(lower(m.body), 'referencia') > 0 OR instr(lower(m.body), 'pasaje') > 0 OR instr(lower(m.body), 'maps') > 0 OR instr(lower(m.body), 'distrito') > 0)))
     ORDER BY m.id DESC LIMIT 400`
  ).bind(desde).all();
  const porWa = new Map();
  for (const r of results || []) {
    const k = n9(r.wa_id);
    if (!k || conocidos.has(k)) continue;
    const body = String(r.body || "");
    const esPin = r.type === "location";
    if (!esPin && !(DIRECCION_RE.test(body) || /maps\.|goo\.gl/i.test(body))) continue;
    const c = porWa.get(k) || { whatsapp: r.wa_id, nombre: r.nombre, conversation_id: r.conversation_id, asesora: r.assigned_agent || "",
      compra_marcada: / purchase /.test(` ${r.meta_tags || ""} `), senales: [] };
    if (c.senales.length < 3) c.senales.push(esPin ? `pin ${body.split("|").slice(0, 2).join(",")}` : body.slice(0, 160));
    porWa.set(k, c);
  }
  const { results: compras } = await env.CRM_DB.prepare(
    `SELECT c.wa_id, COALESCE(c.name, c.profile_name, '') AS nombre, conv.id AS conversation_id, conv.assigned_agent
     FROM capi_events e JOIN conversations conv ON conv.id = e.conversation_id JOIN contacts c ON c.id = conv.contact_id
     WHERE e.event_name = 'Purchase' AND e.created_at >= ? ORDER BY e.id DESC LIMIT 100`
  ).bind(desde).all();
  for (const r of compras || []) {
    const k = n9(r.wa_id);
    if (!k || conocidos.has(k)) continue;
    const c = porWa.get(k) || { whatsapp: r.wa_id, nombre: r.nombre, conversation_id: r.conversation_id, asesora: r.assigned_agent || "", senales: [] };
    c.compra_marcada = true;
    porWa.set(k, c);
  }
  const PROVINCIA_RE = /shalom|olva|agencia|provincia|arequipa|trujillo|cusco|chiclayo|piura|huancayo|\bica\b|tacna|chimbote|iquitos|puno|juliaca|cajamarca|huaraz|ayacucho|pucallpa|tarapoto|huanuco|hu[aá]nuco/i;
  return [...porWa.values()].slice(0, 40).map((c) => ({ ...c, parece_provincia: c.senales.some((s) => PROVINCIA_RE.test(s)) }));
}

/**
 * Dirección en texto → lat,lng aproximada con Nominatim (OpenStreetMap, gratis, 1 consulta por segundo). Solo para comprobar
 * contra el mapa de cobertura de Dinsides si la dirección cae en el distrito que dice el texto; nunca se manda a Dinsides.
 */
async function geocodificar(direccion, distrito) {
  const q = `${direccion}, ${distrito || ""}, Lima, Perú`.replace(/\s+/g, " ");
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pe&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "TarotStore-CRM/1.0 (registro de pedidos)", Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const [hit] = await res.json();
    if (!hit) return null;
    const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
    if (lat < -12.9 || lat > -11.4 || lng < -77.4 || lng > -76.4) return null;
    return { lat, lng, nombre: String(hit.display_name || "").slice(0, 160) };
  } catch { return null; }
}

async function comprobarConElMapa(fichas) {
  let n = 0;
  for (const f of fichas) {
    if (f.campos.coordenadas || !f.campos.direccion || !f.campos.distrito || n >= 12) continue;
    n++;
    const g = await geocodificar(f.campos.direccion, f.campos.distrito);
    if (!g) continue;
    const z = zonaDe(g.lat, g.lng);
    f.geocodificado = { ...g, zona: z.nombre, clase: z.clase, distrito: z.distrito || null };
    f.distrito_fuentes.geocodificado = z.distrito || z.nombre;
    if (z.distrito && z.distrito !== f.campos.distrito) f.alertas.push(`MAPA: la dirección (ubicada por OpenStreetMap) cae en «${z.distrito}» en el mapa de Dinsides, no en «${f.campos.distrito}»; revisar el distrito`);
    else if (z.clase === "no_entrega") f.alertas.push(`MAPA: la dirección (ubicada por OpenStreetMap) cae en «${z.nombre}» (sin reparto); revisar`);
    await new Promise((r) => setTimeout(r, 1100));
  }
}

const fechaPorDefecto = () => fechaEntrega().fecha;

export async function onRequestGet({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const url = new URL(request.url);
  const zona = url.searchParams.get("zona");
  if (zona) {
    const c = limpiarCoordenadas(zona);
    if (!c) return json({ error: "zona debe ser lat,lng o un link de Maps con coordenadas." }, 400);
    return json({ coordenadas: c, zona: zonaDe(c.lat, c.lng) });
  }
  const fecha = esIso(url.searchParams.get("fecha")) ? url.searchParams.get("fecha") : fechaPorDefecto();
  try {
    if (url.searchParams.get("listado") === "1") {
      if (!hayCredenciales(env)) return json({ error: "sin_credenciales" }, 503);
      const { cookie } = await login(env);
      const lista = await listado(env, cookie, { desde: url.searchParams.get("desde") || "", hasta: url.searchParams.get("hasta") || "" });
      return json({ ok: true, total: lista.length, pedidos: lista });
    }
    const { fichas, registro, conocidos: delSistema } = await armarTodo(env, fecha);
    // Todo lo que el reporte ya trae (Lima, provincia, intención…) y lo ya registrado no es candidato.
    const conocidos = new Set([...delSistema, ...fichas.map((f) => n9(f.whatsapp)), ...registro.registros.map((r) => n9(r.whatsapp))]);
    const fechaVenta = sumarDias(fecha, -1);
    const candidatos = url.searchParams.get("candidatos") === "0" ? [] : await candidatosCrm(env, fechaVenta, conocidos);
    return json({
      fecha, fecha_venta: fechaVenta, hoy: hoyLima(), credenciales: hayCredenciales(env),
      resumen: { listos: fichas.filter((f) => f.listo).length, con_bloqueos: fichas.filter((f) => f.bloqueos.length && !f.ya_registrado).length,
        ya_registrados: fichas.filter((f) => f.ya_registrado).length, candidatos_crm: candidatos.length },
      pedidos: fichas, registrados: registro.registros, corridas: registro.corridas, candidatos_crm: candidatos
    });
  } catch (err) {
    console.error("asesor-dinsides GET:", err.message);
    return json({ error: err.message }, 502);
  }
}

async function despuesDeRegistrar(env, fecha, fichas, modo, extra = {}) {
  const cuando = ahoraLima();
  const nuevos = fichas.map((f) => ({ whatsapp: f.whatsapp, nombre: f.campos.nombre, nro: f.nro || extra.nro || "", campos: f.campos, cuando, modo, fecha_entrega: f.campos.fecha_entrega, ...extra }));
  await anotarRegistros(env, fecha, nuevos, { modo, origen: extra.origen || "" });
  const hoja = [], etiquetas = [];
  for (const f of fichas) {
    const nro = f.nro || extra.nro || "";
    const texto = modo === "manual" ? `manual ${nro} ${cuando}`.replace(/\s+/g, " ").trim() : `registrado ${cuando}${nro ? ` #${nro}` : ""}`;
    hoja.push(await marcarDinsidesEnHoja(env, f.whatsapp, texto, `Dinsides ${f.campos.fecha_entrega}`).catch((err) => ({ error: err.message })));
    if (f.conversation_id) etiquetas.push(await agregarEtiquetaMeta(env.CRM_DB, f.conversation_id, "dinsides_registrado").then(() => "ok").catch((err) => err.message));
  }
  return { hoja, etiquetas };
}

export async function onRequestPost({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const p = await request.json().catch(() => null);
  if (!p?.accion) return json({ error: "Falta accion (probar | registrar | marcar | script | estados | anular | editar)." }, 400);
  const fecha = esIso(p.fecha) ? p.fecha : fechaPorDefecto();
  try {
    if (p.accion === "estados") {
      if (!hayCredenciales(env)) return json({ error: "sin_credenciales" }, 503);
      const { cookie } = await login(env);
      const r = await cruzarEstados(env, cookie, { desde: esIso(p.desde) ? p.desde : "", hasta: esIso(p.hasta) ? p.hasta : "", marcar: p.marcar !== false });
      return json({ ok: true, ...r });
    }
    if (p.accion === "anular") {
      if (!hayCredenciales(env)) return json({ error: "sin_credenciales" }, 503);
      const ids = (Array.isArray(p.ids) ? p.ids : [p.id]).map((x) => String(x || "").replace(/\D/g, "")).filter(Boolean);
      if (!ids.length) return json({ error: "Falta id o ids del pedido a anular." }, 400);
      const { cookie } = await login(env);
      const antes = await listado(env, cookie, {});
      const mios = ids.filter((id) => antes.some((x) => x.id_pedido === id));
      if (!mios.length) return json({ error: "Ninguno de esos ids está en el listado de pedidos de este negocio." }, 404);
      const r = await anularEnDinsides(env, cookie, mios);
      const despues = (await listado(env, cookie, {})).filter((x) => mios.includes(x.id_pedido)).map((x) => ({ id_pedido: x.id_pedido, nombre: x.nombre, seguimiento: x.seguimiento,
        en_ruta: Boolean(r.resultados.find((y) => y.id_pedido === x.id_pedido)?.en_ruta) }));
      // Memoria: el registro queda marcado como anulado (deja de contar como registrado) y sale del índice por WhatsApp.
      const reg = await registroDe(env, fecha);
      const idx = await indice(env);
      const hojaAnulados = [];
      for (const x of despues) {
        const m = reg.registros.find((y) => String(y.nro) === x.id_pedido);
        if (!m) continue;
        m.anulado = ahoraLima(); m.seguimiento = x.seguimiento;
        const k = n9(m.whatsapp);
        if (idx[k] && String(idx[k].nro || "") === x.id_pedido) delete idx[k];
        hojaAnulados.push(await marcarDinsidesEnHoja(env, m.whatsapp, `anulado #${x.id_pedido} ${ahoraLima()}${p.motivo ? `: ${String(p.motivo).slice(0, 80)}` : ""}`).catch((err) => ({ error: err.message })));
      }
      reg.corridas.push({ modo: "anular", ids: mios, cuando: ahoraLima(), motivo: String(p.motivo || "") });
      await escribirJson(env, `dinsides/${fecha}.json`, reg);
      await escribirJson(env, "dinsides/indice.json", idx);
      return json({ ok: r.ok, resultados: r.resultados, anulados: despues, hoja: hojaAnulados, no_eran_mios: ids.filter((id) => !mios.includes(id)) });
    }
    if (p.accion === "editar") {
      // { accion: "editar", id, cambios: { fecha_entrega?, direccion?, distrito? (nombre) | id_distrito?, nombre?, telefono?, cobrar?, tipo_pago?, obs?, producto? } }
      if (!hayCredenciales(env)) return json({ error: "sin_credenciales" }, 503);
      const id = String(p.id || "").replace(/\D/g, "");
      const cambios = { ...(p.cambios || {}) };
      if (!id || !Object.keys(cambios).length) return json({ error: "Faltan id y cambios." }, 400);
      if (cambios.distrito && !cambios.id_distrito) {
        const d = buscarDistrito(cambios.distrito);
        if (!d) return json({ error: `Distrito «${cambios.distrito}» no está en el desplegable de Dinsides.` }, 400);
        cambios.id_distrito = d.codigo; cambios.monto_service = cambios.monto_service ?? String(d.tarifa);
      }
      delete cambios.distrito;
      if (cambios.fecha_entrega && (!esIso(cambios.fecha_entrega) || cambios.fecha_entrega < hoyLima())) return json({ error: "fecha_entrega debe ser AAAA-MM-DD y no pasada." }, 400);
      const { cookie } = await login(env);
      const r = await editarEnDinsides(env, cookie, id, cambios);
      if (!r.ok) return json({ error: "dinsides_rechazo", detalle: `Dinsides no aceptó la edición (respuesta ${JSON.stringify(r.respuesta)}); si ya está EN RUTA no se puede editar`, enviado: r.enviado }, 502);
      const reg = await registroDe(env, fecha);
      reg.corridas.push({ modo: "editar", id, cambios, cuando: ahoraLima() });
      await escribirJson(env, `dinsides/${fecha}.json`, reg);
      return json({ ok: true, id, cambios, antes: { nombre: r.antes.nombre_destinataio, telefono: r.antes.telefono_destinatario, distrito: r.antes.nombre_distrito, direccion: r.antes.direccion_destinatario,
        fecha_entrega: String(r.antes.fecha_entrega || "").slice(0, 10), cobrar: r.antes.monto_cobrar, tipo_pago: r.antes.metodo_pago, obs: r.antes.observaciones } });
    }
    if (p.accion === "probar") {
      if (!hayCredenciales(env)) return json({ error: "sin_credenciales", detalle: "Faltan los secretos DINSIDES_TLF y DINSIDES_CLAVE del Worker (wrangler secret put)." }, 503);
      const { cookie, perfil } = await login(env);
      const form = await formulario(env, cookie);
      return json({ ok: true, perfil, formulario: { ...form, distritos: form.distritos.length } , distritos: form.distritos });
    }

    const correcciones = new Map();
    for (const x of Array.isArray(p.pedidos) ? p.pedidos : []) { const k = n9(x?.whatsapp); if (k) correcciones.set(k, x); }

    if (p.accion === "marcar") {
      const k = n9(p.whatsapp);
      if (!k) return json({ error: "Falta whatsapp." }, 400);
      const { fichas } = await armarTodo(env, fecha, correcciones);
      let f = fichas.find((x) => n9(x.whatsapp) === k);
      if (!f) f = { ...armarPedido({ whatsapp: k, nombre: p.nombre || "", direccion_o_agencia: p.direccion || "", distrito: p.distrito || "" }, { fecha_objetivo: fecha }), whatsapp: "51" + k, conversation_id: (await datosDelChat(env, k))?.conversation_id || null };
      const r = await despuesDeRegistrar(env, fecha, [f], "manual", { nro: String(p.nro || ""), motivo: String(p.motivo || ""), origen: String(p.origen || "") });
      return json({ ok: true, whatsapp: f.whatsapp, nombre: f.campos.nombre, ...r });
    }

    const { fichas } = await armarTodo(env, fecha, correcciones);
    const soloEstos = correcciones.size ? fichas.filter((f) => correcciones.has(n9(f.whatsapp))) : fichas;
    const listos = soloEstos.filter((f) => f.listo || (p.forzar && !f.bloqueos.some((b) => /^(TELÉFONO|DESTINO PROVINCIA)/.test(b)) && !f.ya_registrado));
    const noVan = soloEstos.filter((f) => !listos.includes(f)).map((f) => ({ whatsapp: f.whatsapp, nombre: f.campos.nombre, ya_registrado: f.ya_registrado || null, bloqueos: f.bloqueos, resumen: resumenFicha(f) }));
    const pedidosFaltantes = [...correcciones.keys()].filter((k) => !fichas.some((f) => n9(f.whatsapp) === k)).map((k) => "51" + k);

    if (p.accion === "script") {
      return json({ ok: true, fecha, script: scriptConsola(listos), listos: listos.map((f) => f.campos), no_van: noVan, sin_pedido_en_el_sistema: pedidosFaltantes });
    }
    if (p.accion !== "registrar") return json({ error: "accion inválida (probar | registrar | marcar | script)." }, 400);

    if (!listos.length) return json({ ok: true, fecha, registrados: [], no_van: noVan, sin_pedido_en_el_sistema: pedidosFaltantes, detalle: "No hay pedidos listos para registrar." });
    // Dinsides no acepta el mismo teléfono dos veces en un listado.
    const vistos = new Set();
    const lote = [];
    for (const f of listos) {
      if (vistos.has(f.campos.telefono)) { noVan.push({ whatsapp: f.whatsapp, nombre: f.campos.nombre, bloqueos: [`TELÉFONO ${f.campos.telefono} repetido en el listado`], resumen: resumenFicha(f) }); continue; }
      vistos.add(f.campos.telefono); lote.push(f);
    }
    if (!hayCredenciales(env)) {
      return json({ error: "sin_credenciales", detalle: "Faltan los secretos DINSIDES_TLF y DINSIDES_CLAVE del Worker: no se puede registrar solo. Abajo va el script para pegar en la consola de Dinsides.",
        fecha, script: scriptConsola(lote), listos: lote.map((f) => f.campos), no_van: noVan, sin_pedido_en_el_sistema: pedidosFaltantes }, 503);
    }
    const { cookie, perfil } = await login(env);
    const form = await formulario(env, cookie);
    const avisosForm = [...form.diferencias];
    if (!form.recojo.id_recojo) avisosForm.push("no se pudo elegir cómo se trasladan los pedidos (selectRecojo); revisar con `probar` y fijar DINSIDES_RECOJO_ID");
    for (const f of lote) {
      const real = form.distritos.find((d) => d.valor === f.campos.id_distrito);
      if (!real) f.alertas.push(`el código ${f.campos.id_distrito} (${f.campos.distrito}) no está hoy en el desplegable de Dinsides`);
      else if (real.tarifa !== undefined) f.campos.monto_service = String(real.tarifa);
    }
    const sinCodigo = lote.filter((f) => !form.distritos.some((d) => d.valor === f.campos.id_distrito));
    const paraEnviar = lote.filter((f) => !sinCodigo.includes(f));
    for (const f of sinCodigo) noVan.push({ whatsapp: f.whatsapp, nombre: f.campos.nombre, bloqueos: [`DISTRITO: el código ${f.campos.id_distrito} ya no existe en Dinsides; elegir otro`], resumen: resumenFicha(f) });
    // `traslado`: 1 = recoger en mi domicilio (por defecto), 2 = lo llevaré a la tienda Cercado (Av Arica 1702), 3 = tienda Gamarra.
    // Dinsides pide el 2 para regularizar un paquete que llegó a su almacén sin registro (devoluciones, 2026-11-03).
    const traslado = /^[123]$/.test(String(p.traslado || "")) ? String(p.traslado) : form.recojo.recojo;
    const payload = payloadRegistro(paraEnviar, { negocio: form.negocio, id_recojo: form.recojo.id_recojo, recojo: traslado, turno: form.turno });
    if (p.simular) {
      return json({ ok: true, simulado: true, fecha, perfil, formulario: { negocio: form.negocio, recojo: form.recojo, turno: form.turno, diferencias: form.diferencias },
        payload, listos: paraEnviar.map((f) => ({ whatsapp: f.whatsapp, campos: f.campos, alertas: f.alertas })), no_van: noVan, avisos: avisosForm, sin_pedido_en_el_sistema: pedidosFaltantes });
    }
    if (!paraEnviar.length) return json({ ok: true, fecha, registrados: [], no_van: noVan, avisos: avisosForm, sin_pedido_en_el_sistema: pedidosFaltantes });
    const r = await registrarEnDinsides(env, cookie, payload);
    if (!r.ok) return json({ error: "dinsides_rechazo", detalle: r.detalle, respuesta: r.respuesta, fecha, listos: paraEnviar.map((f) => f.campos), no_van: noVan, avisos: avisosForm }, 502);
    // El id que Dinsides le dio a cada pedido: se busca en el listado por teléfono y fecha de entrega (el POST no lo devuelve).
    let ids = {};
    try {
      const lista = await listado(env, cookie, {});
      for (const f of paraEnviar) {
        const m = lista.filter((x) => x.telefono === f.campos.telefono && x.fecha_entrega === f.campos.fecha_entrega).sort((a, b) => b.fecha_pedido.localeCompare(a.fecha_pedido))[0];
        if (m) ids[f.whatsapp] = m.id_pedido;
      }
    } catch (err) { console.error("dinsides: ids", err.message); }
    for (const f of paraEnviar) f.nro = ids[f.whatsapp] || "";
    // Dinsides responde 1 aunque descarte un pedido en silencio (p. ej. mismo teléfono que otro pedido abierto, 2026-11-08):
    // solo cuenta como registrado lo que aparece en su listado con su id. Lo demás se devuelve como «no confirmado».
    const confirmados = paraEnviar.filter((f) => f.nro);
    const noConfirmados = paraEnviar.filter((f) => !f.nro).map((f) => ({ whatsapp: f.whatsapp, nombre: f.campos.nombre, telefono: f.campos.telefono, fecha_entrega: f.campos.fecha_entrega,
      motivo: "Dinsides respondió 1 pero el pedido no aparece en su listado (¿teléfono repetido con otro pedido abierto?). No se dio por registrado; revisar en el panel o volver a intentar con otro teléfono." }));
    for (const x of noConfirmados) noVan.push({ whatsapp: x.whatsapp, nombre: x.nombre, bloqueos: [x.motivo], resumen: `${x.nombre} · ${x.telefono} · ${x.fecha_entrega}` });
    const despues = confirmados.length ? await despuesDeRegistrar(env, fecha, confirmados, "api", { origen: String(p.origen || ""), respuesta_dinsides: r.respuesta }) : {};
    // Los que el reporte no traía (los agregó la Routine) entran a la hoja «Pedidos auto» para que el reporte de la noche los vea.
    const nuevosEnHoja = confirmados.filter((f) => f.origen === "routine");
    if (nuevosEnHoja.length) {
      despues.hoja_nuevas = await upsertPedidosAuto(env, fecha, String(p.origen || "dinsides"), nuevosEnHoja.map((f) => ({
        nombre: f.campos.nombre, whatsapp: f.whatsapp, destino: "LIMA", estado: "CONFIRMADO", vendedora: f.asesora, direccion_o_agencia: f.campos.direccion,
        kits: f.base?.kits ?? 1, empaque: f.base?.empaque || "", pago: f.campos.tipo_pago, nota: f.campos.obs, fecha_entrega: f.campos.fecha_entrega, fecha_venta: sumarDias(fecha, -1)
      }))).catch((err) => ({ error: err.message }));
      for (const f of nuevosEnHoja) await marcarDinsidesEnHoja(env, f.whatsapp, `registrado ${ahoraLima()}${f.nro ? ` #${f.nro}` : ""}`, `Dinsides ${f.campos.fecha_entrega}`).catch(() => null);
    }
    return json({ ok: true, fecha, registrados: confirmados.map((f) => ({ whatsapp: f.whatsapp, nombre: f.campos.nombre, nro: f.nro || "", distrito: f.campos.distrito, fecha_entrega: f.campos.fecha_entrega, cobrar: f.campos.cobrar, tipo_pago: f.campos.tipo_pago, alertas: f.alertas })),
      no_confirmados: noConfirmados, no_van: noVan, avisos: avisosForm, sin_pedido_en_el_sistema: pedidosFaltantes, respuesta_dinsides: r.respuesta, ...despues });
  } catch (err) {
    console.error("asesor-dinsides POST:", err.message);
    const esCred = /sin_credenciales|inicio de sesión|DINSIDES_TLF/.test(err.message);
    return json({ error: esCred ? "credenciales" : err.message, detalle: err.message }, esCred ? 503 : 502);
  }
}
