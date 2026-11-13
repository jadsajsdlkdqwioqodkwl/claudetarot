// Recojo de Shalom/Olva programado antes de la boleta (dueño 2026-11-13): sus días cuentan desde la boleta o el aviso de envío.
import assert from "node:assert/strict";
import { minimoTrasBoleta } from "../src/lib/planes-plantilla.js";

const DIA = 86400000;
const db = (boleta) => ({
  prepare: (sql) => ({
    bind: () => ({
      first: async () => (sql.includes("MIN(created_at)") ? { t: boleta } : null),
      all: async () => ({ results: [] })
    })
  })
});
let ok = 0;
const t = async (n, f) => { await f(); ok++; console.log("✓ " + n); };
const base = new Date("2026-11-10T21:46:46Z").getTime();

await t("«su pedido ya llegó» (paso 1, Shalom) sale 4 días después del aviso de envío", async () =>
  assert.equal(await minimoTrasBoleta(db("2026-11-10 21:46:46"), 1, "recojo_shalom_1"), base + 4 * DIA));
await t("paso 2 de Shalom: 7 días después", async () =>
  assert.equal(await minimoTrasBoleta(db("2026-11-10 21:46:46"), 1, "recojo_shalom_2"), base + 7 * DIA));
await t("Olva (recojo_agencia_1): 3 días después", async () =>
  assert.equal(await minimoTrasBoleta(db("2026-11-10 21:46:46"), 1, "recojo_agencia_1"), base + 3 * DIA));
await t("URO también", async () =>
  assert.equal(await minimoTrasBoleta(db("2026-11-10 21:46:46"), 1, "uro_recojo_shalom_1"), base + 4 * DIA));
await t("sin boleta registrada (boleta a mano): sale como estaba", async () =>
  assert.equal(await minimoTrasBoleta(db(null), 1, "recojo_shalom_1"), null));
await t("otras plantillas no se tocan", async () =>
  assert.equal(await minimoTrasBoleta(db("2026-11-10 21:46:46"), 1, "seg7_primera_lectura"), null));
console.log(`\n${ok} pruebas del recojo tras la boleta en orden.`);
