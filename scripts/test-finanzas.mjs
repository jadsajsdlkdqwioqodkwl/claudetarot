// Prueba de las cuentas de finanzas (src/lib/finanzas.js) y del porcentaje propio de Danitza (comisiones.js). Sin base de datos.
import assert from "node:assert/strict";
import { resumir, REGLAS_DE_FABRICA, cuentaPedido, normalizarPedido, normalizarAds, periodoDe, palancas } from "../src/lib/finanzas.js";
import { repartir } from "../src/lib/comisiones.js";

const R = REGLAS_DE_FABRICA;
let n = 0;
const t = (nombre, fn) => { fn(); n++; console.log(`  ok  ${nombre}`); };

t("Dinsides completado: valor − S/ 20 − envío de su reporte", () => {
  const c = cuentaPedido({ courier: "dinsides", estado: "completado", unidades: 1, valor: 79, envio_costo: 12 }, R);
  assert.deepEqual(c, { ingreso: 79, costo_producto: 20, envio: 12, margen: 47 });
});
t("Shalom: el envío lo paga el cliente, aunque la fila traiga un monto", () => {
  assert.equal(cuentaPedido({ courier: "shalom", estado: "completado", unidades: 2, valor: 138, envio_costo: 9 }, R).margen, 98);
});
t("Rechazado en Dinsides: sin ingreso ni costo de producto, paga el envío", () => {
  assert.deepEqual(cuentaPedido({ courier: "dinsides", estado: "rechazado", valor: 79, envio_costo: 12 }, R), { ingreso: 0, costo_producto: 0, envio: 12, margen: -12 });
});
t("Devuelto y pendiente no aportan nada", () => {
  for (const estado of ["devuelto", "pendiente"]) assert.equal(cuentaPedido({ courier: "shalom", estado, valor: 99 }, R).margen, 0);
});

const pedidos = [
  { courier: "dinsides", estado: "completado", unidades: 1, valor: 100, envio_costo: 10 },
  { courier: "dinsides", estado: "completado", unidades: 1, valor: 100, envio_costo: 10 },
  { courier: "dinsides", estado: "rechazado", unidades: 1, valor: 100, envio_costo: 10 },
  { courier: "shalom", estado: "completado", unidades: 1, valor: 100, envio_costo: 0 },
  { courier: "shalom", estado: "devuelto", unidades: 1, valor: 100, envio_costo: 0 }
];
t("Resumen: utilidad = ingresos − producto − envíos − comisiones − anuncios − otros", () => {
  const r = resumir({ pedidos, pendientes: [{ valor: 50 }], ads: [{ gasto: 60, impresiones: 1000, clics: 30, conversaciones: 20 }], gastos: [{ monto: 5 }], comisiones: 30, ventas_crm: 4 }, R);
  assert.equal(r.ingresos, 300);
  assert.equal(r.costo_producto, 60);
  assert.equal(r.envios, 30);                 // 2 completados + 1 rechazado de Dinsides
  assert.equal(r.margen_bruto, 210);
  assert.equal(r.utilidad, 210 - 30 - 60 - 5);
  assert.equal(r.pedidos.completados, 3);
  assert.equal(r.pedidos.rechazados, 1);
  assert.equal(r.pedidos.por_cobrar, 50);
  assert.equal(r.kpis.costo_por_mensaje, 3);
  assert.equal(r.kpis.tasa_rechazo, 0.25);
  assert.equal(r.kpis.costo_por_pedido_entregado, 20);
  assert.ok(r.alertas.some((a) => a.palanca === "cro" && /rechazados/.test(a.texto)));
});
t("Devuelto no entra en ningún total", () => {
  const sin = resumir({ pedidos: pedidos.slice(0, 4) }, R), con = resumir({ pedidos }, R);
  assert.equal(sin.utilidad, con.utilidad);
});
t("Palancas ordenadas por utilidad extra", () => {
  const l = palancas({ ingresos: 1000, costo_producto: 200, envios: 100, margen_bruto: 700, comisiones: 100, anuncios: 900, otros_gastos: 0, utilidad: -300 }, {});
  assert.equal(l[0].palanca, "ads");        // gasta casi todo en anuncios: ahí está el mayor ahorro
  assert.ok(l[0].utilidad_extra >= l[1].utilidad_extra && l[1].utilidad_extra >= l[2].utilidad_extra);
});
t("Pérdida por pedido: el costo en anuncios supera lo que deja el pedido", () => {
  const r = resumir({ pedidos: [{ courier: "dinsides", estado: "completado", valor: 60, envio_costo: 10 }], ads: [{ gasto: 80 }], comisiones: 6 }, R);
  assert.ok(r.alertas.some((a) => a.palanca === "ads" && /se pierde plata/.test(a.texto)));
  assert.ok(r.utilidad < 0);
});

t("Carga: sin guía se identifica por whatsapp + fecha; fechas y courier se validan", () => {
  const p = normalizarPedido({ courier: "Shalom", whatsapp: "+51 999 888 777", fecha_venta: "2026-10-12", fecha_cierre: "2026-10-16", estado: "completado", valor: 79 }, "tarot", R);
  assert.equal(p.clave, "tarot|shalom|999888777|2026-10-12");
  assert.throws(() => normalizarPedido({ courier: "xx", ref: "1", valor: 1 }, "tarot", R), /Courier/);
  assert.throws(() => normalizarPedido({ courier: "olva", ref: "1", estado: "completado", valor: 1 }, "tarot", R), /fecha_cierre/);
  assert.throws(() => normalizarAds({ fecha: "12/10/2026", gasto: 1 }, "tarot"), /AAAA-MM-DD/);
});
t("Períodos: quincena y mes", () => {
  const q = periodoDe({ quincena: "2026-10-A" });
  assert.deepEqual([q.desde, q.hasta], ["2026-09-30", "2026-10-14"]);
  const m = periodoDe({ mes: "2026-10" });
  assert.deepEqual([m.desde, m.hasta, m.quincenas.length], ["2026-09-30", "2026-10-30", 2]);
});

t("Comisiones: 10 % general, Danitza 13 %, mitad con distinto porcentaje", () => {
  const v = { value: 100, assigned_agent: "Lucía", shared_with: "" };
  assert.equal(repartir(v, 10, null, { danitza: 13 }).reparto["Lucía"], 10);
  assert.equal(repartir({ ...v, assigned_agent: "Danitza" }, 10, null, { danitza: 13 }).reparto.Danitza, 13);
  const m = repartir({ ...v, shared_with: "Danitza" }, 10, null, { danitza: 13 });
  assert.deepEqual(m.reparto, { "Lucía": 5, Danitza: 6.5 });
  assert.equal(repartir({ ...v, shared_with: "Ana" }, 10, null, {}).reparto["Lucía"], 5); // sin porcentajes propios: igual que siempre
});

console.log(`\n${n} pruebas de finanzas en orden.`);
