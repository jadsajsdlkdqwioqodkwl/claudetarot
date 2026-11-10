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

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
