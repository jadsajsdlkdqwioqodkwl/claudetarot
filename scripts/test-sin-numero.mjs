/**
 * Clientes sin número (2026-11-10): quien usa «nombre de usuario» de WhatsApp llega sin `from`, solo con su id de
 * negocio (BSUID). Del 1 al 10/11 el webhook botó 307 mensajes de 241 personas. SQLite real + webhook real + Meta simulado.
 * `node --no-warnings scripts/test-sin-numero.mjs` (también la corre `npm run check`).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createHmac } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones que dependen de datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null,
  run: async () => { const r = sq.prepare(sql).run(...a); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };

const enviados = [];
globalThis.fetch = async (url, opt = {}) => {
  if (/\/(messages|block_users)$/.test(String(url))) { enviados.push(JSON.parse(opt.body || "{}")); return Response.json({ messages: [{ id: `wamid.out${enviados.length}` }] }); }
  return Response.json({});
};
const SECRETO = "secreto-de-prueba";
const env = { CRM_DB: db, WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: SECRETO };

const { onRequestPost } = await import("../src/api/whatsapp-webhook.js");
const { enviarTexto, enviarMedia, enviarTemplate, bloquearUsuario, esBsuid } = await import("../src/lib/whatsapp.js");

let n = 0;
async function llega({ from, userId, username, nombre = "Cliente", texto = "Hola, vengo de sus redes" }) {
  const cuerpo = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "2", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "51999", phone_number_id: "1" },
    contacts: [{ profile: { name: nombre, ...(username ? { username } : {}) }, ...(from ? { wa_id: from } : {}), user_id: userId }],
    messages: [{ ...(from ? { from } : {}), from_user_id: userId, id: `wamid.in${++n}`, timestamp: "1", type: "text", text: { body: texto } }] } }] }] });
  const firma = "sha256=" + createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
  const tareas = [];
  const res = await onRequestPost({ request: new Request("https://x/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "X-Hub-Signature-256": firma } }), env, waitUntil: (p) => tareas.push(p) });
  await Promise.all(tareas);
  return res.status;
}
const uno = (sql, ...a) => sq.prepare(sql).get(...a);

// 1. Mensaje sin número: abre su chat con el id de negocio y guarda el texto.
check("el webhook responde 200", (await llega({ userId: "PE.1122042103891274", username: "maria.tarot", nombre: "María" })) === 200);
const c1 = uno("SELECT * FROM contacts WHERE wa_id = 'PE.1122042103891274'");
check("se crea el contacto con su id de negocio", Boolean(c1), "no se creó");
check("guarda user_id y @usuario", c1?.user_id === "PE.1122042103891274" && c1?.username === "maria.tarot");
const m1 = uno("SELECT m.body FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE cv.contact_id = ? AND m.direction = 'in'", c1?.id);
check("el mensaje queda en el chat", m1?.body === "Hola, vengo de sus redes", JSON.stringify(m1));
check("no queda nada en webhook_errores", uno("SELECT COUNT(*) n FROM webhook_errores").n === 0, JSON.stringify(uno("SELECT error FROM webhook_errores")));

// 2. Segundo mensaje de la misma persona: mismo chat, no duplica.
await llega({ userId: "PE.1122042103891274", texto: "¿Precio?" });
check("el segundo mensaje cae en el mismo contacto", uno("SELECT COUNT(*) n FROM contacts").n === 1);
check("y en el mismo chat", uno("SELECT COUNT(*) n FROM conversations").n === 1 && uno("SELECT COUNT(*) n FROM messages WHERE direction='in'").n === 2);

// 3. Luego llega CON número (lo compartió): el mismo chat pasa a tener número.
await llega({ from: "51987654321", userId: "PE.1122042103891274", texto: "Mi número es este" });
check("al compartir su número, el chat sin número pasa a tenerlo (no se duplica)", uno("SELECT COUNT(*) n FROM contacts").n === 1 && uno("SELECT wa_id FROM contacts").wa_id === "51987654321");

// 4. Cliente de siempre (con número) que después llega sin número: se reconoce por su id.
await llega({ from: "51911222333", userId: "PE.999", nombre: "Rosa" });
await llega({ userId: "PE.999", nombre: "Rosa", texto: "Hola de nuevo" });
check("cliente conocido que llega sin número cae en su chat de siempre", uno("SELECT COUNT(*) n FROM contacts").n === 2 &&
  uno("SELECT COUNT(*) n FROM messages m JOIN conversations cv ON cv.id = m.conversation_id JOIN contacts c ON c.id = cv.contact_id WHERE c.wa_id = '51911222333'").n === 2);

// 5. Envíos: a un id de negocio se le escribe con `recipient`; a un número, con `to` como siempre.
enviados.length = 0;
await enviarTexto(env, "PE.1122042103891274", "Hola");
await enviarMedia(env, "PE.1122042103891274", "image", "123");
await enviarTemplate(env, "PE.1122042103891274", "rescate_lead_1", "es_PE");
await enviarTexto(env, "51987654321", "Hola");
check("texto, foto y plantilla a un cliente sin número salen con `recipient`", enviados.slice(0, 3).every((e) => e.recipient === "PE.1122042103891274" && !("to" in e)), JSON.stringify(enviados[0]));
check("a un número sale con `to`, igual que antes", enviados[3].to === "51987654321" && !("recipient" in enviados[3]));
await bloquearUsuario(env, "PE.1122042103891274");
check("bloquear a un cliente sin número usa `user_id`", enviados[4].block_users[0].user_id === "PE.1122042103891274");
check("esBsuid no confunde un número", esBsuid("PE.11") && !esBsuid("51987654321") && !esBsuid(""));

// 6. Un mensaje que no se puede procesar deja el mensaje ENTERO guardado.
await llega({ userId: undefined, texto: "sin nada" });
const e = uno("SELECT * FROM webhook_errores ORDER BY id DESC LIMIT 1");
check("lo que no se puede procesar queda con el mensaje entero (payload)", /sin nada/.test(e?.payload || ""), JSON.stringify(e));

// 7. Recuperar a los que se perdieron antes del arreglo: el id sale del wa_message_id; a los de las últimas 24 h, bienvenida.
{
  const { onRequestPost: recuperar, bsuidDeWamid } = await import("../src/api/asesor-recuperar.js");
  const wamid = (id) => "wamid." + Buffer.from(`\x1c\x18\x13${id}\x15\x14\x00\x12\x18 ABCDEF`, "latin1").toString("base64");
  check("saca el id de negocio del id del mensaje real de Meta", bsuidDeWamid("wamid.HBgTUEUuMTEyMjA0MjEwMzg5MTI3NBUUABIYIEFDRTUwNkU5QzUwRkNENkJEOTZCNkQ5MUE4QkQ2QUVFAA==") === "PE.1122042103891274");
  sq.exec("DELETE FROM webhook_errores");
  const ins = sq.prepare("INSERT INTO webhook_errores (wa_id, wa_message_id, error, created_at) VALUES (NULL, ?, 'sin número', datetime('now', ?))");
  ins.run(wamid("PE.7001"), "-2 hours"); ins.run(wamid("PE.7001"), "-1 hours"); ins.run(wamid("PE.7002"), "-30 hours");
  sq.prepare("INSERT INTO welcome_steps (step_order, title, body) VALUES (1, 'Saludo', 'Hola, bienvenida')").run();
  env.ASESOR_CLAVE = "clave-de-prueba-del-asesor-123456";
  env.ASESOR_CLAVE_SHA256 = (await import("node:crypto")).createHash("sha256").update(env.ASESOR_CLAVE).digest("hex");
  enviados.length = 0;
  const pedir = async (body) => (await recuperar({ request: new Request("https://x/api/asesor/recuperar", { method: "POST", body: JSON.stringify(body), headers: { "x-asesor-clave": env.ASESOR_CLAVE } }), env })).json();
  const r = await pedir({ horas: 48 });
  check("recupera a las 2 personas (3 mensajes), sin fallos", r.personas === 2 && r.recuperados?.length === 2 && !r.fallidos.length, JSON.stringify(r));
  check("la bienvenida sale solo a quien escribió hace menos de 24 h, con `recipient`", enviados.filter((e) => e.type === "text").length === 1 && enviados.find((e) => e.type === "text")?.recipient === "PE.7001", JSON.stringify(enviados));
  const cv = uno("SELECT cv.unread_count, cv.last_inbound_at, m.body FROM contacts c JOIN conversations cv ON cv.contact_id = c.id JOIN messages m ON m.conversation_id = cv.id AND m.direction = 'in' WHERE c.wa_id = 'PE.7001'");
  check("el chat queda con la nota en lugar de lo que escribió", /2 mensajes/.test(cv?.body || ""), JSON.stringify(cv));
  const r2 = await pedir({ horas: 48 });
  check("no repite: la segunda llamada no crea ni manda nada", r2.recuperados.length === 0 && r2.ya_tenian_chat === 2 && enviados.filter((e) => e.type === "text").length === 1, JSON.stringify(r2));
}

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
