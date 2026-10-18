/**
 * Prueba de /api/order-cable sin red: Google (OAuth y Sheets) va simulado, con
 * una clave RSA real para que el JWT se firme de verdad. `npm run check` la corre.
 */
import { generateKeyPairSync } from "node:crypto";
import { onRequestPost, validate, filaDePedidoCable, prepararPestana } from "../src/api/order-cable.js";
import { COLUMNAS_CABLE, PACKS } from "../src/lib/pedido-cable.js";

let fallos = 0;
const check = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "✓" : "✗"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
};

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  GOOGLE_CLIENT_EMAIL: "bot@test.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
  GOOGLE_SHEET_ID: "LIBRO123"
};

/* Google simulado: un libro con solo la pestaña «Pedidos»; registra cada llamada. */
const llamadas = [];
const pestanas = new Set(["Pedidos"]);
let filasCable = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const cuerpo = init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body;
  llamadas.push({ url, cuerpo });
  const ok = (data) => new Response(JSON.stringify(data), { status: 200 });
  if (url.includes("oauth2.googleapis.com")) return ok({ access_token: "tok", expires_in: 3600 });
  if (url.includes(":batchUpdate")) {
    const add = cuerpo.requests.find((r) => r.addSheet);
    if (add) { pestanas.add(add.addSheet.properties.title); return ok({ replies: [{ addSheet: { properties: { sheetId: 77 } } }] }); }
    return ok({ replies: [] });
  }
  if (url.includes(":append")) {
    const tab = decodeURIComponent(url.split("/values/")[1].split("!")[0]);
    if (!pestanas.has(tab)) return new Response("no existe la pestaña", { status: 400 });
    filasCable += cuerpo.values.length;
    return ok({ updates: { updatedRange: `${tab}!A${filasCable}:P${filasCable}` } });
  }
  if (url.includes("fields=properties.title,sheets")) {
    return ok({ sheets: [...pestanas].map((t, i) => ({ properties: { sheetId: i, title: t } })) });
  }
  return new Response("?", { status: 404 });
};

const peticion = (cuerpo, ip = "190.0.0.1") =>
  new Request("https://x.test/api/order-cable", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip, "User-Agent": "Mozilla/5.0 test" },
    body: JSON.stringify(cuerpo)
  });
const avisos = [];
const ctx = (cuerpo, e = env) => ({ request: peticion(cuerpo), env: e, waitUntil: (p) => avisos.push(p) });

const base = {
  nombre: "María Fernández", telefono: "987 654 321", distrito: "Miraflores",
  direccion: "Av. Larco 1234, dpto. 502", referencia: "frente al parque", pack: "x3",
  cables: [{ conector: "Lightning", color: "Negro" }, { conector: "USB-C", color: "Naranja" }, { conector: "raro", color: "verde" }]
};

/* validate */
const v = validate(base);
check("pedido válido pasa", v.errors.length === 0, v.errors.join(","));
check("el total sale del servidor (pack x3 = 89)", v.order.total === 89 && v.order.cantidad === 3);
check("un valor raro de conector/color cae al primero de la lista",
  v.order.detalle === "1) Lightning Negro · 2) USB-C Naranja · 3) USB-C Naranja", v.order.detalle);
check("un pack desconocido cae a x1", validate({ ...base, pack: "x99" }).order.cantidad === 1);
check("el precio del formulario se ignora", validate({ ...base, total: 1, precio: 1 }).order.total === 89);
check("faltan cables: se completan por defecto", validate({ ...base, pack: "x2", cables: [] }).order.detalle === "1) USB-C Naranja · 2) USB-C Naranja");
for (const campo of ["nombre", "telefono", "distrito", "direccion"]) {
  check(`sin ${campo} se rechaza`, validate({ ...base, [campo]: "" }).errors.includes(campo));
}
check("la referencia es opcional", validate({ ...base, referencia: "" }).errors.length === 0);
check("la fila encaja con los encabezados",
  filaDePedidoCable({ ...v.order, fecha: "2026-10-18 10:00:00", eventId: "CB-X" }, new Headers()).length === COLUMNAS_CABLE.length);

/* Flujo completo */
let r = await onRequestPost(ctx(base));
let b = await r.json();
check("responde 200 con fila y total", r.status === 200 && b.ok && b.fila === 2 && b.total === 89, JSON.stringify(b));
check("el Event ID lleva el prefijo CB-", /^CB-[A-Z0-9]{6}$/.test(b.eventId), b.eventId);
check("se creó la pestaña «Cable» en el libro de Pedidos", pestanas.has("Cable"));
const append = llamadas.filter((c) => c.url.includes(":append"));
check("encabezados escritos y luego el pedido", append.length === 2 && append[0].cuerpo.values[0][0] === "Fecha");
const fila = append[1].cuerpo.values[0];
check("WhatsApp con apóstrofo y E.164", fila[2] === "'+51987654321");
check("estado inicial Pendiente", fila[COLUMNAS_CABLE.indexOf("Estado")] === "Pendiente");
check("el aviso a Telegram se encola", avisos.length === 1);

const antes = llamadas.length;
await onRequestPost(ctx(base));
const nuevas = llamadas.slice(antes);
check("el 2.º pedido no vuelve a consultar ni crear la pestaña",
  !nuevas.some((c) => c.url.includes("fields=properties.title")) && !nuevas.some((c) => c.url.includes(":batchUpdate")));

r = await onRequestPost(ctx({ ...base, website: "http://spam" }));
check("honeypot responde 200 sin guardar", r.status === 200 && (await r.json()).fila === 0);
r = await onRequestPost(ctx({ ...base, nombre: "" }));
check("datos malos = 422", r.status === 422);
r = await onRequestPost({ request: new Request("https://x.test", { method: "POST", body: "no es json" }), env, waitUntil() {} });
check("cuerpo ilegible = 400", r.status === 400);

/* Otro libro y otro nombre por variable de entorno */
pestanas.clear(); pestanas.add("Hoja");
const envOtro = { ...env, GOOGLE_CABLE_SHEET_ID: "OTRO", GOOGLE_CABLE_SHEET_NAME: "Pedidos Cable" };
const rOtro = await onRequestPost(ctx(base, envOtro));
check("GOOGLE_CABLE_SHEET_ID/NAME cambian el destino", rOtro.status === 200 && pestanas.has("Pedidos Cable") &&
  llamadas.at(-1).url.includes("/spreadsheets/OTRO/"));

/* Google caído = 502, el cliente recibe un mensaje claro */
globalThis.fetch = async () => new Response("caído", { status: 500 });
const rCaido = await onRequestPost(ctx(base, { ...env, GOOGLE_SHEET_ID: "NUEVO" }));
check("si Sheets falla el pedido falla con 502", rCaido.status === 502);

check("hay 3 packs con precio y 'viejo' mayor", Object.values(PACKS).every((p) => p.precio < p.viejo));
console.log(fallos ? `\n${fallos} fallos` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
