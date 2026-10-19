// Prueba del porcentaje propio por asesora (Danitza 13 %) en src/lib/comisiones.js.
import assert from "node:assert/strict";
import { repartir } from "../src/lib/comisiones.js";

const v = { value: 100, assigned_agent: "Lucía", shared_with: "" };
assert.equal(repartir(v, 10, null, { danitza: 13 }).reparto["Lucía"], 10);
assert.equal(repartir({ ...v, assigned_agent: "Danitza" }, 10, null, { danitza: 13 }).reparto.Danitza, 13);
assert.deepEqual(repartir({ ...v, shared_with: "Danitza" }, 10, null, { danitza: 13 }).reparto, { "Lucía": 5, Danitza: 6.5 });
assert.equal(repartir({ ...v, shared_with: "Ana" }, 10, null, {}).reparto["Lucía"], 5); // sin porcentajes propios: igual que siempre
console.log("Comisiones: porcentaje propio por asesora, en orden.");
