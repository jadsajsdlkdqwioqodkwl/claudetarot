/**
 * Cliente HTTP de Dinsides Courier (https://dinsidescourier.com): hace lo mismo que el navegador de la asesora, desde el Worker.
 *
 *   login(env)                      → POST login/validar { tlf, clave } (las credenciales son SECRETOS del Worker:
 *                                     DINSIDES_TLF y DINSIDES_CLAVE, puestos con `wrangler secret put`; nunca en el repo).
 *                                     Devuelve la cookie de sesión.
 *   formulario(env, cookie)         → GET pedido/nuevo con la sesión: lee las opciones reales del formulario (distritos con su
 *                                     tarifa, tipos de pedido y de pago, cómo se trasladan los pedidos, turnos, id del negocio).
 *                                     Sirve para `probar` (ver que la tabla DISTRITOS del repo sigue igual) y para armar el POST.
 *   registrar(env, cookie, payload) → POST pedido/registro con los arreglos de `payloadRegistro` (src/lib/dinsides.js): es el
 *                                     botón «Guardar» del listado. Dinsides responde 1 = registrado, 2 = error, 4 = falta «revisar».
 *
 * Lo que la página hace sola (y aquí se replica): el formulario caduca a los 10 minutos (se vuelve a pedir la sesión en cada
 * corrida), la fecha de entrega no puede ser pasada, el teléfono son 9 dígitos que empiezan en 9 y no se repite en un listado.
 */
import { codificarFormulario, DISTRITOS } from "./dinsides.js";

export const BASE_POR_DEFECTO = "https://dinsidescourier.com/";
const UA = "Mozilla/5.0 (X11; Linux x86_64) TarotStore-CRM/1.0";

export function hayCredenciales(env) {
  return Boolean(env?.DINSIDES_TLF && env?.DINSIDES_CLAVE);
}

const base = (env) => String(env?.DINSIDES_URL || BASE_POR_DEFECTO).replace(/\/?$/, "/");

/** Junta las cookies de una o varias respuestas en un header Cookie (nombre=valor; …). */
function juntarCookies(previas, res) {
  const jar = new Map(String(previas || "").split(/;\s*/).filter(Boolean).map((c) => c.split("=")).map(([k, ...v]) => [k, v.join("=")]));
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  for (const sc of setCookies) {
    const [par] = String(sc).split(";");
    const i = par.indexOf("=");
    if (i > 0) jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function pedir(env, ruta, { method = "GET", cookie = "", cuerpo = null, ajax = false } = {}) {
  const headers = { "User-Agent": UA, Accept: ajax ? "application/json, text/javascript, */*; q=0.01" : "text/html,*/*" };
  if (cookie) headers.Cookie = cookie;
  if (cuerpo !== null) headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  if (ajax) { headers["X-Requested-With"] = "XMLHttpRequest"; headers.Referer = `${base(env)}pedido/nuevo`; headers.Origin = base(env).replace(/\/$/, ""); }
  const res = await fetch(`${base(env)}${ruta}`, { method, headers, body: cuerpo, redirect: "manual" });
  const texto = await res.text();
  return { status: res.status, texto, cookie: juntarCookies(cookie, res), location: res.headers.get("location") || "" };
}

/** Inicia sesión. Devuelve { cookie, perfil } o lanza con un mensaje claro (sin la clave). */
export async function login(env) {
  if (!hayCredenciales(env)) throw new Error("sin_credenciales: faltan los secretos DINSIDES_TLF y DINSIDES_CLAVE en el Worker");
  const tlf = String(env.DINSIDES_TLF).replace(/\D/g, "");
  if (!/^9\d{8}$/.test(tlf)) throw new Error("DINSIDES_TLF debe ser el celular de 9 dígitos con el que se entra a Dinsides");
  const inicio = await pedir(env, "pedido/nuevo"); // la primera visita crea la cookie de sesión
  const r = await pedir(env, "login/validar", { method: "POST", cookie: inicio.cookie, ajax: true,
    cuerpo: codificarFormulario({ tlf, clave: String(env.DINSIDES_CLAVE) }) });
  let perfil = null;
  try { perfil = JSON.parse(r.texto); } catch { /* HTML de error */ }
  if (r.status >= 400 || perfil === null || perfil === 0 || perfil === "0") {
    throw new Error(`Dinsides rechazó el inicio de sesión (http ${r.status}${perfil !== null ? `, respuesta ${JSON.stringify(perfil)}` : ""}): teléfono o clave incorrectos`);
  }
  return { cookie: r.cookie, perfil };
}

const opciones = (html, id) => {
  const m = html.match(new RegExp(`<select[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, "i"));
  if (!m) return null;
  const out = [];
  for (const o of m[1].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const attrs = o[1];
    const valor = (attrs.match(/value=["']([^"']*)["']/i) || [])[1] ?? "";
    const precio = (attrs.match(/data-price=["']([^"']*)["']/i) || [])[1];
    const texto = o[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    out.push({ valor, texto, ...(precio !== undefined ? { tarifa: Number(precio) } : {}), seleccionado: /selected/i.test(attrs) });
  }
  return out;
};
const valorInput = (html, id) => (html.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*value=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*id=["']${id}["']`, "i")) || [])[1] ?? null;

/**
 * Lee el formulario con la sesión iniciada. Devuelve lo que hace falta para el POST y para comparar con el repo:
 * { negocio, recojo: { id_recojo, recojo, opciones }, turnos, tipos_pedido, tipos_pago, distritos: [{valor, texto, tarifa}],
 *   diferencias: [cambios frente a DISTRITOS del repo] }
 */
export async function formulario(env, cookie) {
  const r = await pedir(env, "pedido/nuevo", { cookie });
  if (/Iniciar sesi[oó]n/i.test(r.texto) && /id=["']loginUser["']/.test(r.texto)) throw new Error("la sesión de Dinsides no quedó iniciada (el formulario devolvió la pantalla de login)");
  const html = r.texto;
  const distritos = opciones(html, "id_distrito") || [];
  const recojoOpc = opciones(html, "selectRecojo") || [];
  const trecojoOpc = opciones(html, "trecojo");
  const elegirRecojo = (lista) => lista.find((o) => o.valor && /domicilio|recoj/i.test(o.texto)) || lista.find((o) => o.valor && o.valor !== "0") || null;
  const negocio = (html.match(/class=["'][^"']*addPedidos[^"']*["'][^>]*data-idn=["']([^"']*)["']/i) || html.match(/data-idn=["']([^"']*)["'][^>]*addPedidos/i) || [])[1] ?? null;
  const turnos = opciones(html, "tTurno") || [];
  const diferencias = [];
  const codigos = new Map(Object.entries(DISTRITOS).map(([k, [codigo, tarifa]]) => [codigo, { clave: k, tarifa }]));
  for (const o of distritos) {
    if (!o.valor || o.valor === "0") continue;
    const mio = codigos.get(o.valor);
    if (!mio) diferencias.push(`nuevo en Dinsides: ${o.texto} (${o.valor}${o.tarifa !== undefined ? `, S/${o.tarifa}` : ""})`);
    else if (o.tarifa !== undefined && Number(o.tarifa) !== mio.tarifa) diferencias.push(`tarifa de ${o.texto}: Dinsides S/${o.tarifa}, repo S/${mio.tarifa}`);
    codigos.delete(o.valor);
  }
  for (const [codigo, { clave }] of codigos) diferencias.push(`ya no está en Dinsides: ${clave} (${codigo})`);
  return {
    negocio,
    recojo: {
      id_recojo: env.DINSIDES_RECOJO_ID || elegirRecojo(recojoOpc)?.valor || "",
      recojo: env.DINSIDES_RECOJO || (trecojoOpc ? elegirRecojo(trecojoOpc)?.valor : valorInput(html, "trecojo")) || "",
      opciones: recojoOpc, opciones_trecojo: trecojoOpc
    },
    turno: env.DINSIDES_TURNO || turnos.find((o) => o.seleccionado)?.valor || "",
    turnos, tipos_pedido: opciones(html, "tipo_pedido") || [], tipos_pago: opciones(html, "tipo_pago") || [],
    distritos: distritos.filter((o) => o.valor && o.valor !== "0"), diferencias
  };
}

/** POST pedido/registro. Devuelve { ok, respuesta, status }. 1 = registrado. */
export async function registrar(env, cookie, payload) {
  const r = await pedir(env, "pedido/registro", { method: "POST", cookie, ajax: true, cuerpo: codificarFormulario(payload) });
  let respuesta = null;
  try { respuesta = JSON.parse(r.texto); } catch { respuesta = r.texto.slice(0, 300); }
  const ok = r.status < 400 && (respuesta === 1 || respuesta === "1");
  let detalle = "";
  if (respuesta === 2 || respuesta === "2") detalle = "Dinsides respondió 2: error al guardar (revisar los datos)";
  else if (respuesta === 4 || respuesta === "4") detalle = "Dinsides respondió 4: falta indicar si el producto se puede revisar";
  else if (!ok) detalle = `Dinsides respondió http ${r.status}: ${typeof respuesta === "string" ? respuesta : JSON.stringify(respuesta)}`;
  return { ok, respuesta, status: r.status, detalle };
}

/**
 * Historial de pedidos del negocio (la tabla «Listado de pedidos Lima»): POST pedido/getlistadoCliente.
 * Devuelve [{ id_pedido, nombre_destinataio, telefono_destinatario, nombre_distrito, fecha_pedido, fecha_entrega, seguimiento
 * (REGISTRADO · ENTREGADO · ANULADO- … · RECHAZADO …), monto_cobrar, costo_service, detalle, observaciones, tipo_pedido }].
 * `desde`/`hasta` (AAAA-MM-DD) filtran por fecha en Dinsides; sin fechas trae todo el historial (≈350 filas en 3 meses).
 */
export async function listado(env, cookie, { desde = "", hasta = "", estado = "" } = {}) {
  const r = await pedir(env, "pedido/getlistadoCliente", { method: "POST", cookie, ajax: true,
    cuerpo: codificarFormulario({ draw: 1, start: 0, length: 5000, selectEstado: estado, searchDateIni: desde, searchDateFin: hasta }) });
  let datos;
  try { datos = JSON.parse(r.texto); } catch { throw new Error(`Dinsides no devolvió el listado (http ${r.status})`); }
  const filas = Array.isArray(datos) ? datos : datos?.data || [];
  return filas.map((f) => ({
    id_pedido: String(f.id_pedido || ""), nombre: String(f.nombre_destinataio || "").trim(), telefono: String(f.telefono_destinatario || "").replace(/\D/g, "").slice(-9),
    distrito: String(f.nombre_distrito || "").trim(), fecha_pedido: String(f.fecha_pedido || ""), fecha_entrega: String(f.fecha_entrega || f.fecha_entrega2 || "").slice(0, 10),
    seguimiento: String(f.seguimiento || "").trim(), tipo_pedido: String(f.tipo_pedido || ""), monto_cobrar: String(f.monto_cobrar || ""), costo_service: String(f.costo_service || ""),
    detalle: String(f.detalle || ""), observaciones: String(f.observaciones || ""), estado_devolucion: f.estado_devolucion || null
  }));
}

/** Pedidos de hoy aún no enviados (POST Pedido/getpedido_hoy): los únicos que el cliente puede anular desde su panel. */
export async function pedidosHoy(env, cookie) {
  const r = await pedir(env, "Pedido/getpedido_hoy", { method: "POST", cookie, ajax: true, cuerpo: "" });
  try { return JSON.parse(r.texto); } catch { throw new Error(`Dinsides no devolvió los pedidos de hoy (http ${r.status})`); }
}

/** Anula pedidos (POST pedido/anular_ped_client { datos: [ids] }), lo mismo que el botón «Anular» de «Paquete no enviado». */
export async function anular(env, cookie, ids) {
  const lista = (Array.isArray(ids) ? ids : [ids]).map((x) => String(x).replace(/\D/g, "")).filter(Boolean);
  if (!lista.length) throw new Error("Falta el id del pedido a anular");
  const r = await pedir(env, "pedido/anular_ped_client", { method: "POST", cookie, ajax: true, cuerpo: codificarFormulario({ datos: lista }) });
  let respuesta = null;
  try { respuesta = JSON.parse(r.texto); } catch { respuesta = r.texto.slice(0, 200); }
  return { ok: r.status < 400, status: r.status, respuesta, ids: lista };
}

/** Clasifica el `seguimiento` de Dinsides. */
export function claseSeguimiento(seguimiento) {
  const s = String(seguimiento || "").toUpperCase();
  if (/ENTREGADO/.test(s)) return "entregado";
  if (/ANULADO/.test(s)) return "anulado";
  if (/RECHAZ|DEVUEL/.test(s)) return "rechazado";
  if (/REGISTRADO|ASIGNADO|RUTA|CAMINO|REPROGRAM|REAGEND/.test(s)) return "pendiente";
  return s ? "otro" : "pendiente";
}
