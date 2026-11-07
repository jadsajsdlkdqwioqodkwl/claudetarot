/**
 * Recomendaciones del asesor (dueño, 2026-11-06, «te reto a hacerlo impecable»): el caso real del chat 51969799398.
 * El cliente escribió, una vendedora le contestó, 3 h después el asesor dejó una recomendación y la ventana de 24 h cerró.
 * Lo que tiene que pasar: la recomendación sigue pendiente (nadie le escribió DESPUÉS de ella), el cron la reflota aunque
 * la ventana esté cerrada, el banner del chat la devuelve con ventana_abierta = false y las plantillas para mandarla, y
 * «sin pregunta» no genera nada (está apagado). `node --no-warnings scripts/test-sugerencias.mjs` (la corre `npm run check`).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { reflotarSugerencia, recomendacionDeChat, limpiarSugerenciasViejas, sugerirSinPregunta } = await import(join(root, "src/lib/crm-sugerencias.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones con datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null, run: async () => sq.prepare(sql).run(...a) }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
const H = 3600 * 1000;
const sqlFecha = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const ahora = Date.now();
// Horario de envío: que no esté «en silencio» (las pruebas corren a cualquier hora): ventana de 24 h completa.
const env = { CRM_DB: db, HORARIO_ENVIO: "00:00-23:59" };

sq.exec("INSERT INTO agents (id, username, password_hash, display_name, wa_id, role) VALUES (11, 'margiory', 'x', 'margiory', '51900000011', 'vendedor')");
sq.exec("INSERT INTO contacts (id, wa_id, name) VALUES (1, '51969799398', 'Cliente')");
// Chat 4035: el cliente escribió hace 34 h («Sí, cuénteme»), margiory contestó 2 min después, la recomendación llegó 3 h más tarde.
sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, last_message_at, created_at, etapa) VALUES (4035, 1, ?, ?, ?, 4)")
  .run(sqlFecha(ahora - 34 * H), sqlFecha(ahora - 33.9 * H), sqlFecha(ahora - 80 * H));
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, sent_by, created_at) VALUES (4035, 'in', 'text', 'Sí, cuénteme', NULL, ?)").run(sqlFecha(ahora - 34 * H));
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, sent_by, created_at) VALUES (4035, 'out', 'text', 'Ahora contamos también con +30 clases grabadas', 'margiory', ?)").run(sqlFecha(ahora - 33.9 * H));
sq.prepare("INSERT INTO asesor_sugerencias (id, tipo, conversation_id, wa_id, nombre, texto, motivo, objecion, origen, estado, created_at) VALUES (1919, 'seguimiento', 4035, '51969799398', 'Cliente', 'Estimad@, a veces da un poco de desconfianza mandar un adelanto a alguien que no conoce ☺️', 'no respondió al adelanto', 'desconfianza', 'asesor 16:30', 'pendiente', ?)")
  .run(sqlFecha(ahora - 31 * H));
// Un automático después de la recomendación (el plan de 7 días): NO la cierra.
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, sent_by, created_at) VALUES (4035, 'out', 'template', 'Hola estimad@ 🩷 muchas personas creen…', 'Plan de seguimiento · Interesado · semana gratis', ?)").run(sqlFecha(ahora - 20 * H));

console.log("Recomendaciones del asesor (caso 51969799398)");
await limpiarSugerenciasViejas(db);
check("una vendedora que escribió ANTES de la recomendación y un automático DESPUÉS no la cierran", sq.prepare("SELECT estado FROM asesor_sugerencias WHERE id = 1919").get().estado === "pendiente");

const reflotados = await reflotarSugerencia(env);
const fila = sq.prepare("SELECT reflotada_at FROM asesor_sugerencias WHERE id = 1919").get();
check("el cron reflota la recomendación aunque la ventana de 24 h ya cerró", reflotados.includes(4035) && Boolean(fila.reflotada_at), JSON.stringify(reflotados));
check("el chat sube en la lista (last_message_at se adelanta a ahora)", new Date(sq.prepare("SELECT last_message_at FROM conversations WHERE id = 4035").get().last_message_at.replace(" ", "T") + "Z").getTime() > ahora - 60000);

const listar = async () => [{ name: "rescate_lead_1", language: "es_PE", texto: "Hola {{1}} ☺️ le escribo por su consulta…" }];
const reco = await recomendacionDeChat(db, 4035, listar);
check("el banner del chat recibe la recomendación con su texto editable", reco && reco.id === 1919 && /desconfianza/.test(reco.texto) && reco.objecion === "desconfianza", JSON.stringify(reco));
check("con la ventana cerrada avisa ventana_abierta = false y trae las plantillas aprobadas para mandarla", reco.ventana_abierta === false && reco.plantillas.length === 1 && reco.plantillas[0].name === "rescate_lead_1");
check("sin plantillas inyectadas (el asesor) no revienta: lista vacía", (await recomendacionDeChat(db, 4035)).plantillas.length === 0);

// Chat con la ventana abierta: ventana_abierta = true y sin plantillas (sale el texto tal cual).
sq.prepare("INSERT INTO contacts (id, wa_id, name) VALUES (2, '51900000002', 'Abierta')").run();
sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, last_message_at, created_at, etapa) VALUES (4036, 2, ?, ?, ?, 2)").run(sqlFecha(ahora - 2 * H), sqlFecha(ahora - 2 * H), sqlFecha(ahora - 5 * H));
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (4036, 'in', 'text', 'precio?', ?)").run(sqlFecha(ahora - 2 * H));
sq.prepare("INSERT INTO asesor_sugerencias (id, tipo, conversation_id, wa_id, texto, origen, estado, created_at) VALUES (1920, 'seguimiento', 4036, '51900000002', 'Estimad@, el kit está a S/89 con envío gratis', 'asesor 11:30', 'pendiente', ?)").run(sqlFecha(ahora - 1 * H));
const abierta = await recomendacionDeChat(db, 4036, listar);
check("con la ventana abierta: ventana_abierta = true y sin plantillas (se manda el texto)", abierta.ventana_abierta === true && abierta.plantillas.length === 0);

// Si una PERSONA le escribe después de la recomendación, se cierra como «se le escribió al cliente».
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, sent_by, created_at) VALUES (4036, 'out', 'text', 'Claro, le cuento', 'margiory', ?)").run(sqlFecha(ahora - 0.5 * H));
check("si una vendedora le escribe después, la recomendación se cierra sola", (await recomendacionDeChat(db, 4036)) === null && sq.prepare("SELECT estado FROM asesor_sugerencias WHERE id = 1920").get().estado === "obsoleta");

// Ya compró: se cierra.
sq.prepare("UPDATE conversations SET etapa = 5 WHERE id = 4035").run();
check("si ya compró, la recomendación se cierra («ya compró»)", (await recomendacionDeChat(db, 4035)) === null && sq.prepare("SELECT resuelto_por FROM asesor_sugerencias WHERE id = 1919").get().resuelto_por === "ya compró");

// «Sin pregunta» apagado: el cron no genera nada aunque el chat cumpla las condiciones.
sq.prepare("INSERT INTO contacts (id, wa_id) VALUES (3, '51900000003')").run();
sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, last_message_at, created_at, etapa, blocked) VALUES (4037, 3, ?, ?, ?, 2, 0)").run(sqlFecha(ahora - 3 * H), sqlFecha(ahora - 2 * H), sqlFecha(ahora - 5 * H));
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (4037, 'in', 'text', 'hola', ?)").run(sqlFecha(ahora - 3 * H));
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, sent_by, created_at) VALUES (4037, 'out', 'text', 'Le mando la info.', 'margiory', ?)").run(sqlFecha(ahora - 2 * H));
await reflotarSugerencia(env);
check("«sin pregunta» apagado: el cron no crea recomendaciones de ese tipo", sq.prepare("SELECT COUNT(*) AS n FROM asesor_sugerencias WHERE tipo = 'sin_pregunta'").get().n === 0);
check("la función sigue existiendo para prenderla con sin_pregunta_auto = 1", typeof sugerirSinPregunta === "function");

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);
