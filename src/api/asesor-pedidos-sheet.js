/**
 * Pestaña «Pedidos auto» del libro de pedidos (GOOGLE_SHEET_ID): la memoria del reporte unificado de
 * pedidos y ventas, visible y editable por el equipo. Una fila por pedido; la columna «Enviado» la
 * marca a mano quien despacha y el sistema nunca la toca.
 *
 * POST /api/asesor/pedidos-sheet  { fecha_objetivo, origen, pedidos: [{ nombre, whatsapp, destino, estado,
 *      vendedora, direccion_o_agencia, kits, empaque, pago, nota, fecha_entrega, fecha_venta, tipo }] }
 *      → { nuevas, actualizadas }. Clave: el WhatsApp entre las filas NO marcadas como enviadas (si el
 *      cliente cambia de fecha, se actualiza su fila; una vez enviada, un pedido nuevo abre otra fila).
 * GET  /api/asesor/pedidos-sheet?hoy=AAAA-MM-DD → { atrasados, hoy, futuros, sin_fecha } con las filas
 *      sin «Enviado», para que el reporte las traiga todas las noches hasta que alguien las marque.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { getValues, updateValues, appendRowsTo, asegurarPestana } from "../lib/google-sheets.js";

const PESTAÑA = "Pedidos auto";
const ENCABEZADOS = ["Fecha venta", "Entrega", "Nombre", "WhatsApp", "Destino", "Estado", "Vendedora", "Dirección / Agencia",
  "Kits", "Empaque", "Pago", "Nota", "Reporte", "Actualizado (Lima)", "Enviado"];
const COLS = ENCABEZADOS.length; // A..O; «Enviado» es la O (índice 14)
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
  const filas = await getValues(env, `${PESTAÑA}!A2:O`).catch(() => []);
  return (filas || []).map((f) => [...f, ...Array(COLS).fill("")].slice(0, COLS).map(celda));
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
  String(p.nota || ""),
  String(origen || ""),
  fechaLima()
];

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.GOOGLE_SHEET_ID) return json({ error: "Falta GOOGLE_SHEET_ID." }, 503);
  const p = await request.json().catch(() => null);
  const pedidos = Array.isArray(p?.pedidos) ? p.pedidos : [];
  const marcar = Array.isArray(p?.marcar) ? p.marcar : [];
  const fechaObjetivo = esIso(p?.fecha_objetivo) ? p.fecha_objetivo : "";
  if (!marcar.length && (!pedidos.length || !fechaObjetivo)) return json({ error: "Faltan pedidos + fecha_objetivo (AAAA-MM-DD), o marcar." }, 400);
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
        if (!k || !abiertas.has(k)) { sinFila.push(m.whatsapp); continue; }
        const i = abiertas.get(k);
        await updateValues(env, `${PESTAÑA}!O${i + 2}`, [[String(m.enviado || `sí ${fechaLima()}`)]]);
        hechos.push({ whatsapp: m.whatsapp, fila: i + 2, nombre: filas[i][2] });
        abiertas.delete(k);
      }
      if (!pedidos.length) return json({ ok: true, marcados: hechos, sin_fila: sinFila });
    }
    let nuevas = 0, actualizadas = 0;
    const nuevasFilas = [];
    for (const ped of pedidos) {
      if ((ped.nombre || "").toUpperCase() === "INCIDENCIA") continue;
      const k = n9(ped.whatsapp);
      const fila = filaDe(ped, fechaObjetivo, p.origen);
      if (k && abiertas.has(k)) {
        const i = abiertas.get(k);
        if (!fila[0]) fila[0] = filas[i][0]; // la fecha de venta no se pierde si esta corrida no la trajo
        await updateValues(env, `${PESTAÑA}!A${i + 2}:N${i + 2}`, [fila]);
        actualizadas++;
      } else {
        nuevasFilas.push([...fila, ""]);
        if (k) abiertas.set(k, filas.length + nuevasFilas.length - 1);
        nuevas++;
      }
    }
    if (nuevasFilas.length) await appendRowsTo(env, env.GOOGLE_SHEET_ID, PESTAÑA, nuevasFilas);
    return json({ ok: true, nuevas, actualizadas });
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
      const r = { fila: i + 2, fecha_venta: f[0], fecha_entrega: f[1], nombre: f[2], whatsapp: f[3], destino: f[4], estado: f[5],
        vendedora: f[6], direccion_o_agencia: f[7], kits: f[8], empaque: f[9], pago: f[10], nota: f[11], reporte: f[12], actualizado: f[13] };
      if (!esIso(f[1])) out.sin_fecha.push(r);
      else if (f[1] < hoy) out.atrasados.push(r);
      else if (f[1] === hoy) out.hoy_.push(r);
      else out.futuros.push(r);
    });
    return json({ ok: true, hoy, atrasados: out.atrasados, hoy: out.hoy_, futuros: out.futuros, sin_fecha: out.sin_fecha, enviados: out.enviados });
  } catch (err) {
    console.error("pedidos-sheet:", err.message);
    return json({ error: err.message }, 502);
  }
}
