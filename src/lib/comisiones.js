/**
 * Contador de comisiones por quincena (pedido del dueño, 2026-10-14).
 *
 * Quincenas de pago:
 *   · A = del ÚLTIMO día del mes anterior hasta el 14 (inclusive).
 *   · B = del 15 hasta el PENÚLTIMO día del mes (el último día ya cuenta para la A del mes siguiente).
 * El día de una venta se mira en hora de Lima (UTC-5).
 *
 * Venta = evento Purchase enviado (`capi_events`: lo que la asesora marca como COMPRA y lo que ve Meta).
 * Comisión = 10 % del valor de la venta, se haya recogido el pedido o no (ajuste `comision_pct` para cambiarlo).
 *
 * Atribución (según la estrella del chat, `assigned_agent` + `shared_with`):
 *   · Sin estrella compartida: 100 % de la comisión para la dueña del chat (quien cerró; quien solo confirmó no cobra aparte).
 *   · Con estrella compartida (otra asesora resolvió una objeción o ayudó a cerrar): 50/50 entre la dueña y quien comparte.
 *   · El admin puede corregir una venta puntual (`comision_ajustes`): 'dueno' o 'mitad' con las personas que él diga.
 */

import { obtenerAjuste } from "./crm-db.js";

const LIMA_MS = -5 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const diasDelMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate(); // m = 1..12
const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;

/** Fecha de Lima (AAAA-MM-DD) de un instante UTC (ms o texto de D1 «AAAA-MM-DD HH:MM:SS»). */
export function fechaLima(utc) {
  const ms = typeof utc === "number" ? utc : Date.parse(String(utc).replace(" ", "T") + "Z");
  return new Date(ms + LIMA_MS).toISOString().slice(0, 10);
}

/** A qué quincena pertenece un día de Lima. Devuelve { id: "2026-10-A", desde, hasta, etiqueta }. */
export function quincenaDe(fecha) {
  let [a, m, d] = fecha.split("-").map(Number);
  if (d === diasDelMes(a, m)) { // el último día del mes abre la A del mes siguiente
    m += 1;
    if (m === 13) { m = 1; a += 1; }
    return quincenaPorId(`${a}-${pad(m)}-A`);
  }
  return quincenaPorId(`${a}-${pad(m)}-${d <= 14 ? "A" : "B"}`);
}

export function quincenaPorId(id) {
  const [a, m, letra] = id.split("-");
  const A = Number(a), M = Number(m);
  if (!A || !M || M > 12 || !["A", "B"].includes(letra)) throw new Error("Quincena inválida (formato AAAA-MM-A o AAAA-MM-B).");
  let desde, hasta;
  if (letra === "A") {
    const pm = M === 1 ? 12 : M - 1, pa = M === 1 ? A - 1 : A;
    desde = iso(pa, pm, diasDelMes(pa, pm));
    hasta = iso(A, M, 14);
  } else {
    desde = iso(A, M, 15);
    hasta = iso(A, M, diasDelMes(A, M) - 1);
  }
  const mes = new Date(Date.UTC(A, M - 1, 1)).toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
  return { id, desde, hasta, etiqueta: `${letra === "A" ? "1.ª" : "2.ª"} quincena de ${mes} ${A} (${desde.slice(5)} al ${hasta.slice(5)})` };
}

/** La quincena actual y las 5 anteriores, para el selector. */
export function quincenasRecientes(ahoraMs = Date.now(), n = 6) {
  const lista = [quincenaDe(fechaLima(ahoraMs))];
  while (lista.length < n) {
    const [a, m, l] = lista[lista.length - 1].id.split("-");
    lista.push(quincenaPorId(l === "B" ? `${a}-${m}-A` : (Number(m) === 1 ? `${Number(a) - 1}-12-B` : `${a}-${pad(Number(m) - 1)}-B`)));
  }
  return lista;
}

const lineas = (t) => String(t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const redondear = (n) => Math.round(n * 100) / 100;

/** Reparte una venta entre personas. Devuelve { modo, reparto: { nombre: monto } }. */
export function repartir(venta, pct, ajuste) {
  const comision = redondear((Number(venta.value) || 0) * pct / 100);
  const dueno = (ajuste?.responsable || venta.assigned_agent || "").trim();
  const ayudantes = ajuste ? lineas(ajuste.ayudante) : lineas(venta.shared_with).filter((n) => n !== dueno);
  const modo = ajuste ? ajuste.modo : (ayudantes.length ? "mitad" : "dueno");
  if (!dueno) return { modo, comision, reparto: { "(sin asesora)": comision } };
  if (modo === "mitad" && ayudantes.length) {
    const mitad = redondear(comision / 2);
    return { modo, comision, reparto: { [dueno]: mitad, [ayudantes[0]]: redondear(comision - mitad) } };
  }
  return { modo: "dueno", comision, reparto: { [dueno]: comision } };
}

/** El contador de una quincena: totales por asesora y detalle de cada venta. */
export async function calcularQuincena(db, quincenaId) {
  const q = quincenaPorId(quincenaId);
  const pct = Number(await obtenerAjuste(db, "comision_pct").catch(() => null)) || 10;
  // Ventana en UTC con margen de un día; el recorte exacto se hace por fecha de Lima.
  const { results } = await db.prepare(
    `SELECT e.id, e.conversation_id, e.value, e.currency, e.product_label, e.created_by, e.created_at,
            conv.assigned_agent, conv.shared_with, COALESCE(c.name, c.profile_name, c.wa_id) AS cliente, c.wa_id,
            a.modo, a.responsable, a.ayudante, a.nota
     FROM capi_events e
     JOIN conversations conv ON conv.id = e.conversation_id
     JOIN contacts c ON c.id = conv.contact_id
     LEFT JOIN comision_ajustes a ON a.capi_event_id = e.id
     WHERE e.event_name = 'Purchase' AND e.status = 'enviado'
       AND e.created_at >= datetime(?, '-1 day') AND e.created_at <= datetime(?, '+2 days')
     ORDER BY e.created_at`
  ).bind(q.desde, q.hasta).all();
  const ventas = [];
  const por = {};
  for (const v of results) {
    const dia = fechaLima(v.created_at);
    if (dia < q.desde || dia > q.hasta) continue;
    const r = repartir(v, pct, v.modo ? { modo: v.modo, responsable: v.responsable, ayudante: v.ayudante } : null);
    ventas.push({ id: v.id, fecha: dia, cliente: v.cliente, whatsapp: v.wa_id, producto: v.product_label, valor: Number(v.value) || 0, marcada_por: v.created_by,
                  modo: r.modo, ajustada: Boolean(v.modo), nota: v.nota || null, comision: r.comision, reparto: r.reparto });
    for (const [nombre, monto] of Object.entries(r.reparto)) {
      const t = por[nombre] ||= { asesora: nombre, ventas: 0, completas: 0, compartidas: 0, valor_ventas: 0, comision: 0 };
      t.ventas += 1;
      r.modo === "mitad" ? (t.compartidas += 1) : (t.completas += 1);
      t.valor_ventas = redondear(t.valor_ventas + (r.modo === "mitad" ? (Number(v.value) || 0) / 2 : Number(v.value) || 0));
      t.comision = redondear(t.comision + monto);
    }
  }
  const asesoras = Object.values(por).sort((x, y) => y.comision - x.comision);
  return {
    quincena: q, porcentaje: pct, moneda: "PEN",
    total_ventas: ventas.length, total_valor: redondear(ventas.reduce((s, v) => s + v.valor, 0)),
    total_comision: redondear(asesoras.reduce((s, t) => s + t.comision, 0)),
    asesoras, ventas
  };
}

/** El admin corrige una venta: modo 'dueno' | 'mitad', con responsable y ayudante. modo null = volver al cálculo automático. */
export async function guardarAjuste(db, eventoId, { modo, responsable, ayudante, nota }, por) {
  if (!modo) { await db.prepare("DELETE FROM comision_ajustes WHERE capi_event_id = ?").bind(eventoId).run(); return; }
  if (!["dueno", "mitad"].includes(modo)) throw new Error("El modo es 'dueno' o 'mitad'.");
  if (!String(responsable || "").trim()) throw new Error("Falta quién cerró la venta.");
  if (modo === "mitad" && !String(ayudante || "").trim()) throw new Error("Para dividir 50/50 falta quién ayudó.");
  await db.prepare(
    `INSERT INTO comision_ajustes (capi_event_id, modo, responsable, ayudante, nota, por) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(capi_event_id) DO UPDATE SET modo = excluded.modo, responsable = excluded.responsable, ayudante = excluded.ayudante, nota = excluded.nota, por = excluded.por, created_at = datetime('now')`
  ).bind(eventoId, modo, String(responsable).trim().slice(0, 80), modo === "mitad" ? String(ayudante).trim().slice(0, 80) : null, nota ? String(nota).slice(0, 200) : null, por || null).run();
}
