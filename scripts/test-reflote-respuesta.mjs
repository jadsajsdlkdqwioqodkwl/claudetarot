/**
 * Reflote por falta de respuesta, «Falta respuesta / Atendido» y el banner de la recomendación (dueño, 2026-11-06,
 * a partir del chat +51 969 799 398). SQLite real con las migraciones. `node scripts/test-reflote-respuesta.mjs`
 * (también la corre `npm run check`).
 *   1. Un chat donde el cliente calló (el último mensaje es nuestro) NO sube por su recomendación.
 *   2. Un chat donde el cliente escribió y después solo salieron seguimientos automáticos SÍ tiene «Falta respuesta»
 *      y su recomendación lo sube; «Ya respondí» (atendido) lo apaga.
 *   3. Si una persona le contestó, ya no falta respuesta.
 *   4. El banner del chat con la ventana cerrada responde (antes: 500 por un import faltante) y trae las plantillas.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { reflotarSugerencia, FALTA_RESPUESTA } = await import(join(root, "src/lib/crm-sugerencias.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones que dependen de datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null, run: async () => sq.prepare(sql).run(...a) }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };

const fecha = (horasAtras) => new Date(Date.now() - horasAtras * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
sq.exec("INSERT INTO agents (username, display_name, password_hash, role, wa_id) VALUES ('margiory', 'margiory', 'x', 'agent', '51911111111')");
let msgId = 0;
const msg = (conv, dir, horas, sentBy = null, type = "text") => sq.prepare("INSERT INTO messages (id, conversation_id, direction, type, body, sent_by, created_at) VALUES (?, ?, ?, ?, 'x', ?, ?)").run(++msgId, conv, dir, type, sentBy, fecha(horas));
function chat(id, ultimoCliente) {
  sq.prepare("INSERT INTO contacts (id, wa_id) VALUES (?, ?)").run(id, `5190000000${id}`);
  sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, last_message_at) VALUES (?, ?, ?, ?)").run(id, id, fecha(ultimoCliente), fecha(ultimoCliente));
  msg(id, "in", ultimoCliente);
}
const reco = (conv, horas) => sq.prepare("INSERT INTO asesor_sugerencias (tipo, conversation_id, texto, motivo, created_at) VALUES ('seguimiento', ?, 'texto recomendado', 'calló', ?)").run(conv, fecha(horas));

// 1. Como +51 969 799 398: escribió hace 36 h, la vendedora contestó con pregunta, el plan mandó plantilla, el cliente calló.
chat(1, 36); msg(1, "out", 35.9, "margiory"); msg(1, "out", 30, "Plan de seguimiento · Interesado · semana gratis", "template"); reco(1, 20);
// 2. Escribió hace 10 h; después solo salieron un seguimiento automático y una plantilla del plan.
chat(2, 10); msg(2, "out", 8, "Seguimiento automático"); msg(2, "out", 5, "Plan de seguimiento · Interesado · semana gratis", "template"); reco(2, 4);
// 3. Escribió hace 10 h y una persona le contestó.
chat(3, 10); msg(3, "out", 9, "margiory"); reco(3, 4);
// 4. Lead viejo (escribió hace 10 días) que solo recibió un envío masivo después: no se le prende la etiqueta.
chat(4, 240); msg(4, "out", 200, "Envío masivo · bono", "template");
// 5. Escribió hace 2 h y solo le respondió la bienvenida: cuenta como respuesta (contesta su saludo).
chat(5, 2); msg(5, "out", 1.99, "Bienvenida automática");

const falta = (id) => sq.prepare(`SELECT ${FALTA_RESPUESTA("conv")} AS f FROM conversations conv WHERE conv.id = ?`).get(id).f === 1;
check("cliente que calló tras nuestra pregunta: no le falta respuesta", !falta(1));
check("cliente que escribió y solo recibió seguimientos automáticos: le falta respuesta", falta(2));
check("cliente al que una persona le contestó: no le falta respuesta", !falta(3));
check("lead viejo con un envío masivo después: sigue la regla de antes (no se prende)", !falta(4));
check("la bienvenida cuenta como respuesta", !falta(5));

const subidos = await reflotarSugerencia({ CRM_DB: db, HORARIO_ENVIO: "0:00-24:00" });
check("el reflote sube SOLO el chat con falta de respuesta (no el que calló ni el ya contestado)", JSON.stringify(subidos) === "[2]", JSON.stringify(subidos));
const sub1 = sq.prepare("SELECT reflotada_at FROM asesor_sugerencias WHERE conversation_id = 1").get();
check("la recomendación del que calló sigue pendiente y sin reflotar (se ve en el chat, no sube la bandeja)", sub1.reflotada_at === null);

// «Ya respondí» (accion atendido) apaga la etiqueta; un mensaje nuevo del cliente la prende otra vez.
sq.prepare("UPDATE conversations SET atendido_at = datetime('now') WHERE id = 2").run();
check("«Ya respondí» apaga «Falta respuesta»", !falta(2));
sq.prepare("UPDATE conversations SET last_inbound_at = datetime('now', '+1 second') WHERE id = 2").run();
msg(2, "in", -1 / 3600);
check("si el cliente escribe otra vez, vuelve «Falta respuesta»", falta(2));

// 4. Banner: GET /api/crm/sugerencias?de_chat=1 con la ventana cerrada (sin sesión real: se reemplaza conAuth).
{
  const fuente = readFileSync(join(root, "src/api/crm/sugerencias.js"), "utf8");
  const sinAuth = fuente.replace(/export const onRequestGet = conAuth\(get\);/, "export const onRequestGet = (c) => get({ ...c, agent: { role: 'admin' } });");
  const { writeFileSync, rmSync } = await import("node:fs");
  const tmp = join(root, "src/api/crm/.sugerencias-test.mjs");
  writeFileSync(tmp, sinAuth);
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [
    { name: "rescate_lead_1", language: "es_PE", status: "APPROVED", components: [{ type: "BODY", text: "Hola, ¿le quedó alguna duda?" }] },
    { name: "borrador", language: "es_PE", status: "PENDING", components: [] }
  ] }), { headers: { "Content-Type": "application/json" } });
  try {
    const { onRequestGet } = await import(tmp);
    const env = { CRM_DB: db, WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_BUSINESS_ACCOUNT_ID: "2", WHATSAPP_WABA_ID: "2" };
    // En el Worker, una excepción aquí es un 500 que el CRM escondía sin avisar.
    const r = await onRequestGet({ request: new Request("https://x/api/crm/sugerencias?de_chat=1"), env })
      .catch((err) => new Response(JSON.stringify({ error: err.message }), { status: 500 }));
    const d = await r.json().catch(() => ({}));
    check("el banner de un chat con la ventana cerrada responde 200 (antes 500)", r.status === 200, `${r.status} ${JSON.stringify(d)}`);
    check("trae la recomendación con ventana_abierta = false", d.sugerencia?.texto === "texto recomendado" && d.sugerencia?.ventana_abierta === false, JSON.stringify(d.sugerencia));
    check("y las plantillas APROBADAS del número para mandarla", JSON.stringify((d.sugerencia?.plantillas || []).map((p) => p.name)) === '["rescate_lead_1"]', JSON.stringify(d.sugerencia?.plantillas));
  } finally {
    globalThis.fetch = fetchOriginal;
    rmSync(tmp, { force: true });
  }
}

console.log(fallas ? `\n${fallas} falla(s).` : "\nReflote por falta de respuesta: todo en orden.");
process.exit(fallas ? 1 : 0);
