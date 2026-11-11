/**
 * Pestaña «Pedidos auto» del libro de pedidos (GOOGLE_SHEET_ID): la memoria del reporte unificado de
 * pedidos y ventas, visible y editable por el equipo. Una fila por pedido; la columna «Enviado» la
 * marca a mano quien despacha, o el sistema cuando ya consta que salió: boleta emitida en «Boletas auto»
 * (POST { conciliar: true }, 2026-11-09) o estado final en Dinsides (asesor-dinsides.js `estados`).
 *
 * POST /api/asesor/pedidos-sheet  { fecha_objetivo, origen, pedidos: [{ nombre, whatsapp, destino, estado,
 *      vendedora, direccion_o_agencia, kits, empaque, pago, nota, fecha_entrega, fecha_venta, tipo }] }
 *      → { nuevas, actualizadas }. Clave: el WhatsApp entre las filas NO marcadas como enviadas (si el
 *      cliente cambia de fecha, se actualiza su fila; una vez enviada, un pedido nuevo abre otra fila).
 * GET  /api/asesor/pedidos-sheet?hoy=AAAA-MM-DD → { atrasados, hoy, futuros, sin_fecha } con las filas
 *      sin «Enviado», para que el reporte las traiga todas las noches hasta que alguien las marque.
 * Columna P «Dinsides» (2026-11-08): lo que pasó con el pedido en Dinsides. La escribe el Worker al registrar («registrado
 *      AAAA-MM-DD HH:MM») o una persona para guiar a la Routine: «ok» (confirmado, regístralo), «distrito: Comas»,
 *      «dirección: …», «coord: -12.1,-77.0», «manual 1234» (lo registró a mano), «no» (no va por Dinsides).
 *      `filasPedidosAuto(env)` y `marcarDinsidesEnHoja(env, whatsapp, texto, enviado)` los usa src/api/asesor-dinsides.js.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { getValues, updateValues, appendRowsTo, asegurarPestana } from "../lib/google-sheets.js";

const PESTAÑA = "Pedidos auto";
const ENCABEZADOS = ["Fecha venta", "Entrega", "Nombre", "WhatsApp", "Destino", "Estado", "Vendedora", "Dirección / Agencia",
  "Kits", "Empaque", "Pago", "Nota", "Reporte", "Actualizado (Lima)", "Enviado", "Dinsides"];
const COLS = ENCABEZADOS.length; // A..P; «Enviado» es la O (índice 14), «Dinsides» la P (índice 15)
const ULTIMA = String.fromCharCode(64 + COLS);
const LIMA_OFFSET_MS = -5 * 3600 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const n9 = (v) => String(v ?? "").replace(/\D/g, "").slice(-9);
const fechaLima = () => new Date(Date.now() + LIMA_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16);
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// La hoja convierte «2026-11-02» en un número de serie (y getValues lo devuelve sin formato): se vuelve a texto ISO.
const serieAFecha = (v, conHora) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
  return d.toISOString().replace("T", " ").slice(0, conHora ? 16 : 10);
};
const celda = (v, i) => {
  if (v === undefined || v === null) return "";
  if (typeof v === "number" && (i === 0 || i === 1 || i === 13) && v > 40000) return serieAFecha(v, i === 13);
  return String(v);
};

async function leerFilas(env) {
  await asegurarPestana(env, env.GOOGLE_SHEET_ID, PESTAÑA, ENCABEZADOS);
  const filas = await getValues(env, `${PESTAÑA}!A2:${ULTIMA}`).catch(() => []);
  return (filas || []).map((f) => [...f, ...Array(COLS).fill("")].slice(0, COLS).map(celda));
}

const filaAObjeto = (f, i) => ({ fila: i + 2, fecha_venta: f[0], fecha_entrega: f[1], nombre: f[2], whatsapp: f[3], destino: f[4], estado: f[5],
  vendedora: f[6], direccion_o_agencia: f[7], kits: f[8], empaque: f[9], pago: f[10], nota: f[11], reporte: f[12], actualizado: f[13],
  enviado: f[14], dinsides: f[15] });

/** Todas las filas de «Pedidos auto» como objetos (con «Enviado» y «Dinsides»), para el registro en Dinsides. */
export async function filasPedidosAuto(env) {
  if (!env.GOOGLE_SHEET_ID) throw new Error("Falta GOOGLE_SHEET_ID.");
  return (await leerFilas(env)).map(filaAObjeto).filter((r) => String(r.nombre || r.whatsapp || "").trim());
}

/**
 * Escribe la columna «Dinsides» (y, si se pide, «Enviado») en la fila abierta de ese WhatsApp. Si no hay fila abierta,
 * usa la última fila de ese WhatsApp; si no existe ninguna, lo dice (`sin_fila`). Pone el encabezado P1 si faltaba.
 */
export async function marcarDinsidesEnHoja(env, whatsapp, textoDinsides, enviado = "") {
  if (!env.GOOGLE_SHEET_ID) return { sin_fila: true, error: "Falta GOOGLE_SHEET_ID." };
  const filas = await leerFilas(env);
  const k = n9(whatsapp);
  let i = -1;
  filas.forEach((f, j) => { if (n9(f[3]) === k && !String(f[14] || "").trim()) i = j; });
  if (i < 0) filas.forEach((f, j) => { if (n9(f[3]) === k) i = j; });
  if (i < 0) return { sin_fila: true, whatsapp };
  const cab = await getValues(env, `${PESTAÑA}!${ULTIMA}1`).catch(() => []);
  if (!String(cab?.[0]?.[0] || "").trim()) await updateValues(env, `${PESTAÑA}!${ULTIMA}1`, [["Dinsides"]]);
  await updateValues(env, `${PESTAÑA}!${ULTIMA}${i + 2}`, [[String(textoDinsides || "")]]);
  if (enviado && !String(filas[i][14] || "").trim()) await updateValues(env, `${PESTAÑA}!O${i + 2}`, [[String(enviado)]]);
  return { fila: i + 2, nombre: filas[i][2], whatsapp: filas[i][3] };
}

const filaDe = (p, fechaObjetivo, origen) => [
  esIso(p.fecha_venta) ? p.fecha_venta : "",
  esIso(p.fecha_entrega) ? p.fecha_entrega : fechaObjetivo,
  String(p.nombre || ""),
  n9(p.whatsapp) ? "51" + n9(p.whatsapp) : String(p.whatsapp || ""),
  String(p.destino || ""),
  String(p.estado || "") + (p.tipo ? ` / ${p.tipo}` : ""),
  String(p.vendedora || ""),
  String(p.direccion_o_agencia || ""),
  p.kits === undefined || p.kits === null || p.kits === "" ? "1" : String(p.kits),
  String(p.empaque || ""),
  String(p.pago || ""),
  (() => { const dni = String(p.dni || "").replace(/\D/g, ""); const nota = String(p.nota || "");
    // La hoja no tiene columna DNI: se guarda dentro de la nota («DNI 12345678») para que Shalom y la presentación lo recuperen (2026-11-09).
    return dni && !nota.includes(dni) ? `${nota}${nota ? " · " : ""}DNI ${dni}` : nota; })(),
  String(origen || ""),
  fechaLima()
];

/**
 * Suma o actualiza filas de «Pedidos auto» desde otro módulo (Dinsides registra un pedido que el reporte no traía):
 * misma regla que el POST (clave = WhatsApp entre las filas sin «Enviado»). Devuelve { nuevas, actualizadas }.
 */
export async function upsertPedidosAuto(env, fechaObjetivo, origen, pedidos) {
  if (!env.GOOGLE_SHEET_ID || !pedidos?.length) return { nuevas: 0, actualizadas: 0 };
  const filas = await leerFilas(env);
  const abiertas = new Map();
  filas.forEach((f, i) => { const k = n9(f[3]); if (k && !String(f[14] || "").trim()) abiertas.set(k, i); });
  let nuevas = 0, actualizadas = 0;
  const nuevasFilas = [];
  for (const ped of pedidos) {
    const k = n9(ped.whatsapp);
    const fila = filaDe(ped, fechaObjetivo, origen);
    if (k && abiertas.has(k)) {
      const i = abiertas.get(k);
      if (!fila[0]) fila[0] = filas[i][0];
      await updateValues(env, `${PESTAÑA}!A${i + 2}:N${i + 2}`, [fila]);
      actualizadas++;
    } else { nuevasFilas.push([...fila, "", ""]); nuevas++; }
  }
  if (nuevasFilas.length) await appendRowsTo(env, env.GOOGLE_SHEET_ID, PESTAÑA, nuevasFilas);
  return { nuevas, actualizadas };
}

/** Filas abiertas con boleta ya emitida («Boletas auto»: fecha, nombre, whatsapp, courier, nro, saldo, páginas, ventana) → Enviado. */
/** Boletas emitidas («Boletas auto»): la última por WhatsApp (9 dígitos) → { fecha, courier, nro }. Boleta = el paquete ya salió. */
async function leerBoletas(env) {
  const boletas = (await getValues(env, "'Boletas auto'!A2:H").catch(() => [])) || [];
  const porWa = new Map();
  for (const b of boletas) {
    const k = n9(b[2]); if (!k) continue;
    const fecha = typeof b[0] === "number" ? serieAFecha(b[0], true) : String(b[0] || "");
    const prev = porWa.get(k);
    if (!prev || fecha > prev.fecha) porWa.set(k, { fecha, courier: String(b[3] || ""), nro: String(b[4] || ""), nombre: String(b[1] || "") });
  }
  return porWa;
}

async function conciliarConBoletas(env) {
  const porWa = await leerBoletas(env);
  const filas = await leerFilas(env);
  const marcados = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (String(f[14] || "").trim()) continue;
    const b = porWa.get(n9(f[3]));
    // La boleta tiene que ser de ese pedido: emitida el día de la venta o después (una boleta vieja no cierra un pedido nuevo).
    if (!b || (esIso(f[0]) && b.fecha.slice(0, 10) < f[0])) continue;
    marcados.push({ fila: i + 2, nombre: f[2], whatsapp: f[3], courier: b.courier, nro: b.nro, _valor: `sí ${b.fecha.slice(0, 10)} ${b.courier} ${b.nro} (boleta)` });
  }
  // Hasta 40 filas por llamada, una escritura por fila (la API de valores no tiene rango disperso); el que llama repite si quedan.
  const lote = marcados.slice(0, 40);
  for (const m of lote) await updateValues(env, `${PESTAÑA}!O${m.fila}`, [[m._valor]]);
  return { marcados: lote.length, restantes: marcados.length - lote.length, filas: lote.map(({ _valor, ...m }) => m), boletas: porWa.size };
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.GOOGLE_SHEET_ID) return json({ error: "Falta GOOGLE_SHEET_ID." }, 503);
  const p = await request.json().catch(() => null);
  const pedidos = Array.isArray(p?.pedidos) ? p.pedidos : [];
  const marcar = Array.isArray(p?.marcar) ? p.marcar : [];
  const fechaObjetivo = esIso(p?.fecha_objetivo) ? p.fecha_objetivo : "";
  if (p?.conciliar) {
    // { conciliar: true }: cierra («Enviado») las filas abiertas cuyo cliente ya tiene boleta en «Boletas auto» (Shalom / Olva:
    // la boleta se genera cuando el paquete ya salió). Lo corre el reporte cada noche antes de armar la agenda pendiente
    // (dueño 2026-11-09). Los pedidos de Lima los cierra `estados` de Dinsides. Nunca toca una fila ya marcada.
    try { return json({ ok: true, ...(await conciliarConBoletas(env)) }); } catch (err) { return json({ error: err.message }, 502); }
  }
  if (!marcar.length && (!pedidos.length || !fechaObjetivo)) return json({ error: "Faltan pedidos + fecha_objetivo (AAAA-MM-DD), o marcar, o conciliar." }, 400);
  try {
    const filas = await leerFilas(env);
    // La fila abierta (sin «Enviado») de cada WhatsApp: la última, por si hubiera dos.
    const abiertas = new Map();
    filas.forEach((f, i) => { const k = n9(f[3]); if (k && !String(f[14] || "").trim()) abiertas.set(k, i); });
    if (marcar.length) {
      // { marcar: [{ whatsapp, enviado: "sí 2026-11-02 Shalom" }] }: cierra la fila abierta de ese WhatsApp (columna «Enviado»).
      // Lo usa la futura Routine de estados de envío (Shalom Pro / panel de Lima) y reporte.py enviado; una persona puede
      // hacer lo mismo escribiendo en la hoja.
      const hechos = [], sinFila = [];
      for (const m of marcar) {
        const k = n9(m.whatsapp);
        // { fila } (2026-11-10): vuelve a marcar una fila YA cerrada de ese mismo WhatsApp (p. ej. el envío de Shalom expiró y el
        // dueño lo registró de nuevo con otro número de orden). Solo si la fila es de ese cliente.
        const filaDada = Number(m.fila) >= 2 && n9(filas[Number(m.fila) - 2]?.[3]) === k ? Number(m.fila) - 2 : null;
        if (!k || (filaDada === null && !abiertas.has(k))) { sinFila.push(m.whatsapp); continue; }
        const i = filaDada ?? abiertas.get(k);
        await updateValues(env, `${PESTAÑA}!O${i + 2}`, [[String(m.enviado || `sí ${fechaLima()}`)]]);
        hechos.push({ whatsapp: m.whatsapp, fila: i + 2, nombre: filas[i][2] });
        abiertas.delete(k);
      }
      if (!pedidos.length) return json({ ok: true, marcados: hechos, sin_fila: sinFila });
    }
    let nuevas = 0, actualizadas = 0, yaCerradas = 0;
    const nuevasFilas = [];
    // El MISMO pedido ya cerrado (mismo WhatsApp y misma fecha de entrega, con «Enviado»: registrado en Dinsides, con boleta, por
    // motorizado…) no vuelve a abrirse como fila nueva cada vez que el reporte lo repite (2026-11-11, caso Sandra: agendada y
    // registrada el 10, el reporte del 10 le creó otra fila abierta y salía como pendiente). Un cambio o reposición sí es otra fila.
    const cerradas = new Set(filas.filter((f) => String(f[14] || "").trim() && n9(f[3])).map((f) => `${n9(f[3])}|${f[1]}`));
    for (const ped of pedidos) {
      if ((ped.nombre || "").toUpperCase() === "INCIDENCIA") continue;
      const k = n9(ped.whatsapp);
      const fila = filaDe(ped, fechaObjetivo, p.origen);
      if (k && !abiertas.has(k) && cerradas.has(`${k}|${fila[1]}`) && !/CAMBIO|REPOSICI/i.test(String(ped.tipo || ""))) { yaCerradas++; continue; }
      if (k && abiertas.has(k)) {
        const i = abiertas.get(k);
        if (!fila[0]) fila[0] = filas[i][0]; // la fecha de venta no se pierde si esta corrida no la trajo
        await updateValues(env, `${PESTAÑA}!A${i + 2}:N${i + 2}`, [fila]);
        actualizadas++;
      } else {
        nuevasFilas.push([...fila, "", ""]);
        if (k) abiertas.set(k, filas.length + nuevasFilas.length - 1);
        nuevas++;
      }
    }
    if (nuevasFilas.length) await appendRowsTo(env, env.GOOGLE_SHEET_ID, PESTAÑA, nuevasFilas);
    return json({ ok: true, nuevas, actualizadas, ya_cerradas: yaCerradas });
  } catch (err) {
    console.error("pedidos-sheet:", err.message);
    return json({ error: err.message }, 502);
  }
}

export async function onRequestGet({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.GOOGLE_SHEET_ID) return json({ error: "Falta GOOGLE_SHEET_ID." }, 503);
  const hoy = new URL(request.url).searchParams.get("hoy") || new Date(Date.now() + LIMA_OFFSET_MS).toISOString().slice(0, 10);
  try {
    const filas = await leerFilas(env);
    const out = { hoy, atrasados: [], hoy_: [], futuros: [], sin_fecha: [], enviados: 0 };
    filas.forEach((f, i) => {
      if (!String(f[2] || f[3] || "").trim()) return;
      if (String(f[14] || "").trim()) { out.enviados++; return; }
      const r = filaAObjeto(f, i);
      if (!esIso(f[1])) out.sin_fecha.push(r);
      else if (f[1] < hoy) out.atrasados.push(r);
      else if (f[1] === hoy) out.hoy_.push(r);
      else out.futuros.push(r);
    });
    const salida = { ok: true, hoy, atrasados: out.atrasados, hoy: out.hoy_, futuros: out.futuros, sin_fecha: out.sin_fecha, enviados: out.enviados };
    // ?boletas=1: además la lista de boletas emitidas, para cruzar candidatos y pendientes (un cliente con boleta ya recibió su envío).
    if (new URL(request.url).searchParams.get("boletas") === "1") {
      const b = await leerBoletas(env).catch(() => new Map());
      salida.boletas = [...b.entries()].map(([whatsapp, v]) => ({ whatsapp, ...v }));
      // Filas cerradas hace poco (≤ 3 días): lo que el equipo ya despachó o registró a mano («sí … Shalom NNN», «Motorizado externo …»),
      // para que la presentación no lo vuelva a proponer aunque el estado del reporte lo traiga (2026-11-09).
      const desde = new Date(new Date(`${hoy}T00:00:00Z`).getTime() - 3 * 86400000).toISOString().slice(0, 10);
      salida.enviados_recientes = filas.filter((f) => String(f[14] || "").trim() && (f[1] >= desde || /\b20\d\d-\d\d-\d\d\b/.test(String(f[14])) && String(f[14]).match(/\b(20\d\d-\d\d-\d\d)\b/)[1] >= desde))
        .map((f) => ({ whatsapp: f[3], fecha_entrega: f[1], enviado: f[14], nombre: f[2] }));
    }
    // ?enviadas=1: las filas cerradas de los últimos 3 días COMPLETAS (agencia, nota con DNI, «Enviado» con el número de orden), para
    // armar las etiquetas de Shalom de lo que el equipo registró a mano (etiquetas.py --shalom-hoja, 2026-11-09).
    if (new URL(request.url).searchParams.get("enviadas") === "1") {
      const desde = new Date(new Date(`${hoy}T00:00:00Z`).getTime() - 3 * 86400000).toISOString().slice(0, 10);
      salida.enviadas = filas.map((f, i) => [f, i]).filter(([f]) => String(f[14] || "").trim() && (f[1] >= desde || /\b20\d\d-\d\d-\d\d\b/.test(String(f[14])) && String(f[14]).match(/\b(20\d\d-\d\d-\d\d)\b/)[1] >= desde))
        .map(([f, i]) => filaAObjeto(f, i));
    }
    return json(salida);
  } catch (err) {
    console.error("pedidos-sheet:", err.message);
    return json({ error: err.message }, 502);
  }
}
