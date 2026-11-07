/**
 * Ventas creadas a la vez no se pisan (2026-11-07). La Routine de boletas despachó 9 clientes en paralelo y 5 ventas
 * del 6/11 se perdieron: cada `crear` eligió «la primera fila vacía» antes de que la otra escribiera. Aquí 9 creaciones
 * simultáneas sobre una hoja simulada: sin candado chocan; con `conCandadoVentas` (D1) cada una queda en su fila.
 * `node --no-warnings scripts/test-candado-ventas.mjs` (también la corre `npm run check`).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { conCandadoVentas } = await import(join(root, "src/api/asesor-ventas.js"));
let fallas = 0;
const check = (n, ok, d = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${n}${ok || !d ? "" : ` — ${d}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  run: async () => { const r = sq.prepare(sql).run(...a); return { meta: { changes: r.changes } }; } }; return st; };
const env = { CRM_DB: { prepare: mk } };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Igual que `crear`: lee la hoja (red), elige la primera fila vacía y escribe (red).
async function crearEn(hoja, cliente) {
  const copia = [...hoja];
  await pausa(5 + Math.random() * 15);
  const fila = copia.findIndex((x) => !x);
  await pausa(5 + Math.random() * 15);
  hoja[fila === -1 ? hoja.length : fila] = cliente;
}
const clientes = [...Array(9)].map((_, i) => `cliente${i + 1}`);

const sinCandado = Array(20).fill("");
await Promise.all(clientes.map((c) => crearEn(sinCandado, c)));
check("sin candado, 9 a la vez se pisan (así se perdieron las del 6/11)", sinCandado.filter(Boolean).length < 9, String(sinCandado.filter(Boolean).length));

const conCandado = Array(20).fill("");
await Promise.all(clientes.map((c) => conCandadoVentas(env, () => crearEn(conCandado, c), { esperaMs: 5 })));
check("con candado, las 9 quedan cada una en su fila", conCandado.filter(Boolean).length === 9 && new Set(conCandado.filter(Boolean)).size === 9, JSON.stringify(conCandado));
check("el candado se suelta al terminar", !sq.prepare("SELECT 1 FROM crm_settings WHERE key = 'candado_ventas_crear'").get());

// Un candado colgado (proceso que murió) vence a los 30 s y no bloquea para siempre.
sq.prepare("INSERT INTO crm_settings (key, value) VALUES ('candado_ventas_crear', ?)").run(`${Date.now() - 1000}|muerto`);
let corrio = false;
await conCandadoVentas(env, async () => { corrio = true; }, { intentos: 3, esperaMs: 5 });
check("un candado vencido no bloquea", corrio && !sq.prepare("SELECT 1 FROM crm_settings WHERE key = 'candado_ventas_crear'").get());

// Si falla lo de adentro, igual se suelta.
await conCandadoVentas(env, async () => { throw new Error("Sheets caído"); }).catch(() => {});
check("si Sheets falla, el candado se suelta igual", !sq.prepare("SELECT 1 FROM crm_settings WHERE key = 'candado_ventas_crear'").get());

console.log(fallas ? `\n${fallas} falla(s).` : "\nCandado de ventas: todo en orden.");
process.exit(fallas ? 1 : 0);
