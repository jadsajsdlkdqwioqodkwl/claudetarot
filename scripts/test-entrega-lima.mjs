/**
 * Pedido de Lima registrado en Dinsides (dueño 2026-11-13): el chat lleva `lima` y `lima_entrega_AAAA-MM-DD`; con
 * PLANTILLA_ENTREGA_LIMA puesta se agenda la plantilla del día de entrega a las 10:00 de Lima (15:00 UTC), una sola vez,
 * con mandar_siempre (es para quien ya compró); sin plantilla o con la fecha ya pasada no se agenda nada.
 * `node --no-warnings scripts/test-entrega-lima.mjs` (también la corre `npm run check`).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { etiquetarEntregaLima, ORIGEN_ENTREGA_LIMA } = await import(join(root, "src/api/asesor-dinsides.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones con datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null, run: async () => sq.prepare(sql).run(...a) }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
sq.exec("INSERT INTO contacts (id, wa_id) VALUES (1, '51900000001')");
sq.exec("INSERT INTO conversations (id, contact_id) VALUES (10, 1), (11, 1)");
const manana = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
const tags = (id) => ` ${sq.prepare("SELECT meta_tags FROM conversations WHERE id = ?").get(id).meta_tags || ""} `;
const agendados = (id) => sq.prepare("SELECT * FROM scheduled_messages WHERE conversation_id = ? AND created_by = ?").all(id, ORIGEN_ENTREGA_LIMA);

let r = await etiquetarEntregaLima({ CRM_DB: db, PLANTILLA_ENTREGA_LIMA: "" }, 10, manana);
check("sin plantilla: etiquetas lima y lima_entrega_FECHA", tags(10).includes(" lima ") && tags(10).includes(` lima_entrega_${manana} `), tags(10));
check("sin plantilla: no agenda nada", !r.agendado && agendados(10).length === 0);

r = await etiquetarEntregaLima({ CRM_DB: db, PLANTILLA_ENTREGA_LIMA: "entrega_hoy_lima", HORA_ENTREGA_LIMA: "10:00" }, 11, manana);
const a = agendados(11);
check("con plantilla: agenda una a las 10:00 de Lima (15:00 UTC)", r.agendado && a.length === 1 && a[0].send_at === `${manana}T15:00:00.000Z`, JSON.stringify(a[0]));
check("va como plantilla, es_PE y mandar_siempre", a[0]?.template_name === "entrega_hoy_lima" && a[0]?.template_language === "es_PE" && a[0]?.mandar_siempre === 1);
await etiquetarEntregaLima({ CRM_DB: db, PLANTILLA_ENTREGA_LIMA: "entrega_hoy_lima" }, 11, manana);
check("registrar dos veces no duplica", agendados(11).length === 1);
check("las etiquetas no se repiten", (tags(11).match(/ lima /g) || []).length === 1, tags(11));
r = await etiquetarEntregaLima({ CRM_DB: db, PLANTILLA_ENTREGA_LIMA: "entrega_hoy_lima" }, 10, "2020-01-01");
check("fecha ya pasada: no agenda", !r.agendado && agendados(10).length === 0);

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);
