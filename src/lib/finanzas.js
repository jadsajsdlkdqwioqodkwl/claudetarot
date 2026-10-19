/**
 * Finanzas del negocio (pedido del dueño, 2026-10-19): cuánto entró, cuánto costó, cuánto quedó y
 * en qué palanca conviene enfocarse: PRODUCTO (ofertas, upsells), CRO (convertir mejor el tráfico) o ADS (costos).
 *
 * Hecho para varios negocios: cada fila lleva `negocio` y las reglas salen de REGLAS_DE_FABRICA + fin_negocios.reglas.
 *
 * Reglas de Tarot Store Perú (dueño, 2026-10-19):
 *   · Costo del producto fijo: S/ 20 por kit.
 *   · Envío: Dinsides lo cobra y sale en su reporte; Shalom/Olva lo paga el cliente (costo 0 para el negocio).
 *   · Las devoluciones de Shalom no se leen ni se cuentan (estado «devuelto»: fuera de todo total).
 *   · Comisión: 10 % del valor del producto; Danitza 13 % (la calcula comisiones.js sobre las ventas del CRM,
 *     se haya recogido el pedido o no, y de ahí la toma este módulo para que haya una sola cuenta).
 *   · Anuncios: gasto real de Meta Ads (tabla fin_ads).
 *
 * Base de la cuenta: un pedido entra a la utilidad el día que se CIERRA (entregado/cobrado o rechazado); las
 * comisiones, los anuncios y los gastos entran el día en que ocurren. Los pedidos en camino se muestran aparte
 * («por cobrar»). Por eso una quincena puede mostrar ventas de la anterior que recién se cobraron.
 */

import { quincenaPorId, quincenaDe, fechaLima, calcularQuincena } from "./comisiones.js";

export const REGLAS_DE_FABRICA = {
  moneda: "PEN",
  costo_producto: 20,            // por unidad (kit)
  comision_fuente: "crm",        // 'crm' = comisiones.js (ventas marcadas COMPRA); 'pct' = comision_pct × valor cobrado
  comision_pct: 10,
  rechazado_paga_envio: true,    // un rechazado de Dinsides igual cuesta su envío (viaje de ida y vuelta)
  umbral_rechazo: 0.2,           // más de 20 % de pedidos rechazados = alerta
  couriers: {
    dinsides: { envio_lo_paga: "negocio" },
    shalom: { envio_lo_paga: "cliente" },
    olva: { envio_lo_paga: "cliente" },
    lima: { envio_lo_paga: "negocio" }
  }
};

export const ESTADOS = ["completado", "rechazado", "pendiente", "devuelto"];
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const dividir = (a, b) => (b ? a / b : null);

export function mezclarReglas(base, extra) {
  const out = { ...base, ...(extra || {}) };
  out.couriers = { ...base.couriers, ...((extra || {}).couriers || {}) };
  return out;
}

export async function reglasDe(db, negocio) {
  const fila = await db.prepare("SELECT nombre, moneda, reglas FROM fin_negocios WHERE negocio = ?").bind(negocio).first();
  if (!fila) return null;
  let extra = {};
  try { extra = JSON.parse(fila.reglas || "{}"); } catch { /* reglas dañadas: valen las de fábrica */ }
  return { nombre: fila.nombre, ...mezclarReglas(REGLAS_DE_FABRICA, { moneda: fila.moneda, ...extra }) };
}

/** Período: una quincena (2026-10-A), un mes (2026-10) o un rango libre desde..hasta. */
export function periodoDe({ quincena, mes, desde, hasta }, ahoraMs = Date.now()) {
  if (desde && hasta) return { id: `${desde}_${hasta}`, desde, hasta, etiqueta: `${desde} al ${hasta}`, quincenas: [] };
  if (mes) {
    const a = quincenaPorId(`${mes}-A`), b = quincenaPorId(`${mes}-B`);
    return { id: mes, desde: a.desde, hasta: b.hasta, etiqueta: `Mes ${mes} (${a.desde} al ${b.hasta})`, quincenas: [a.id, b.id] };
  }
  const q = quincena ? quincenaPorId(quincena) : quincenaDe(fechaLima(ahoraMs));
  return { id: q.id, desde: q.desde, hasta: q.hasta, etiqueta: q.etiqueta, quincenas: [q.id] };
}

/** Cuenta de un pedido. `devuelto` y `pendiente` no aportan nada a la utilidad. */
export function cuentaPedido(p, reglas) {
  const unidades = Math.max(Number(p.unidades) || 1, 1);
  const pagaEnvio = reglas.couriers?.[p.courier]?.envio_lo_paga !== "cliente";
  const envio = pagaEnvio ? Number(p.envio_costo) || 0 : 0;
  if (p.estado === "completado") {
    const costo = unidades * reglas.costo_producto;
    const ingreso = Number(p.valor) || 0;
    return { ingreso, costo_producto: costo, envio, margen: redondear(ingreso - costo - envio) };
  }
  if (p.estado === "rechazado") { // el kit vuelve al almacén: solo cuesta el envío, si el courier lo cobra
    const e = reglas.rechazado_paga_envio ? envio : 0;
    return { ingreso: 0, costo_producto: 0, envio: e, margen: redondear(-e) };
  }
  return { ingreso: 0, costo_producto: 0, envio: 0, margen: 0 };
}

/**
 * Cuenta pura de un período (sin base de datos, para poder probarla).
 * entrada: { pedidos (ya filtrados al período por fecha de cierre), pendientes, ads, gastos, comisiones, chats_anuncio, ventas_crm }
 */
export function resumir(entrada, reglas) {
  const { pedidos = [], pendientes = [], ads = [], gastos = [], comisiones = 0, ventas_crm = null, chats_anuncio = null } = entrada;
  const vivos = pedidos.filter((p) => p.estado !== "devuelto");
  const porCourier = {};
  const t = { ingresos: 0, costo_producto: 0, envios: 0, completados: 0, rechazados: 0 };
  for (const p of vivos) {
    if (p.estado !== "completado" && p.estado !== "rechazado") continue;
    const c = cuentaPedido(p, reglas);
    t.ingresos += c.ingreso; t.costo_producto += c.costo_producto; t.envios += c.envio;
    p.estado === "completado" ? t.completados++ : t.rechazados++;
    const k = (porCourier[p.courier] ||= { courier: p.courier, completados: 0, rechazados: 0, ingresos: 0, envios: 0, margen: 0 });
    p.estado === "completado" ? k.completados++ : k.rechazados++;
    k.ingresos += c.ingreso; k.envios += c.envio; k.margen += c.margen;
  }
  const a = ads.reduce((s, x) => ({
    gasto: s.gasto + (Number(x.gasto) || 0), impresiones: s.impresiones + (Number(x.impresiones) || 0), clics: s.clics + (Number(x.clics) || 0),
    conversaciones: s.conversaciones + (Number(x.conversaciones) || 0), compras: s.compras + (Number(x.compras) || 0), valor: s.valor + (Number(x.valor_compras) || 0)
  }), { gasto: 0, impresiones: 0, clics: 0, conversaciones: 0, compras: 0, valor: 0 });
  const otros = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const margenBruto = t.ingresos - t.costo_producto - t.envios;
  const utilidad = margenBruto - comisiones - a.gasto - otros;
  const cerrados = t.completados + t.rechazados;

  // Embudo: de qué se trata cada eslabón (y qué palanca lo mueve).
  const conversaciones = a.conversaciones || chats_anuncio || 0;
  const ventas = ventas_crm ?? cerrados;
  const kpis = {
    ticket: dividir(t.ingresos, t.completados),
    contribucion_por_pedido: dividir(margenBruto - comisiones, t.completados),   // lo que deja un pedido antes de anuncios
    costo_por_mensaje: dividir(a.gasto, conversaciones),
    mensaje_a_venta: dividir(ventas, conversaciones),                            // CRO: de chats de anuncio a venta
    venta_a_entrega: dividir(t.completados, cerrados),                           // 1 - rechazo
    tasa_rechazo: dividir(t.rechazados, cerrados),
    costo_por_pedido_entregado: dividir(a.gasto, t.completados),                 // CPA real
    roas_real: dividir(t.ingresos, a.gasto),
    ctr: dividir(a.clics, a.impresiones),
    comision_sobre_ingresos: dividir(comisiones, t.ingresos),
    utilidad_por_pedido: dividir(utilidad, t.completados),
    margen_pct: dividir(utilidad, t.ingresos)
  };
  for (const k of Object.keys(kpis)) if (kpis[k] !== null) kpis[k] = Math.round(kpis[k] * 10000) / 10000;

  const base = {
    ingresos: redondear(t.ingresos), costo_producto: redondear(t.costo_producto), envios: redondear(t.envios),
    margen_bruto: redondear(margenBruto), comisiones: redondear(comisiones), anuncios: redondear(a.gasto), otros_gastos: redondear(otros),
    utilidad: redondear(utilidad)
  };
  return {
    ...base,
    pedidos: { completados: t.completados, rechazados: t.rechazados, ventas_crm: ventas_crm, pendientes: pendientes.length,
               por_cobrar: redondear(pendientes.reduce((s, p) => s + (Number(p.valor) || 0), 0)) },
    ads: { ...a, gasto: redondear(a.gasto), valor: redondear(a.valor), chats_anuncio: chats_anuncio },
    por_courier: Object.values(porCourier).map((k) => ({ ...k, ingresos: redondear(k.ingresos), envios: redondear(k.envios), margen: redondear(k.margen) })),
    kpis,
    palancas: palancas(base, kpis),
    alertas: alertas(base, kpis, reglas, { cerrados, conversaciones, completados: t.completados })
  };
}

/**
 * ¿Dónde enfocarse? Sensibilidad simple: cuánta utilidad suma mejorar CADA palanca un 10 %, sin tocar las otras.
 *   · ADS: el mismo tráfico a 10 % menos de costo (sobra el 10 % del gasto).
 *   · CRO: 10 % más de pedidos entregados con el mismo gasto (se convierte mejor lo que ya se paga).
 *   · PRODUCTO: 10 % más de ticket por oferta/upsell (cuesta lo mismo, sube la comisión).
 */
export function palancas(b, k, mejora = 0.1) {
  const variable = b.margen_bruto - b.comisiones;       // lo que dejan los pedidos antes de anuncios y gastos fijos
  const tasaCom = b.ingresos > 0 ? b.comisiones / b.ingresos : 0;
  const lista = [
    { palanca: "ads", cambio: `costo por mensaje ${Math.round(mejora * 100)} % más barato`, utilidad_extra: redondear(b.anuncios * mejora) },
    { palanca: "cro", cambio: `${Math.round(mejora * 100)} % más pedidos entregados con el mismo gasto`, utilidad_extra: redondear(Math.max(variable, 0) * mejora) },
    { palanca: "producto", cambio: `ticket ${Math.round(mejora * 100)} % más alto (ofertas, upsells)`, utilidad_extra: redondear(b.ingresos * mejora * (1 - tasaCom)) }
  ].sort((x, y) => y.utilidad_extra - x.utilidad_extra);
  return lista;
}

function alertas(b, k, reglas, { cerrados, conversaciones, completados }) {
  const out = [];
  if (completados === 0 && cerrados === 0) out.push({ nivel: "info", palanca: "datos", texto: "No hay pedidos cerrados en este período: faltan cargar el reporte de Dinsides o las capturas de Shalom/Olva." });
  if (b.anuncios > 0 && completados === 0) out.push({ nivel: "alta", palanca: "ads", texto: `Se gastaron S/ ${b.anuncios} en anuncios y no hay ningún pedido entregado en el período.` });
  if (k.contribucion_por_pedido !== null && k.costo_por_pedido_entregado !== null && k.costo_por_pedido_entregado > k.contribucion_por_pedido)
    out.push({ nivel: "alta", palanca: "ads", texto: `Cada pedido entregado cuesta S/ ${k.costo_por_pedido_entregado.toFixed(2)} en anuncios y deja solo S/ ${k.contribucion_por_pedido.toFixed(2)} antes de anuncios: se pierde plata por pedido.` });
  if (k.tasa_rechazo !== null && k.tasa_rechazo > reglas.umbral_rechazo)
    out.push({ nivel: "media", palanca: "cro", texto: `${Math.round(k.tasa_rechazo * 100)} % de los pedidos cerrados fueron rechazados: confirmar mejor el pedido antes de despachar (CRO) ahorra envío y comisión.` });
  if (conversaciones > 0 && k.mensaje_a_venta !== null && k.mensaje_a_venta < 0.1)
    out.push({ nivel: "media", palanca: "cro", texto: `Solo ${(k.mensaje_a_venta * 100).toFixed(1)} % de los chats de anuncio terminan en venta.` });
  if (k.comision_sobre_ingresos !== null && k.comision_sobre_ingresos > 0.12)
    out.push({ nivel: "info", palanca: "producto", texto: `Las comisiones son ${(k.comision_sobre_ingresos * 100).toFixed(1)} % de lo cobrado (incluyen ventas rechazadas o aún por cobrar).` });
  if (b.utilidad < 0) out.push({ nivel: "alta", palanca: "general", texto: `Utilidad negativa en el período: S/ ${b.utilidad.toFixed(2)}.` });
  return out;
}

/** Cuenta del período leyendo D1. Comisiones: las del CRM (comisiones.js) o el % de las reglas. */
export async function calcularFinanzas(db, negocio, params, ahoraMs = Date.now()) {
  const reglas = await reglasDe(db, negocio);
  if (!reglas) throw new Error(`No existe el negocio «${negocio}» (tabla fin_negocios).`);
  const per = periodoDe(params, ahoraMs);

  const { results: pedidos } = await db.prepare(
    `SELECT * FROM fin_pedidos WHERE negocio = ? AND estado IN ('completado','rechazado') AND fecha_cierre BETWEEN ? AND ? ORDER BY fecha_cierre`
  ).bind(negocio, per.desde, per.hasta).all();
  const { results: pendientes } = await db.prepare(
    `SELECT courier, valor FROM fin_pedidos WHERE negocio = ? AND estado = 'pendiente'`
  ).bind(negocio).all();
  const { results: ads } = await db.prepare(`SELECT * FROM fin_ads WHERE negocio = ? AND fecha BETWEEN ? AND ?`).bind(negocio, per.desde, per.hasta).all();
  const { results: gastos } = await db.prepare(`SELECT * FROM fin_gastos WHERE negocio = ? AND fecha BETWEEN ? AND ?`).bind(negocio, per.desde, per.hasta).all();

  // Asesora de cada pedido sin asesora: la dueña del chat, buscada por teléfono (solo para mostrar).
  let comisiones = 0, ventas_crm = null, chats_anuncio = null, comisiones_detalle = null;
  if (reglas.comision_fuente === "crm") {
    const ids = per.quincenas.length ? per.quincenas : null;
    if (ids) {
      comisiones_detalle = [];
      ventas_crm = 0;
      for (const id of ids) {
        const q = await calcularQuincena(db, id);
        comisiones += q.total_comision; ventas_crm += q.total_ventas;
        comisiones_detalle.push({ quincena: id, ventas: q.total_ventas, comision: q.total_comision, asesoras: q.asesoras.map((x) => ({ asesora: x.asesora, comision: x.comision })) });
      }
    }
    chats_anuncio = await db.prepare(
      `SELECT COUNT(*) AS n FROM contacts WHERE ctwa_clid IS NOT NULL AND date(created_at, '-5 hours') BETWEEN ? AND ?`
    ).bind(per.desde, per.hasta).first().then((r) => r?.n ?? null).catch(() => null);
  } else {
    comisiones = pedidos.filter((p) => p.estado === "completado").reduce((s, p) => s + (Number(p.valor) || 0), 0) * reglas.comision_pct / 100;
  }

  const r = resumir({ pedidos, pendientes, ads, gastos, comisiones, ventas_crm, chats_anuncio }, reglas);
  if (reglas.comision_fuente === "crm" && !per.quincenas.length)
    r.alertas.unshift({ nivel: "media", palanca: "datos", texto: "Rango libre: las comisiones del CRM no están incluidas (se cuentan por quincena o mes). Usa quincena o mes para la utilidad real." });
  return { negocio, nombre: reglas.nombre, moneda: reglas.moneda, periodo: per, reglas: { costo_producto: reglas.costo_producto, comision_fuente: reglas.comision_fuente, comision_pct: reglas.comision_pct }, comisiones_detalle, ...r };
}

/* ---------- Carga (idempotente) ---------- */

const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ""));
const limpiar = (t, n = 200) => (t === undefined || t === null || t === "" ? null : String(t).trim().slice(0, n));
const digitos = (t) => String(t || "").replace(/\D/g, "");

export function normalizarPedido(p, negocio, reglas) {
  const courier = String(p.courier || "").toLowerCase().trim();
  if (!reglas.couriers?.[courier]) throw new Error(`Courier «${p.courier}» no existe para ${negocio} (${Object.keys(reglas.couriers).join(", ")}).`);
  const estado = String(p.estado || "pendiente").toLowerCase().trim();
  if (!ESTADOS.includes(estado)) throw new Error(`Estado «${p.estado}» inválido (${ESTADOS.join(", ")}).`);
  if (p.fecha_venta && !fechaOk(p.fecha_venta)) throw new Error(`fecha_venta «${p.fecha_venta}» debe ser AAAA-MM-DD.`);
  if (p.fecha_cierre && !fechaOk(p.fecha_cierre)) throw new Error(`fecha_cierre «${p.fecha_cierre}» debe ser AAAA-MM-DD.`);
  if ((estado === "completado" || estado === "rechazado") && !p.fecha_cierre) throw new Error("Un pedido completado o rechazado necesita fecha_cierre.");
  const ref = limpiar(p.ref, 80);
  const wa = digitos(p.whatsapp).slice(-9) || null;
  if (!ref && !(wa && p.fecha_venta)) throw new Error("Cada pedido necesita ref (guía/código) o whatsapp + fecha_venta, para no duplicarlo al recargar.");
  const clave = ref ? `${negocio}|${courier}|${ref.toLowerCase()}` : `${negocio}|${courier}|${wa}|${p.fecha_venta}`;
  const valor = Number(p.valor), envio = Number(p.envio_costo || 0);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100000) throw new Error("valor inválido.");
  if (!Number.isFinite(envio) || envio < 0 || envio > 10000) throw new Error("envio_costo inválido.");
  return { negocio, clave, courier, ref, whatsapp: wa, cliente: limpiar(p.cliente, 120), asesora: limpiar(p.asesora, 80), fecha_venta: p.fecha_venta || null, fecha_cierre: p.fecha_cierre || null,
           estado, unidades: Math.min(Math.max(parseInt(p.unidades, 10) || 1, 0), 50), valor, envio_costo: envio, nota: limpiar(p.nota, 300), fuente: limpiar(p.fuente, 120) };
}

export function normalizarAds(a, negocio) {
  if (!fechaOk(a.fecha)) throw new Error(`ads: fecha «${a.fecha}» debe ser AAAA-MM-DD.`);
  const num = (x) => { const n = Number(x || 0); if (!Number.isFinite(n) || n < 0) throw new Error("ads: número inválido."); return n; };
  return { negocio, fecha: a.fecha, campana_id: limpiar(a.campana_id || a.campana || "total", 60), campana: limpiar(a.campana, 160), gasto: num(a.gasto),
           impresiones: Math.round(num(a.impresiones)), clics: Math.round(num(a.clics)), conversaciones: Math.round(num(a.conversaciones)), compras: Math.round(num(a.compras)), valor_compras: num(a.valor_compras) };
}

export function normalizarGasto(g, negocio) {
  if (!fechaOk(g.fecha)) throw new Error(`gasto: fecha «${g.fecha}» debe ser AAAA-MM-DD.`);
  const monto = Number(g.monto);
  if (!Number.isFinite(monto)) throw new Error("gasto: monto inválido.");
  const categoria = limpiar(g.categoria, 60);
  if (!categoria) throw new Error("gasto: falta categoria.");
  const concepto = limpiar(g.concepto, 160);
  return { negocio, clave: `${negocio}|${g.fecha}|${categoria.toLowerCase()}|${(concepto || "").toLowerCase()}`, fecha: g.fecha, categoria, concepto, monto };
}

/** Guarda pedidos, anuncios y gastos. Todo o nada si algo no valida. */
export async function cargarMovimientos(db, negocio, { pedidos = [], ads = [], gastos = [] }) {
  const reglas = await reglasDe(db, negocio);
  if (!reglas) throw new Error(`No existe el negocio «${negocio}».`);
  const P = pedidos.map((p, i) => { try { return normalizarPedido(p, negocio, reglas); } catch (e) { throw new Error(`pedidos[${i}]: ${e.message}`); } });
  const A = ads.map((a, i) => { try { return normalizarAds(a, negocio); } catch (e) { throw new Error(`ads[${i}]: ${e.message}`); } });
  const G = gastos.map((g, i) => { try { return normalizarGasto(g, negocio); } catch (e) { throw new Error(`gastos[${i}]: ${e.message}`); } });
  if (P.length + A.length + G.length > 2000) throw new Error("Máximo 2000 filas por carga.");
  const stmts = [];
  for (const p of P) stmts.push(db.prepare(
    `INSERT INTO fin_pedidos (negocio, clave, courier, ref, whatsapp, cliente, asesora, fecha_venta, fecha_cierre, estado, unidades, valor, envio_costo, nota, fuente)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(clave) DO UPDATE SET cliente = COALESCE(excluded.cliente, cliente), asesora = COALESCE(excluded.asesora, asesora), whatsapp = COALESCE(excluded.whatsapp, whatsapp),
       fecha_venta = COALESCE(excluded.fecha_venta, fecha_venta), fecha_cierre = excluded.fecha_cierre, estado = excluded.estado, unidades = excluded.unidades, valor = excluded.valor,
       envio_costo = excluded.envio_costo, nota = COALESCE(excluded.nota, nota), fuente = COALESCE(excluded.fuente, fuente), updated_at = datetime('now')`
  ).bind(p.negocio, p.clave, p.courier, p.ref, p.whatsapp, p.cliente, p.asesora, p.fecha_venta, p.fecha_cierre, p.estado, p.unidades, p.valor, p.envio_costo, p.nota, p.fuente));
  for (const a of A) stmts.push(db.prepare(
    `INSERT INTO fin_ads (negocio, fecha, campana_id, campana, gasto, impresiones, clics, conversaciones, compras, valor_compras) VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(negocio, fecha, campana_id) DO UPDATE SET campana = excluded.campana, gasto = excluded.gasto, impresiones = excluded.impresiones, clics = excluded.clics,
       conversaciones = excluded.conversaciones, compras = excluded.compras, valor_compras = excluded.valor_compras, updated_at = datetime('now')`
  ).bind(a.negocio, a.fecha, a.campana_id, a.campana, a.gasto, a.impresiones, a.clics, a.conversaciones, a.compras, a.valor_compras));
  for (const g of G) stmts.push(db.prepare(
    `INSERT INTO fin_gastos (negocio, clave, fecha, categoria, concepto, monto) VALUES (?,?,?,?,?,?)
     ON CONFLICT(clave) DO UPDATE SET monto = excluded.monto`
  ).bind(g.negocio, g.clave, g.fecha, g.categoria, g.concepto, g.monto));
  for (let i = 0; i < stmts.length; i += 90) await db.batch(stmts.slice(i, i + 90));
  return { pedidos: P.length, ads: A.length, gastos: G.length };
}

export async function guardarReglas(db, negocio, extra) {
  const fila = await db.prepare("SELECT reglas FROM fin_negocios WHERE negocio = ?").bind(negocio).first();
  if (!fila) throw new Error(`No existe el negocio «${negocio}».`);
  let actual = {};
  try { actual = JSON.parse(fila.reglas || "{}"); } catch { /* vacío */ }
  const permitidas = ["costo_producto", "comision_pct", "comision_fuente", "rechazado_paga_envio", "umbral_rechazo", "couriers"];
  for (const k of Object.keys(extra || {})) if (!permitidas.includes(k)) throw new Error(`Regla «${k}» no editable (${permitidas.join(", ")}).`);
  const nuevo = { ...actual, ...extra };
  await db.prepare("UPDATE fin_negocios SET reglas = ? WHERE negocio = ?").bind(JSON.stringify(nuevo), negocio).run();
  return nuevo;
}

export { quincenaPorId };
