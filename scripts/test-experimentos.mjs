/**
 * Experimentos de flujo con testers (dueño, 2026-11-03): una no-tester nunca entra, el brazo es fijo por chat, la primera
 * rápida de un brazo asigna aunque el destino no se sepa, el cambio a mano sale de la cuenta, y las métricas cuentan por
 * brazo, y las rápidas que solo son del brazo B se listan para esconderlas. `node scripts/test-experimentos.mjs` (también la corre `npm run check`).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { brazoDeChat, metricasExperimento, parsearExperimento, esTester, rapidasSoloDePrueba } = await import(join(root, "src/lib/experimentos.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones con datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null, run: async () => sq.prepare(sql).run(...a) }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
const sqlFecha = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

sq.exec("INSERT INTO agents (id, username, password_hash, display_name, wa_id, role, tester) VALUES (4, 'jennifer', 'x', 'Jennifer', '51900000004', 'admin', 1), (5, 'mayra', 'x', 'Mayra', '51900000005', 'vendedor', 0)");
sq.exec("INSERT INTO contacts (id, wa_id) VALUES (1, '51900000001')");
sq.exec("INSERT INTO experimentos (id, nombre, estado, segmento, reparto, brazo_a, brazo_b, etiqueta_a, etiqueta_b, minimo_chats) VALUES (1, 'Yape en 2 tiempos', 'activo', 'provincia', 0.5, '[4,5,38]', '[901,902]', 'control', '2 tiempos', 20)");
const chat = (id, { provincia = true, hace = 60000 } = {}) => {
  sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, created_at) VALUES (?, 1, ?, ?)").run(id, sqlFecha(Date.now() - hace), sqlFecha(Date.now() - hace));
  // crm-destino.js lee los textos de los últimos 14 días: «agencia Shalom» → provincia; «distrito Miraflores» → Lima.
  sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (?, 'in', 'text', ?, ?)").run(id, provincia ? "Soy de Cusco, mi agencia Shalom es la de Wanchaq" : "Vivo en Miraflores, Lima", sqlFecha(Date.now() - hace));
};

console.log("Experimentos de flujo");
check("Jennifer es tester, Mayra no", (await esTester(db, 4)) && !(await esTester(db, 5)));

chat(10);
check("una vendedora que no es tester no entra (chat de provincia)", (await brazoDeChat(db, { conversationId: 10, agentId: 5, agente: "mayra" })) === null && !sq.prepare("SELECT 1 FROM experimento_chats WHERE conversation_id = 10").get());
const a = await brazoDeChat(db, { conversationId: 10, agentId: 4, agente: "jennifer" });
check("una tester en un chat de provincia recibe un brazo", a && ["A", "B"].includes(a.brazo) && a.nombre === "Yape en 2 tiempos", JSON.stringify(a));
check("el brazo esconde las rápidas del otro y destaca las propias", a.brazo === "B" ? (a.ocultar.join() === "4,5,38" && a.destacar.join() === "901,902") : (a.ocultar.join() === "901,902" && a.destacar.join() === "4,5,38"));
const otra = await brazoDeChat(db, { conversationId: 10, agentId: 5, agente: "mayra" });
check("si otra vendedora (no tester) toma el chat, el brazo se respeta", otra?.brazo === a.brazo);
check("el mismo chat siempre da el mismo brazo", (await brazoDeChat(db, { conversationId: 10, agentId: 4 })).brazo === a.brazo);

chat(11, { provincia: false });
check("un chat de Lima no entra a una prueba de provincia", (await brazoDeChat(db, { conversationId: 11, agentId: 4 })) === null);
chat(12, { provincia: false });
const porRapida = await brazoDeChat(db, { conversationId: 12, agentId: 4, agente: "jennifer", tocoRapida: 4 });
check("tocar la primera rápida de un brazo asigna aunque el destino aún no se sepa", porRapida && ["A", "B"].includes(porRapida.brazo));
check("tocar una rápida ajena a la prueba no asigna", (await brazoDeChat(db, { conversationId: 11, agentId: 4, tocoRapida: 77 })) === null);

// Reparto: muchos chats de provincia con la tester.
let nA = 0, nB = 0;
for (let id = 100; id < 300; id++) { chat(id); const r = await brazoDeChat(db, { conversationId: id, agentId: 4 }); if (r.brazo === "A") nA++; else nB++; }
check("el reparto 50/50 cae entre 40 y 60 %", nA > 80 && nB > 80, `${nA} / ${nB}`);

// Métricas: compras y respuestas después de la asignación.
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (100, 'in', 'text', 'ya yapeé', ?)").run(sqlFecha(Date.now() + 1000));
sq.prepare("INSERT INTO capi_events (conversation_id, value, event_name, created_at) VALUES (100, 89, 'Purchase', ?)").run(sqlFecha(Date.now() + 3600000));
sq.prepare("UPDATE conversations SET etapa = 5 WHERE id = 100").run();
sq.prepare("UPDATE experimento_chats SET manual = 1 WHERE conversation_id = 101").run();
const ex = parsearExperimento(sq.prepare("SELECT * FROM experimentos WHERE id = 1").get());
const m = await metricasExperimento(db, ex);
const b100 = sq.prepare("SELECT brazo FROM experimento_chats WHERE conversation_id = 100").get().brazo;
check("las métricas cuentan por brazo (chats, respondieron, compraron en 72 h y 7 días)", m.brazos[b100].respondieron >= 1 && m.brazos[b100].compraron_72h === 1 && m.brazos[b100].compraron_7d === 1 && m.brazos.A.chats + m.brazos.B.chats === 201, JSON.stringify(m));
check("un chat cambiado a mano sale de la cuenta", m.brazos.A.manuales + m.brazos.B.manuales === 1);
check("«faltan N chats» usa el brazo más corto contra el mínimo", m.faltan === Math.max(0, 20 - Math.min(m.brazos.A.chats, m.brazos.B.chats)) && m.faltan === 0);

// Pausado: no asigna chats nuevos, los asignados conservan su brazo.
sq.prepare("UPDATE experimentos SET estado = 'pausado' WHERE id = 1").run();
chat(400);
check("con la prueba pausada no entran chats nuevos", (await brazoDeChat(db, { conversationId: 400, agentId: 4 })) === null);
check("pero los ya asignados conservan su brazo (a nivel de datos)", sq.prepare("SELECT brazo FROM experimento_chats WHERE conversation_id = 10").get().brazo === a.brazo);

// Rápidas que solo son del brazo B: el panel las esconde en todo chat que no vaya por B (aunque la prueba esté en pausa).
sq.exec("INSERT INTO experimentos (id, nombre, estado, segmento, reparto, brazo_a, brazo_b) VALUES (2, 'Otra', 'terminado', 'lima', 0.5, '[7,8]', '[8,903]')");
const solo = (await rapidasSoloDePrueba(db)).sort((x, y) => x - y);
check("rapidasSoloDePrueba: solo las del brazo B que no están en A, de todas las pruebas", solo.join() === "901,902,903", solo.join());

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);
