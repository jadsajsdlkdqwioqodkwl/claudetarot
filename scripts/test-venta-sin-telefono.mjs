/**
 * Venta sin teléfono (dueño 2026-11-13): al marcar la compra de un cliente que escribe con nombre de usuario de WhatsApp (sin
 * número) y no dio un celular, queda una recomendación «dato_envio» («pídele su celular»), que sube a la bandeja y aparece en el
 * aviso del chat; se cierra sola cuando el cliente escribe un celular; comprar no la cierra. Un cliente con número no la recibe.
 * `node --no-warnings scripts/test-venta-sin-telefono.mjs` (también la corre `npm run check`).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { sugerirTelefonoDeVenta, limpiarSugerenciasViejas, recomendacionDeChat } = await import(join(root, "src/lib/crm-sugerencias.js"));
const { agregarEtiquetaMeta } = await import(join(root, "src/lib/crm-db.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones con datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null, run: async () => sq.prepare(sql).run(...a) }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
const ahora = (min = 0) => new Date(Date.now() + min * 60000).toISOString().slice(0, 19).replace("T", " ");
sq.exec("INSERT INTO contacts (id, wa_id, name) VALUES (1, 'PE.abcDEF123', 'Rosa'), (2, '51987654321', 'Ana'), (3, 'PE.xyz999', 'Luz')");
sq.exec(`INSERT INTO conversations (id, contact_id, last_inbound_at) VALUES (10, 1, '${ahora(-5)}'), (20, 2, '${ahora(-5)}'), (30, 3, '${ahora(-5)}')`);
const msg = (conv, body, min) => sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (?, 'in', 'text', ?, ?)").run(conv, body, ahora(min));
msg(10, "Av. Arequipa 1234, Lince", -6);
msg(30, "mi número es 987 654 321", -6);
const pend = (conv) => sq.prepare("SELECT * FROM asesor_sugerencias WHERE conversation_id = ? AND tipo = 'dato_envio' AND estado = 'pendiente'").all(conv);

await agregarEtiquetaMeta(db, 10, "purchase");
check("venta de un cliente sin número y sin celular: recomendación «pídele su celular»", pend(10).length === 1 && /celular/.test(pend(10)[0].texto));
await agregarEtiquetaMeta(db, 20, "purchase");
check("cliente que escribe con su número: no hace falta", pend(20).length === 0);
await agregarEtiquetaMeta(db, 30, "purchase");
check("cliente sin número que ya escribió un celular: no hace falta", pend(30).length === 0);
await sugerirTelefonoDeVenta(db, 10);
check("no se duplica", pend(10).length === 1);
await limpiarSugerenciasViejas(db);
check("comprar no la cierra (sigue pendiente después de la limpieza)", pend(10).length === 1);
const banner = await recomendacionDeChat(db, 10);
check("aparece en el aviso del chat", banner && /celular/.test(banner.texto), JSON.stringify(banner));
msg(10, "927 123 456", 1);
await limpiarSugerenciasViejas(db);
check("se cierra sola cuando el cliente escribe un celular", pend(10).length === 0);

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);
