/**
 * Recursos, «adjuntar» y plantilla del asesor (dueño, 2026-11-07). SQLite real con las migraciones; WhatsApp simulado.
 * `node --no-warnings scripts/test-recursos-adjuntos.mjs` (también la corre `npm run check`).
 *   1. El asesor manda `adjuntar` y `plantilla`; el Worker los guarda.
 *   2. El banner del chat (ventana cerrada) trae cada adjunto con su recurso del banco y la plantilla sugerida.
 *   3. Mandar la plantilla NO cierra la recomendación: queda «esperando» con su texto, y la limpieza no la cierra.
 *   4. Cuando el cliente contesta, el reflote sube el chat y el banner ofrece «Enviar» con el texto guardado.
 *   5. Recursos: validación (título, tipo, link http) y alta.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones que dependen de datos de producción */ } }
const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null,
  run: async () => { const r = sq.prepare(sql).run(...a); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return st; };
const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
const fecha = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace("T", " ");

sq.exec("INSERT INTO agents (username, display_name, password_hash, role, wa_id) VALUES ('margiory', 'margiory', 'x', 'agent', '51911111111')");
sq.prepare("INSERT INTO contacts (id, wa_id, name) VALUES (1, '51969799398', 'Cliente')").run();
// Provincia, dijo «le pago mañana» hace 50 h: ventana cerrada.
sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, last_message_at) VALUES (4035, 1, ?, ?)").run(fecha(50), fecha(50));
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (4035, 'in', 'text', 'Le pago mañana, soy de Arequipa', ?)").run(fecha(50));
sq.prepare("INSERT INTO recursos (tipo, titulo, descripcion, media_key, media_mime) VALUES ('foto', 'Fotos de envíos de hoy', 'confianza', 'recursos/envios.jpg', 'image/jpeg')").run();

// WhatsApp y Meta simulados.
const enviados = [];
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (/message_templates/.test(u)) return Response.json({ data: [
    { name: "rescate_lead_1", language: "es_PE", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Hola, le escribo por su consulta del kit, ¿le quedó alguna duda?" }] }] });
  if (/\/messages$/.test(u)) { enviados.push(JSON.parse(opt.body || "{}")); return Response.json({ messages: [{ id: `wamid.${enviados.length}` }] }); }
  return Response.json({});
};
const CLAVE = "clave-de-prueba-del-asesor-123456";
const env = { CRM_DB: db, WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_BUSINESS_ACCOUNT_ID: "2", HORARIO_ENVIO: "0:00-24:00",
  ASESOR_CLAVE_SHA256: createHash("sha256").update(CLAVE).digest("hex") };

// Handlers sin sesión del CRM (se reemplaza conAuth por un agente fijo).
async function sinAuth(rel) {
  const fuente = readFileSync(join(root, rel), "utf8").replace(/conAuth\((\w+)\)/g, "((c) => $1({ ...c, agent: { role: 'agent', displayName: 'margiory' } }))")
    .replace(/conAdmin\((\w+)\)/g, "((c) => $1({ ...c, agent: { role: 'admin', displayName: 'Moi' } }))");
  const tmp = join(root, dirname(rel), `.${rel.split("/").pop()}.test.mjs`);
  writeFileSync(tmp, fuente);
  try { return await import(tmp); } finally { rmSync(tmp, { force: true }); }
}
const { onRequestPostSugerencias } = await import(join(root, "src/api/asesor.js"));
const sug = await sinAuth("src/api/crm/sugerencias.js");
const rec = await sinAuth("src/api/crm/recursos.js");
const { reflotarSugerencia, limpiarSugerenciasViejas } = await import(join(root, "src/lib/crm-sugerencias.js"));
const pedir = async (h, url, cuerpo, metodo = "POST") => {
  const r = await h({ request: new Request(`https://x${url}`, cuerpo ? { method: metodo, body: JSON.stringify(cuerpo), headers: { "x-asesor-clave": CLAVE } } : { headers: { "x-asesor-clave": CLAVE } }), env })
    .catch((err) => Response.json({ error: err.stack }, { status: 500 }));
  return { status: r.status, d: await r.json().catch(() => ({})) };
};

// 1. El asesor propone.
const r1 = await pedir(onRequestPostSugerencias, "/api/asesor/sugerencias", { origen: "asesor 10:00", sugerencias: [{ tipo: "seguimiento", whatsapp: "51969799398",
  texto: "Estimada, le dejo las fotos de los envíos de hoy a Arequipa ☺️ ¿Le reservo el suyo?", motivo: "dijo que pagaba mañana", objecion: "tiempo",
  adjuntar: ["Fotos de envíos de hoy", "foto de la agencia Shalom de Arequipa"], plantilla: "rescate_lead_1" }] });
const fila = sq.prepare("SELECT * FROM asesor_sugerencias WHERE conversation_id = 4035").get();
check("el Worker guarda adjuntar y plantilla", r1.status === 200 && fila?.plantilla === "rescate_lead_1" && JSON.parse(fila.adjuntar).length === 2, JSON.stringify(r1));

// 2. Banner con la ventana cerrada.
let b = await pedir(sug.onRequestGet, "/api/crm/sugerencias?de_chat=4035");
const s2 = b.d.sugerencia;
check("banner: responde 200 con ventana cerrada y la plantilla sugerida", b.status === 200 && s2?.ventana_abierta === false && s2?.plantilla === "rescate_lead_1" && s2.plantillas.some((p) => p.name === "rescate_lead_1"), JSON.stringify(b));
check("banner: el adjunto del banco viene con su recurso; el otro, sin recurso (se busca a mano)",
  s2?.adjuntar?.[0]?.recurso?.media_key === "recursos/envios.jpg" && s2?.adjuntar?.[1]?.recurso === null, JSON.stringify(s2?.adjuntar));

// 3. Se manda la plantilla: la recomendación queda esperando.
const r3 = await pedir(sug.onRequestPost, "/api/crm/sugerencias", { id: fila.id, accion: "aprobar", modo: "ahora", texto: s2.texto, plantilla: { name: "rescate_lead_1", language: "es_PE", params: [] } });
const tras = sq.prepare("SELECT estado, plantilla_enviada_at, reflotada_at FROM asesor_sugerencias WHERE id = ?").get(fila.id);
check("mandar la plantilla: sale una plantilla a WhatsApp", r3.status === 200 && r3.d.esperando === true && enviados.some((e) => e.type === "template" && e.template?.name === "rescate_lead_1"), JSON.stringify(r3));
check("y la recomendación sigue pendiente, esperando respuesta", tras.estado === "pendiente" && tras.plantilla_enviada_at && tras.reflotada_at === null, JSON.stringify(tras));
await limpiarSugerenciasViejas(db);
check("la limpieza no la cierra por la plantilla que mandó la vendedora", sq.prepare("SELECT estado FROM asesor_sugerencias WHERE id = ?").get(fila.id).estado === "pendiente");
b = await pedir(sug.onRequestGet, "/api/crm/sugerencias?de_chat=4035");
check("banner: «esperando respuesta» mientras el cliente no conteste", b.d.sugerencia?.esperando === true);
check("mientras espera, el reflote no sube el chat", JSON.stringify(await reflotarSugerencia(env)) === "[]");

// 4. El cliente contesta: sube el chat y el banner ofrece Enviar con el texto guardado.
sq.prepare("INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (4035, 'in', 'text', 'Hola, sí todavía quiero', datetime('now', '+1 second'))").run();
sq.prepare("UPDATE conversations SET last_inbound_at = datetime('now', '+1 second') WHERE id = 4035").run();
check("cuando el cliente contesta, el reflote sube el chat", JSON.stringify(await reflotarSugerencia(env)) === "[4035]");
b = await pedir(sug.onRequestGet, "/api/crm/sugerencias?de_chat=4035");
check("y el banner ofrece el texto guardado con la ventana abierta", b.d.sugerencia?.ventana_abierta === true && b.d.sugerencia?.esperando === false && /fotos de los envíos/.test(b.d.sugerencia?.texto));

// 5. Recursos.
const malo = await pedir(rec.onRequestPost, "/api/crm/recursos", { tipo: "link", titulo: "Instagram", url: "instagram.com/tarot" });
check("recurso: un link sin http se rechaza", malo.status === 400);
const sinTitulo = await pedir(rec.onRequestPost, "/api/crm/recursos", { tipo: "texto", titulo: " ", texto: "x" });
check("recurso: sin título se rechaza", sinTitulo.status === 400);
const ok = await pedir(rec.onRequestPost, "/api/crm/recursos", { tipo: "link", titulo: "Instagram de la tienda", url: "https://instagram.com/tarot", categoria: "Confianza" });
const lista = await pedir(rec.onRequestGet, "/api/crm/recursos");
check("recurso: se agrega y sale en la lista", ok.status === 200 && lista.d.recursos.some((r) => r.titulo === "Instagram de la tienda" && r.categoria === "Confianza"), JSON.stringify(lista.d));
await pedir(rec.onRequestDelete, "/api/crm/recursos", { id: ok.d.id }, "DELETE");
check("recurso: quitarlo lo deja inactivo (no sale, la fila sigue)", !(await pedir(rec.onRequestGet, "/api/crm/recursos")).d.recursos.some((r) => r.id === ok.d.id)
  && sq.prepare("SELECT activo FROM recursos WHERE id = ?").get(ok.d.id).activo === 0);

console.log(fallas ? `\n${fallas} falla(s).` : "\nRecursos y adjuntos del asesor: todo en orden.");
process.exit(fallas ? 1 : 0);
