/**
 * Respuesta automática a comentarios de Facebook e Instagram (dueño, 2026-11-11). SQLite real; Meta simulado.
 * `node --no-warnings scripts/test-redes.mjs` (también la corre `npm run check`).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createHmac } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { palabraClave, POR_DEFECTO, procesarWebhookRedes, guardarConfig } = await import(join(root, "src/lib/redes.js"));
const webhook = await import(join(root, "src/api/meta-webhook.js"));
let fallas = 0;
const check = (n, ok, d = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${n}${ok || !d ? "" : ` — ${d}`}`); };

// 1. Palabras clave.
for (const t of ["Precio?", "¿Cuánto cuesta?", "Info porfa", "me interesa 😍", "DM", "Quiero uno", "envío a provincia?", "+info"]) check(`«${t}» activa`, Boolean(palabraClave(t, POR_DEFECTO.palabras)));
for (const t of ["Qué bonito 😍", "Amo el tarot", "Infinito", "Limaaaa", "🔥🔥🔥", ""]) check(`«${t}» no activa`, !palabraClave(t, POR_DEFECTO.palabras));

// 2. Flujo con base real.
const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null,
  run: async () => { const r = sq.prepare(sql).run(...a); return { meta: { changes: r.changes } }; } }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
const llamadas = [];
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (u.includes("/me?fields=")) return Response.json({ id: "PAGE1", name: "Tarot Store", instagram_business_account: { id: "IG1" } });
  llamadas.push({ ruta: u.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, ""), cuerpo: JSON.parse(opt.body || "{}") });
  return Response.json({ id: "ok" });
};
const env = { CRM_DB: db, META_PAGE_TOKEN: "t", META_APP_SECRET: "secreto" };
const fb = (id, from, message) => ({ object: "page", entry: [{ changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: id, post_id: "P1", from, message } }] }] });
const ig = (id, from, text) => ({ object: "instagram", entry: [{ changes: [{ field: "comments", value: { id, text, from, media: { id: "M1" } } }] }] });

await procesarWebhookRedes(env, fb("C1", { id: "U1", name: "Ana" }, "Precio por favor"));
check("Facebook: responde el comentario en público", llamadas.some((l) => l.ruta === "C1/comments" && l.cuerpo.message === POR_DEFECTO.comentario));
check("Facebook: manda el mensaje privado al comentario", llamadas.some((l) => l.ruta === "PAGE1/messages" && l.cuerpo.recipient?.comment_id === "C1" && /S\/95/.test(l.cuerpo.message?.text)));
const antes = llamadas.length;
await procesarWebhookRedes(env, fb("C1", { id: "U1", name: "Ana" }, "Precio por favor"));
check("si Meta reintenta el mismo comentario, no responde dos veces", llamadas.length === antes);
await procesarWebhookRedes(env, fb("C2", { id: "PAGE1", name: "Tarot Store" }, "¡Hola! ✨ Te envíe los detalles 📩📩 precio"));
check("nunca se responde a sí misma", llamadas.length === antes);
await procesarWebhookRedes(env, fb("C3", { id: "U2", name: "Beto" }, "Qué bonito"));
check("sin palabra clave no responde (pero queda registrado)", llamadas.length === antes && sq.prepare("SELECT palabra FROM redes_comentarios WHERE comment_id = 'C3'").get()?.palabra === null);

await procesarWebhookRedes(env, ig("IGC1", { id: "IGU1", username: "luz" }, "Info?"));
check("Instagram: responde con /replies", llamadas.some((l) => l.ruta === "IGC1/replies"));
check("Instagram: mensaje privado al comentario", llamadas.some((l) => l.ruta === "PAGE1/messages" && l.cuerpo.recipient?.comment_id === "IGC1"));
const igAntes = llamadas.length;
await procesarWebhookRedes(env, ig("IGC2", { id: "IG1", username: "tarotstore" }, "info"));
check("Instagram: nunca a la propia cuenta", llamadas.length === igAntes);

// 3. Escribe por DM después: foto una sola vez.
const dm = (sender) => ({ object: "instagram", entry: [{ messaging: [{ sender: { id: sender }, recipient: { id: "IG1" }, message: { text: "hola" } }] }] });
await procesarWebhookRedes(env, dm("IGU1"));
check("si escribe por DM, le llega la foto del kit", llamadas.some((l) => l.cuerpo.recipient?.id === "IGU1" && l.cuerpo.message?.attachment?.type === "image"));
const dmAntes = llamadas.length;
await procesarWebhookRedes(env, dm("IGU1"));
check("la foto sale una sola vez", llamadas.length === dmAntes);
await procesarWebhookRedes(env, dm("OTRO"));
check("a quien no vino de un comentario no se le manda nada", llamadas.length === dmAntes);

// 4. Apagado.
await guardarConfig(db, { activo: false });
await procesarWebhookRedes(env, fb("C9", { id: "U9", name: "Zoe" }, "precio"));
check("apagado: no responde nada", llamadas.length === dmAntes);
await guardarConfig(db, { activo: true, facebook: false });
await procesarWebhookRedes(env, fb("C10", { id: "U10", name: "Zoe" }, "precio"));
check("Facebook apagado e Instagram prendido: no responde en Facebook", llamadas.length === dmAntes);
let err = null;
try { await guardarConfig(db, { dm: "  " }); } catch (e) { err = e.message; }
check("no deja guardar el mensaje privado vacío", Boolean(err));

// 5. Webhook: verificación y firma.
const v = await webhook.onRequestGet({ request: new Request("https://x/api/meta/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=123"), env: { ...env, META_VERIFY_TOKEN: "vt" } });
check("verificación de Meta devuelve el challenge", v.status === 200 && (await v.text()) === "123");
const cuerpo = JSON.stringify(fb("C20", { id: "U20", name: "Eva" }, "precio"));
const malo = await webhook.onRequestPost({ request: new Request("https://x/api/meta/webhook", { method: "POST", body: cuerpo, headers: { "X-Hub-Signature-256": "sha256=00" } }), env });
check("firma falsa: 401", malo.status === 401);
await guardarConfig(db, { facebook: true });
const firma = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
const bueno = await webhook.onRequestPost({ request: new Request("https://x/api/meta/webhook", { method: "POST", body: cuerpo, headers: { "X-Hub-Signature-256": firma } }), env });
check("firma buena: 200 y responde", bueno.status === 200 && llamadas.some((l) => l.ruta === "C20/comments"));

// 6. Token guardado desde el panel (sin secreto en el Worker).
sq.prepare("INSERT OR REPLACE INTO crm_settings (key, value) VALUES ('redes_token', 'tok-panel')").run();
const envPanel = { CRM_DB: db };
const n6 = llamadas.length;
await procesarWebhookRedes(envPanel, ig("IGC30", { id: "IGU30", username: "mar" }, "cuánto cuesta?"));
check("con el token guardado en el panel (sin secreto en el Worker) también responde", llamadas.length === n6 + 2);
sq.prepare("DELETE FROM crm_settings WHERE key = 'redes_token'").run();
await procesarWebhookRedes(envPanel, ig("IGC31", { id: "IGU31", username: "sol" }, "precio"));
check("sin token en ningún lado no hace nada", llamadas.length === n6 + 2);

console.log(fallas ? `\n${fallas} falla(s).` : "\nComentarios de redes: todo en orden.");
process.exit(fallas ? 1 : 0);
