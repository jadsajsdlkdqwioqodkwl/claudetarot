/**
 * Pedido de prueba de punta a punta contra un Dinsides SIMULADO (2026-11-08): el endpoint /api/asesor/dinsides arma las fichas
 * desde el registro del reporte (R2 simulado) y el chat (D1 real en memoria con las migraciones), separa listos de bloqueados,
 * inicia sesión, lee el formulario, manda el listado a pedido/registro y deja la memoria (R2, etiqueta del chat). Sin red:
 * `fetch` se reemplaza por una página falsa con el mismo HTML/JSON que la real. `node --no-warnings scripts/test-dinsides-api.mjs`.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let fallas = 0;
const check = (n, ok, d = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${n}${ok || !d ? "" : ` — ${d}`}`); };

// D1 en memoria con las migraciones reales.
const sq = new DatabaseSync(":memory:");
for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* datos de producción */ } }
const d1 = { prepare: (sql) => { let a = []; const st = {
  bind: (...x) => { a = x; return st; },
  first: async () => sq.prepare(sql).get(...a) ?? null,
  all: async () => ({ results: sq.prepare(sql).all(...a) }),
  run: async () => { const r = sq.prepare(sql).run(...a); return { meta: { changes: r.changes } }; } }; return st; } };
sq.exec(`INSERT INTO contacts (id, wa_id, name) VALUES (1, '51957845104', 'Gladys Falcón'), (2, '51999999990', 'Solo Pin'), (3, '51988888880', 'Fuera del reporte');
  INSERT INTO conversations (id, contact_id, assigned_agent, last_message_at, last_inbound_at) VALUES (1, 1, 'Bruce', datetime('now'), datetime('now')), (2, 2, 'Mayra', datetime('now'), datetime('now')), (3, 3, 'Bruce', datetime('now'), datetime('now'));
  INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES
   (1, 'in', 'text', 'Av. Tomás Marsano 2500 Dpto 301, Surco. Ref: frente al parque', datetime('now')),
   (2, 'in', 'location', '-12.1211|-77.0297||', datetime('now')),
   (3, 'in', 'text', 'Mi dirección es Jr Puno 500, Cercado de Lima, referencia al costado del banco', datetime('now'));`);

// R2 simulado con el registro de esta noche (lo que dejó el reporte «Pedidos y ventas»).
const r2 = new Map();
const R2 = { get: async (k) => (r2.has(k) ? { text: async () => r2.get(k) } : null), put: async (k, v) => { r2.set(k, String(v)); } };
const { fechaEntrega } = await import(join(root, "src/lib/dinsides.js"));
const FECHA = fechaEntrega().fecha; // mañana (hora de Lima), como lo haría la Routine esta noche
r2.set(`pedidos-estado/${FECHA}.json`, JSON.stringify({ pedidos: [
  { estado: "CONFIRMADO", destino: "LIMA", vendedora: "Bruce", nombre: "Gladys Falcón", whatsapp: "51957845104", direccion_o_agencia: "Av. Tomás Marsano 2500 Dpto 301, Surco. Ref: frente al parque", kits: 1, pago: "Yape", nota: "La recibe ella; paga con Yape al recibir" },
  { estado: "CONFIRMADO", destino: "LIMA", vendedora: "Mayra", nombre: "Solo Pin", whatsapp: "51999999990", direccion_o_agencia: "(mandó su ubicación)", kits: 1 },
  { estado: "POR_VERIFICAR", destino: "LIMA", vendedora: "Bruce", nombre: "Dudoso", whatsapp: "51977777770", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", nota: "dijo que yapeó sin captura" },
  { estado: "CONFIRMADO", destino: "PROVINCIA", vendedora: "Bruce", nombre: "Prov", whatsapp: "51966666660", direccion_o_agencia: "Shalom Arequipa" },
  { estado: "CONFIRMADO", destino: "LIMA", vendedora: "Mayra", nombre: "Sin distrito", whatsapp: "51955555550", direccion_o_agencia: "Mz C Lt 12 Urb Los Jardines, ref. parque", kits: 1 }
] }));

// Dinsides simulado.
const llamadas = [];
const HTML_FORM = `<html><body><select id="tipo_pedido"><option value="0">Seleccione</option><option value="CONTRAENTREGA">CONTRAENTREGA</option><option value="SOLO-ENTREGA-NO-COBRAR">SOLO ENTREGA</option></select>
<select id="id_distrito"><option value="0">Seleccione</option><option value="150140" data-price="10">SANTIAGO DE SURCO</option><option value="150122" data-price="10">MIRAFLORES</option><option value="150101" data-price="11">CERCADO DE LIMA</option><option value="150110" data-price="12">COMAS</option></select>
<select id="tipo_pago"><option value="">-</option><option value="YAPE">YAPE</option><option value="NO COBRAR">NO COBRAR</option></select>
<select id="selectRecojo"><option value="0">Seleccione</option><option value="3">Recoger en mi domicilio</option><option value="4">Lo llevo a la sede</option></select>
<input type="hidden" id="trecojo" value="1"><select id="tTurno"><option value="" selected>Todo el día</option><option value="M">Mañana</option></select>
<button class="btn addPedidos" data-idn="77">Guardar</button><div id="count-down-timer"></div></body></html>`;
const LOGIN_HTML = `<html><head><title>Dinsides Courier | Iniciar sesión</title></head><body><button id="loginUser">Entrar</button></body></html>`;
let listadoFalso = []; // lo que devuelve pedido/getlistadoCliente
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); const cookie = init.headers?.Cookie || "";
  llamadas.push({ url: u, method: init.method || "GET", body: init.body || "", cookie });
  const resp = (status, body, headers = {}) => new Response(body, { status, headers });
  if (/nominatim\.openstreetmap\.org/.test(u)) {
    // «Urb Los Jardines» se ubica en el Parque Kennedy (polígono MIRAFLORES del mapa); lo demás no se ubica.
    if (/Jardines/.test(decodeURIComponent(u))) return resp(200, JSON.stringify([{ lat: "-12.1211", lon: "-77.0297", display_name: "Urb Los Jardines, Miraflores, Lima, Perú" }]));
    return resp(200, "[]");
  }
  if (u.endsWith("pedido/getlistadoCliente")) return /ci_session=ok/.test(cookie) ? resp(200, JSON.stringify(listadoFalso)) : resp(200, LOGIN_HTML);
  if (u.endsWith("pedido/anular_tienda")) {
    const id = new URLSearchParams(init.body).get("id_pedido");
    const x = listadoFalso.find((y) => y.id_pedido === id);
    if (!x) return resp(200, "0");
    if (/EN RUTA/.test(x.seguimiento)) return resp(200, "2");
    x.seguimiento = "ANULADO- POR TIENDA";
    return resp(200, "1");
  }
  if (/pedido\/detalle\/(\d+)$/.test(u)) {
    const id = u.match(/(\d+)$/)[1]; const x = listadoFalso.find((y) => y.id_pedido === id);
    if (!x) return resp(200, "<html>sin pedido</html>");
    return resp(200, `<html><script>var pedido = ${JSON.stringify({ id_pedido: x.id_pedido, id_destinatario: "77" + x.id_pedido, nombre_destinataio: x.nombre_destinataio, telefono_destinatario: x.telefono_destinatario,
      id_distrito: "150101", direccion_destinatario: "dir", detalle: "Kit", monto_cobrar: x.monto_cobrar, costo_service: "10.00", observaciones: "", fecha_entrega: x.fecha_entrega, coordenadas: "", tipo_pedido: "CONTRAENTREGA", metodo_pago: "YAPE", tipo_turno: "0" })};</script></html>`);
  }
  if (u.endsWith("pedido/udpate")) {
    const ps = new URLSearchParams(init.body); const x = listadoFalso.find((y) => y.id_pedido === ps.get("id_pedido"));
    if (!x || !ps.get("id_destinatario")) return resp(200, "0");
    x.fecha_entrega = ps.get("fecha_entrega") + " 00:00:00"; x.nombre_destinataio = ps.get("nombre");
    return resp(200, "1");
  }
  if (u.endsWith("pedido/nuevo")) {
    if (/ci_session=ok/.test(cookie)) return resp(200, HTML_FORM);
    return resp(200, LOGIN_HTML, { "set-cookie": "ci_session=anon; path=/" });
  }
  if (u.endsWith("login/validar")) {
    const ps = new URLSearchParams(init.body);
    if (ps.get("tlf") === "999111222" && ps.get("clave") === "secreto") return resp(200, "3", { "set-cookie": "ci_session=ok; path=/" });
    return resp(200, "0");
  }
  if (u.endsWith("pedido/registro")) {
    if (!/ci_session=ok/.test(cookie)) return resp(401, "");
    const ps = new URLSearchParams(init.body);
    const n = ps.getAll("nombres[]").length;
    if (!n || ps.getAll("revisar[]").length !== n) return resp(200, "4");
    ps.getAll("nombres[]").forEach((nombre, i) => listadoFalso.push({ id_pedido: String(9000 + listadoFalso.length), nombre_destinataio: nombre, telefono_destinatario: ps.getAll("tlfs[]")[i],
      nombre_distrito: "x", fecha_pedido: `2026-11-08 2${i}:00:00`, fecha_entrega: `${ps.getAll("fechas_entrega[]")[i]} 00:00:00`, seguimiento: "REGISTRADO", monto_cobrar: ps.getAll("cobrars[]")[i] }));
    return resp(200, "1");
  }
  return resp(404, "");
};

const CLAVE = "clave-de-prueba-larga-123456";
const env = { CRM_DB: d1, CRM_MEDIA: R2, ASESOR_CLAVE_SHA256: createHash("sha256").update(CLAVE).digest("hex"), DINSIDES_TLF: "999111222", DINSIDES_CLAVE: "secreto" };
const { onRequestGet, onRequestPost } = await import(join(root, "src/api/asesor-dinsides.js"));
const req = (method, body, qs = "") => new Request(`https://x/api/asesor/dinsides${qs}`, { method, headers: { "x-asesor-clave": CLAVE, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const pedir = async (method, body, qs) => { const r = await (method === "GET" ? onRequestGet({ request: req("GET", null, qs), env }) : onRequestPost({ request: req("POST", body), env })); return { status: r.status, json: await r.json() }; };

// 1. GET: fichas listas y bloqueadas, candidatos del CRM.
let r = await pedir("GET", null, `?fecha=${FECHA}`);
check("GET responde 200 con la fecha pedida", r.status === 200 && r.json.fecha === FECHA, JSON.stringify(r.json).slice(0, 300));
const porWa = Object.fromEntries((r.json.pedidos || []).map((f) => [f.whatsapp, f]));
check("provincia no aparece", !porWa["51966666660"]);
check("Gladys está lista (Surco, 957845104, S/89 YAPE) con la dirección del chat a la vista", porWa["51957845104"]?.listo && porWa["51957845104"].campos.id_distrito === "150140" && porWa["51957845104"].direcciones_chat.length === 1, JSON.stringify(porWa["51957845104"]));
check("Solo Pin: bloqueo de dirección, distrito deducido del pin del chat (Miraflores)", porWa["51999999990"] && !porWa["51999999990"].listo && porWa["51999999990"].campos.distrito === "miraflores"
  && porWa["51999999990"].bloqueos.some((b) => /^DIRECCIÓN/.test(b)), JSON.stringify(porWa["51999999990"]?.bloqueos));
check("POR_VERIFICAR queda bloqueado", porWa["51977777770"] && porWa["51977777770"].bloqueos.some((b) => /^ESTADO POR_VERIFICAR/.test(b)));
check("el chat con dirección que el reporte no trae sale como candidato del CRM", (r.json.candidatos_crm || []).some((c) => c.whatsapp === "51988888880" && /Jr Puno/.test(c.senales[0])), JSON.stringify(r.json.candidatos_crm));
check("sin distrito en el texto, lo da el MAPA de cobertura ubicando la dirección (OpenStreetMap → polígono Miraflores)", porWa["51955555550"]?.listo && porWa["51955555550"].campos.distrito === "miraflores"
  && porWa["51955555550"].alertas.some((a) => /DISTRITO por el mapa de cobertura/.test(a)), JSON.stringify(porWa["51955555550"]));
check("resumen: 2 listos, 2 con bloqueos", r.json.resumen.listos === 2 && r.json.resumen.con_bloqueos === 2, JSON.stringify(r.json.resumen));

// 2. zona
r = await pedir("GET", null, "?zona=-12.1211,-77.0297");
check("GET ?zona= dice Miraflores", r.json.zona?.distrito === "miraflores");

// 3. probar
r = await pedir("POST", { accion: "probar" });
check("probar: entra, lee el formulario (negocio 77, recojo en domicilio 3) y avisa las diferencias de tarifa", r.status === 200 && r.json.formulario.negocio === "77"
  && r.json.formulario.recojo.id_recojo === "3" && r.json.formulario.diferencias.some((d) => /CERCADO DE LIMA: Dinsides S\/11, repo S\/10/.test(d)), JSON.stringify(r.json).slice(0, 400));

// 4. simular (pedido de prueba sin crear nada)
r = await pedir("POST", { accion: "registrar", fecha: FECHA, simular: true });
check("simular: arma el payload de los listos (Gladys y Sin distrito) y no manda pedido/registro", r.json.simulado && r.json.payload.nombres.length === 2 && r.json.payload.id_distritos[0] === "150140"
  && r.json.payload.negocio === "77" && !llamadas.some((l) => l.url.endsWith("pedido/registro")), JSON.stringify(r.json.payload));

// 5. registrar con una corrección para el pin (dirección escrita por la persona) y un pedido NUEVO que el reporte no traía (candidato del CRM)
r = await pedir("POST", { accion: "registrar", fecha: FECHA, origen: "prueba", pedidos: [{ whatsapp: "51957845104" }, { whatsapp: "51999999990", direccion: "Calle Schell 345 Dpto 2, Miraflores" },
  { whatsapp: "51988888880", nombre: "Fuera del reporte", direccion: "Jr Puno 500, Cercado de Lima, al costado del banco", distrito: "Cercado de Lima", estado: "CONFIRMADO" }, { whatsapp: "51955555550" }] });
check("registrar: Dinsides respondió 1 y se registraron los cuatro indicados (tres del reporte + uno nuevo de la Routine)", r.status === 200 && r.json.ok && r.json.registrados.length === 4, JSON.stringify(r.json).slice(0, 600));
check("cada registrado trae el id que le dio Dinsides (buscado en el listado por teléfono y fecha)", r.json.registrados.every((x) => /^900\d$/.test(x.nro)), JSON.stringify(r.json.registrados.map((x) => x.nro)));
const post = llamadas.find((l) => l.url.endsWith("pedido/registro"));
const ps = new URLSearchParams(post?.body || "");
check("el POST lleva los arreglos como la página (nombres[], tlfs[], id_distritos[], fechas_entrega[], revisar[])", ps.getAll("nombres[]").length === 4 && ps.getAll("tlfs[]").includes("957845104")
  && ps.getAll("id_distritos[]").includes("150122") && ps.getAll("id_distritos[]").includes("150101") && ps.getAll("fechas_entrega[]").every((f) => f === FECHA) && ps.getAll("revisar[]").length === 4 && ps.get("id_recojo") === "3", post?.body?.slice(0, 300));
check("el POST va con la sesión iniciada y como AJAX", /ci_session=ok/.test(post?.cookie || ""));
const reg = JSON.parse(r2.get(`dinsides/${FECHA}.json`));
check("memoria en R2: cuatro registros con su nro y la corrida", reg.registros.length === 4 && reg.corridas.length === 1 && reg.registros[0].modo === "api" && reg.registros[0].nro, JSON.stringify(reg).slice(0, 200));
check("etiqueta dinsides_registrado en los chats", / dinsides_registrado/.test(` ${sq.prepare("SELECT meta_tags FROM conversations WHERE id = 1").get().meta_tags}`), String(sq.prepare("SELECT meta_tags FROM conversations WHERE id = 1").get().meta_tags));

// 6. idempotencia: la segunda vez no registra nada.
const antes = llamadas.filter((l) => l.url.endsWith("pedido/registro")).length;
r = await pedir("POST", { accion: "registrar", fecha: FECHA });
check("segunda corrida: ya registrados, sin nuevo POST", r.json.registrados.length === 0 && r.json.no_van.filter((x) => x.ya_registrado).length === 3 && llamadas.filter((l) => l.url.endsWith("pedido/registro")).length === antes, JSON.stringify(r.json.no_van).slice(0, 300));

// 7. marcar a mano uno que no estaba en el sistema
r = await pedir("POST", { accion: "marcar", fecha: FECHA, whatsapp: "51977777770", nro: "A1", motivo: "lo registró Moi a mano" });
check("marcar guarda el registro manual", r.json.ok && JSON.parse(r2.get(`dinsides/${FECHA}.json`)).registros.some((x) => x.whatsapp === "51977777770" && x.modo === "manual"));

// 7b. estados: Dinsides dice que el de Gladys ya se entregó → etiqueta en el chat (la hoja no está en esta prueba)
listadoFalso.find((x) => x.telefono_destinatario === "957845104").seguimiento = "ENTREGADO";
r = await pedir("POST", { accion: "estados", marcar: true });
check("estados: clasifica el historial de Dinsides (1 entregado, 3 pendientes)", r.json.ok && r.json.entregados.length === 1 && r.json.pendientes.length === 3, JSON.stringify(r.json).slice(0, 300));
check("sin fila en la hoja no se marca nada, pero se lista para revisar", r.json.sin_fila_en_hoja.length === 4 && r.json.marcados === 0);

// 7c. anular el pedido nuevo (como el pedido de prueba) y ver que Dinsides lo deja ANULADO
const idNuevo = listadoFalso.find((x) => x.telefono_destinatario === "988888880").id_pedido;
r = await pedir("POST", { accion: "anular", fecha: FECHA, ids: [idNuevo, "1"], motivo: "prueba" });
check("anular: solo anula ids del negocio (pedido/anular_tienda) y devuelve el estado nuevo", r.json.ok && r.json.anulados[0].seguimiento === "ANULADO- POR TIENDA" && r.json.no_eran_mios.includes("1"), JSON.stringify(r.json));
check("la memoria anota la anulación", JSON.parse(r2.get(`dinsides/${FECHA}.json`)).registros.some((x) => x.nro === idNuevo && x.anulado));
r = await pedir("GET", null, `?fecha=${FECHA}&candidatos=0`);
check("un pedido anulado deja de contar como registrado (se puede volver a registrar)", !(r.json.pedidos.find((f) => f.whatsapp === "51988888880") || {}).ya_registrado, JSON.stringify(r.json.pedidos.map((f) => [f.whatsapp, f.ya_registrado])));

// 7c2. quitar: repara la memoria cuando un registro quedó como hecho y no lo está
r = await pedir("POST", { accion: "quitar", fecha: FECHA, whatsapp: "51957845104", motivo: "prueba" });
check("quitar saca al WhatsApp de la memoria y del índice", r.json.ok && r.json.quitados === 1 && !JSON.parse(r2.get("dinsides/indice.json"))["957845104"], JSON.stringify(r.json));
r = await pedir("GET", null, `?fecha=${FECHA}&candidatos=0`);
check("tras quitar, vuelve a estar listo para registrarse", (r.json.pedidos.find((f) => f.whatsapp === "51957845104") || {}).listo === true);

// 7d. editar: mover la fecha de entrega de Gladys una semana (como pide el dueño: todo se puede editar antes de la ruta)
const idGladys = listadoFalso.find((x) => x.telefono_destinatario === "957845104").id_pedido;
const nuevaFecha = new Date(new Date(`${FECHA}T00:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10);
r = await pedir("POST", { accion: "editar", id: idGladys, cambios: { fecha_entrega: nuevaFecha, distrito: "San Isidro" } });
check("editar: Dinsides respondió 1, se mandó la fecha nueva y el código del distrito", r.json.ok && listadoFalso.find((x) => x.id_pedido === idGladys).fecha_entrega.startsWith(nuevaFecha)
  && new URLSearchParams(llamadas.filter((l) => l.url.endsWith("pedido/udpate")).pop().body).get("distrito") === "150131", JSON.stringify(r.json).slice(0, 300));
r = await pedir("POST", { accion: "editar", id: idGladys, cambios: { fecha_entrega: "2020-01-01" } });
check("editar con fecha pasada se rechaza", r.status === 400);

// 7b. Cruce con lo que el equipo ya tiene en Dinsides (caso Laura, dueño 2026-11-09): por teléfono y por nombre, sin duplicar.
listadoFalso.find((x) => x.id_pedido === idGladys).seguimiento = "REGISTRADO"; // sigue abierto en Dinsides (el equipo lo reagendó)
r = await pedir("GET", null, `?fecha=${FECHA}&candidatos=0`);
let gl = r.json.pedidos.find((f) => f.whatsapp === "51957845104");
check("ya abierto en Dinsides con el mismo teléfono → ya_registrado «en Dinsides (teléfono)», no listo, y avisa que está agendado para otra fecha",
  gl && !gl.listo && gl.ya_registrado?.modo === "en Dinsides (teléfono)" && gl.ya_registrado.nro === idGladys && gl.alertas.some((a) => /YA AGENDADO en Dinsides para el/.test(a)), JSON.stringify(gl?.ya_registrado) + JSON.stringify(gl?.alertas));
r = await pedir("POST", { accion: "quitar", fecha: FECHA, whatsapp: "51955555550", motivo: "prueba cruce por nombre" });
const propio = listadoFalso.find((x) => x.telefono_destinatario === "955555550"); propio.seguimiento = "ANULADO- POR TIENDA"; // su propio pedido ya no está abierto
listadoFalso.push({ id_pedido: "8800", nombre_destinataio: "Sin Distrito Pérez", telefono_destinatario: "900000001", nombre_distrito: "x", fecha_pedido: "2026-11-07 10:00:00", fecha_entrega: `${FECHA} 00:00:00`, seguimiento: "REGISTRADO", monto_cobrar: "89" });
r = await pedir("GET", null, `?fecha=${FECHA}&candidatos=0`);
let sd = r.json.pedidos.find((f) => f.whatsapp === "51955555550");
check("otro teléfono pero mismo nombre (2 palabras) abierto en Dinsides → ya_registrado «en Dinsides (nombre)»", sd && !sd.listo && sd.ya_registrado?.modo === "en Dinsides (nombre)" && sd.ya_registrado.nro === "8800", JSON.stringify(sd?.ya_registrado));
r = await pedir("POST", { accion: "registrar", fecha: FECHA, pedidos: [{ whatsapp: "51955555550" }] });
check("registrar no lo duplica: va a no_van como ya registrado", r.json.registrados.length === 0 && r.json.no_van.some((x) => x.whatsapp === "51955555550" && x.ya_registrado), JSON.stringify(r.json.no_van).slice(0, 200));
listadoFalso.find((x) => x.id_pedido === idGladys).seguimiento = "ENTREGADO";
listadoFalso.splice(listadoFalso.findIndex((x) => x.id_pedido === "8800"), 1); propio.seguimiento = "REGISTRADO";

// 8. sin credenciales: 503 con el script de consola
const env2 = { ...env, DINSIDES_TLF: "", DINSIDES_CLAVE: "" };
r2.delete(`dinsides/${FECHA}.json`); r2.delete("dinsides/indice.json");
sq.exec("UPDATE conversations SET meta_tags = NULL");
let rr = await onRequestPost({ request: req("POST", { accion: "registrar", fecha: FECHA }), env: env2 });
let j = await rr.json();
check("sin credenciales: 503 sin_credenciales y el script para la consola", rr.status === 503 && j.error === "sin_credenciales" && /#id_distrito/.test(j.script) && j.listos.length === 2, JSON.stringify(j).slice(0, 200));

// 9. clave incorrecta de Dinsides
rr = await onRequestPost({ request: req("POST", { accion: "probar" }), env: { ...env, DINSIDES_CLAVE: "mala" } });
j = await rr.json();
check("clave de Dinsides incorrecta: 503 con el motivo", rr.status === 503 && /rechazó el inicio de sesión/.test(j.detalle), JSON.stringify(j));

// 10. sin clave del asesor
rr = await onRequestGet({ request: new Request(`https://x/api/asesor/dinsides`), env });
check("sin x-asesor-clave → 401", rr.status === 401);

if (fallas) { console.error(`\n${fallas} prueba(s) del endpoint de Dinsides fallaron`); process.exit(1); }
console.log("\nDinsides (endpoint): todo OK");
