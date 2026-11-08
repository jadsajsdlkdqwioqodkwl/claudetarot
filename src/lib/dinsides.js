/**
 * Dinsides Courier (Lima) — lo que hace falta para convertir un pedido del CRM en una fila del formulario
 * https://dinsidescourier.com/pedido/nuevo, sin inventar nada:
 *
 *   - DISTRITOS / ALIAS / buscarDistrito(texto): el desplegable #id_distrito (código y tarifa) tal como lo tenía el
 *     Project de Claude que usaba la asesora (snapshot 2026-11-08; `probar` del Worker lo compara con el formulario real).
 *   - distritosEnTexto(direccion): qué distritos nombra una dirección (para deducirlo; si nombra dos, no se adivina).
 *   - limpiarCoordenadas(texto) / coordenadasDeUbicacion(body): lat,lng de un link de Maps o del pin de WhatsApp.
 *   - zonaDe(lat, lng): en qué polígono del mapa de cobertura de Dinsides cae el pin (distrito / zona roja / punto de encuentro).
 *   - fechaEntrega(): regla del dueño (2026-11-08): lo registrado «hoy» sale MAÑANA aunque se registre a la 1 de la
 *     mañana; si el cliente pidió otra fecha, esa manda (y nunca una fecha pasada).
 *   - armarPedido(pedido, ctx): la ficha completa con `campos` (lo que va al formulario), `alertas` (se registra igual pero
 *     se avisa) y `bloqueos` (NO se registra solo: dirección o distrito dudosos, zona roja, teléfono inválido… lo ve una persona).
 *   - scriptConsola(fichas): el mismo script de consola de siempre (F12 → Consola), por si alguien lo quiere pegar a mano.
 *   - payloadRegistro(fichas, formulario): los arreglos que el botón «Guardar» de la página manda a pedido/registro.
 *
 * Sin dependencias ni red: lo usan el Worker (src/api/asesor-dinsides.js) y las pruebas (scripts/test-dinsides.mjs).
 */
import cobertura from "./dinsides-cobertura.js";

// clave normalizada → [código del <option>, tarifa S/ (data-price)]
export const DISTRITOS = {
  "ancon": ["150102", 17], "ate": ["103111", 12], "barranco": ["150104", 10],
  "bellavista": ["070102", 12], "brena": ["150105", 8], "cajamarquilla": ["150191", 21],
  "callao": ["070101", 12], "carabayllo": ["150106", 12],
  "carmen de la legua reynoso": ["070103", 12], "cercado de lima": ["150101", 10],
  "chaclacayo": ["011158", 17], "chorrillos": ["150108", 12], "chosica": ["595959", 22],
  "cieneguilla": ["121213", 17], "comas": ["150110", 12], "el agustino": ["150111", 10],
  "el marquez - callao": ["999997", 12], "envio agencia marvisur": ["150150", 5],
  "envio agencia olva courier": ["555555", 5], "envio agencia shalom": ["150151", 5],
  "huachipa": ["011154", 14], "huaycan": ["166555", 12], "independencia": ["150112", 12],
  "jesus maria": ["150113", 10], "jicamarca - anexo 22": ["444444", 14],
  "jicamarca - anexo 8": ["444448", 21], "la molina": ["150114", 10],
  "la perla": ["070104", 12], "la punta": ["070105", 12], "la victoria": ["150115", 10],
  "lince": ["150116", 10], "los olivos": ["150117", 12],
  "lurigancho - chosica": ["150118", 14], "lurin": ["222222", 14],
  "magdalena del mar": ["150120", 10], "manchay": ["151515", 17],
  "mi peru": ["070107", 12], "miraflores": ["150122", 10], "pachacamac": ["161616", 19],
  "pucusana": ["150144", 28], "pueblo libre": ["150121", 10],
  "puente piedra": ["150125", 12], "punta hermosa": ["333333", 17],
  "punta negra": ["777777", 21],
  "retiro sede cercado (av arica 1702)": ["696969", 8],
  "retiro sede gamarra (antonio bazo 1284)": ["100200", 8],
  "ricardo palma": ["150146", 25], "rimac": ["150128", 10],
  "salamanca ate": ["999966", 10], "san bartolo": ["121212", 22],
  "san borja": ["150130", 10], "san isidro": ["150131", 10],
  "san juan de lurigancho": ["150132", 10], "san juan de miraflores": ["150133", 12],
  "san luis": ["150134", 10], "san martin de porres": ["150135", 12],
  "san miguel": ["150136", 10], "santa anita": ["150137", 10],
  "santa clara - ate": ["999998", 12], "santa eulalia": ["150147", 25],
  "santa maria del mar": ["150148", 25], "santa rosa": ["055415", 17],
  "santiago de surco": ["150140", 10], "surquillo": ["150141", 10],
  "ventanilla": ["070106", 12], "villa el salvador": ["150142", 12],
  "villa maria del triunfo": ["150143", 12]
};

export const ALIAS = {
  "surco": "santiago de surco", "smp": "san martin de porres",
  "sjl": "san juan de lurigancho", "sjm": "san juan de miraflores",
  "ves": "villa el salvador", "vmt": "villa maria del triunfo",
  "vitarte": "ate", "lurigancho": "lurigancho - chosica",
  "magdalena": "magdalena del mar", "cercado": "cercado de lima",
  "lima cercado": "cercado de lima", "cercado lima": "cercado de lima",
  "carmen de la legua": "carmen de la legua reynoso",
  "callao cercado": "callao", "marquez": "el marquez - callao",
  "el marquez": "el marquez - callao", "salamanca": "salamanca ate",
  "santa clara": "santa clara - ate", "jicamarca": "jicamarca - anexo 22",
  "anexo 22": "jicamarca - anexo 22", "jicamarca anexo 22": "jicamarca - anexo 22",
  "anexo 8": "jicamarca - anexo 8", "jicamarca anexo 8": "jicamarca - anexo 8",
  "olva": "envio agencia olva courier", "olva courier": "envio agencia olva courier",
  "shalom": "envio agencia shalom", "marvisur": "envio agencia marvisur",
  "agencia olva": "envio agencia olva courier", "agencia shalom": "envio agencia shalom",
  "agencia marvisur": "envio agencia marvisur",
  "gamarra": "retiro sede gamarra (antonio bazo 1284)",
  "retiro gamarra": "retiro sede gamarra (antonio bazo 1284)",
  "retiro sede gamarra": "retiro sede gamarra (antonio bazo 1284)",
  "arica": "retiro sede cercado (av arica 1702)",
  "retiro cercado": "retiro sede cercado (av arica 1702)",
  "retiro sede cercado": "retiro sede cercado (av arica 1702)",
  "la molina vieja": "la molina", "surco viejo": "santiago de surco",
  "san martin": "san martin de porres", "villa maria": "villa maria del triunfo", "villa salvador": "villa el salvador",
  "san juan lurigancho": "san juan de lurigancho", "san juan miraflores": "san juan de miraflores"
};

// Palabras que nombran varios distritos a la vez: con ellas solas no se deduce nada (regla del dueño: no asumir el distrito).
const AMBIGUOS = {
  "san juan": ["san juan de lurigancho", "san juan de miraflores"],
  "lima": [], "lima norte": [], "lima sur": [], "lima este": [], "cono norte": [], "cono sur": [],
  "callao": ["callao", "bellavista", "la perla", "la punta", "carmen de la legua reynoso", "ventanilla", "mi peru", "el marquez - callao"]
};

export const TIPOS_PAGO = ["NO COBRAR", "EFECTIVO", "PLIN", "YAPE", "POS"];
export const PRECIO_KITS = { 1: 89, 2: 149, 3: 199 };
export const PRODUCTO = "Kit Tarot de aprendizaje";
export const MEDIDAS_ESTANDAR = "30cmx15cmx20cm 1.5kg"; // tpaquete = 1 en el formulario
const LIMA_MS = 5 * 3600 * 1000;

export function normalizar(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[“”"'’`]/g, "").replace(/\s*-\s*/g, " - ").replace(/[^a-z0-9()./ -]+/g, " ").replace(/\s+/g, " ").trim();
}

/** El distrito del desplegable para un nombre («Surco», «SJL», «Santiago de Surco»): { clave, codigo, tarifa } o null. */
export function buscarDistrito(nombre) {
  let k = normalizar(nombre);
  if (!k) return null;
  k = ALIAS[k] || k;
  const d = DISTRITOS[k];
  return d ? { clave: k, codigo: d[0], tarifa: d[1] } : null;
}

export function distritoPorCodigo(codigo) {
  const k = Object.keys(DISTRITOS).find((x) => DISTRITOS[x][0] === String(codigo));
  return k ? { clave: k, codigo: DISTRITOS[k][0], tarifa: DISTRITOS[k][1] } : null;
}

/**
 * Qué distritos del desplegable nombra un texto (dirección). Devuelve claves distintas, la más larga primero.
 * «San Juan» o «Lima» a secas no deciden nada: salen en `ambiguos`.
 */
export function distritosEnTexto(texto) {
  const t = ` ${normalizar(texto).replace(/[(),./]/g, " ").replace(/\s+/g, " ")} `;
  const hallados = [];
  const nombres = [...Object.keys(DISTRITOS), ...Object.keys(ALIAS)].sort((a, b) => b.length - a.length);
  for (const n of nombres) {
    if (/^(retiro|envio agencia|olva|shalom|marvisur|agencia|arica|gamarra)/.test(n)) continue; // retiros y agencias no son direcciones
    const nn = n.replace(/[(),./]/g, " ").replace(/\s+/g, " ").trim();
    if (nn.length < 3) continue;
    const i = t.indexOf(` ${nn} `);
    if (i < 0) continue;
    const clave = ALIAS[n] || n;
    if (!DISTRITOS[clave]) continue;
    // «el agustino» ya cubre «agustino»; no contar dos veces un nombre contenido en otro ya hallado.
    if (hallados.some((h) => h.texto.includes(nn))) continue;
    hallados.push({ clave, texto: nn, pos: i });
  }
  const ambiguos = Object.keys(AMBIGUOS).filter((a) => t.includes(` ${a} `) && !hallados.some((h) => h.texto.includes(a) || AMBIGUOS[a].includes(h.clave)));
  return { distritos: [...new Set(hallados.map((h) => h.clave))], ambiguos };
}

/**
 * lat,lng (texto) de lo que haya en `texto`: link de Maps (!3d!4d, ?q=, ll=, @lat,lng) o «-12.1,-77.0».
 * Devuelve { lat, lng, texto: "lat,lng", aviso? } o null. Links cortos (maps.app.goo.gl) no se resuelven: null.
 */
export function limpiarCoordenadas(entrada) {
  let t = String(entrada || "");
  for (let i = 0; i < 2; i++) { try { t = decodeURIComponent(t); } catch { break; } }
  const m = t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/)
    || t.match(/[?&](?:q|ll|daddr|destination|sll|query)=\s*(-?\d{1,2}\.\d+)[\s,]+(-?\d{1,3}\.\d+)/)
    || t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
    || t.match(/(-?\d{1,2}\.\d{4,})[\s,;|]+(-?\d{1,3}\.\d{4,})/);
  if (!m) return null;
  let lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  let aviso = null;
  if (lat > 0 && lng > 0) { lat = -lat; lng = -lng; aviso = "las coordenadas venían con signo positivo; se corrigieron a Lima (negativas)"; }
  if (Math.abs(lat) > 20 && Math.abs(lng) <= 20) { [lat, lng] = [lng, lat]; aviso = "lat y lng venían invertidas; se corrigieron"; }
  if (lat < -12.9 || lat > -11.4 || lng < -77.4 || lng > -76.4) aviso = "fuera de Lima/Callao";
  return { lat, lng, texto: `${lat},${lng}`, lat_lng: `${lat},${lng}`, aviso };
}

/** El pin de WhatsApp tal como lo guarda el CRM (webhook): "lat|lng|nombre|dirección". */
export function coordenadasDeUbicacion(body) {
  const partes = String(body || "").split("|");
  const lat = parseFloat(partes[0]), lng = parseFloat(partes[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, texto: `${lat},${lng}`, lat_lng: `${lat},${lng}`, nombre: partes[2] || "", direccion: partes[3] || "", aviso: null };
}

function dentro(anillo, lat, lng) {
  let dentroDe = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [yi, xi] = anillo[i], [yj, xj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentroDe = !dentroDe;
  }
  return dentroDe;
}

/**
 * En qué zona del mapa de Dinsides cae un punto:
 *  { clase: "no_entrega"|"punto_encuentro"|"entrega"|"fuera", nombre, nota, distrito?, codigo?, poligonos: [nombres] }
 * Si el pin cae en una zona roja y a la vez en el polígono de un distrito, manda la zona roja (no se reparte ahí).
 */
export function zonaDe(lat, lng) {
  const golpes = cobertura.poligonos.filter((p) => dentro(p.anillo, lat, lng));
  const prioridad = { no_entrega: 0, punto_encuentro: 1, entrega: 2 };
  golpes.sort((a, b) => prioridad[a.clase] - prioridad[b.clase]);
  const g = golpes[0];
  if (!g) return { clase: "fuera", nombre: "fuera del mapa de cobertura", nota: null, poligonos: [] };
  const out = { clase: g.clase, nombre: g.nombre, nota: g.nota || null, poligonos: golpes.map((x) => x.nombre) };
  const distritoClave = g.distrito || golpes.find((x) => x.clase === "entrega" && x.distrito)?.distrito || null;
  if (distritoClave && DISTRITOS[distritoClave]) { out.distrito = distritoClave; out.codigo = DISTRITOS[distritoClave][0]; }
  const cerca = cobertura.puntos
    .filter((p) => /punto|encuentro/i.test(p.nombre))
    .map((p) => ({ ...p, km: Math.hypot((p.lat - lat) * 111, (p.lng - lng) * 108) }))
    .filter((p) => p.km < 1.5).sort((a, b) => a.km - b.km).slice(0, 2);
  if (cerca.length) out.puntos_cerca = cerca.map((p) => `${p.nombre}${p.nota ? ` (${p.nota})` : ""} a ${p.km.toFixed(1)} km`);
  return out;
}

export const hoyLima = (ahora = Date.now()) => new Date(ahora - LIMA_MS).toISOString().slice(0, 10);
const sumarDias = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * Fecha de entrega (AAAA-MM-DD) según el dueño (2026-11-08): lo registrado en la noche sale MAÑANA, aunque se registre
 * después de medianoche (hasta las 03:00 sigue siendo «la noche de ayer», como el reporte). Si el cliente pidió otra
 * fecha (`fecha_pedida`), esa manda; una fecha ya pasada se devuelve con `aviso` para que lo mire una persona.
 */
export function fechaEntrega({ ahora = Date.now(), fecha_pedida = "", fecha_objetivo = "" } = {}) {
  const t = new Date(ahora - LIMA_MS);
  const hoy = t.toISOString().slice(0, 10);
  const base = fecha_objetivo || (t.getUTCHours() < 3 ? hoy : sumarDias(hoy, 1));
  const pedida = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha_pedida || "")) ? fecha_pedida : "";
  if (pedida && pedida < hoy) return { fecha: base, aviso: `pedía entrega el ${pedida}, que ya pasó: se puso ${base}; confirmar con el cliente` };
  if (pedida && pedida !== base) return { fecha: pedida, aviso: pedida > base ? `entrega para otro día (${pedida}), no mañana` : null };
  return { fecha: base, aviso: null };
}

const LINK_RE = /https?:\/\/\S+|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+/gi;
const SIN_EMOJI = (s) => String(s || "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

export function limpiarDireccion(texto) {
  let d = SIN_EMOJI(String(texto || "").replace(LINK_RE, " "));
  d = d.replace(/-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, " "); // coordenadas sueltas
  d = d.replace(/\b(mz|mza|manzana)\.?\s*/gi, "Mz ").replace(/\b(lt|lte|lote)\.?\s*/gi, "Lt ").replace(/\bav\.?\s+/gi, "Av ")
    .replace(/\bjr\.?\s+/gi, "Jr ").replace(/\bjir[oó]n\s+/gi, "Jr ").replace(/\bpsje\.?\s+/gi, "Pasaje ").replace(/\burb\.?\s+/gi, "Urb ")
    .replace(/\bdpto\.?\s*/gi, "Dpto ").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
  return d.replace(/^[,.\s-]+|[,\s-]+$/g, "");
}

function telefonoValido(...fuentes) {
  for (const f of fuentes) {
    const d = String(f || "").replace(/\D/g, "");
    const n = d.length > 9 ? d.slice(-9) : d;
    if (/^9\d{8}$/.test(n)) return n;
  }
  return null;
}

/**
 * La ficha de Dinsides a partir de un pedido del sistema (registro del reporte / hoja «Pedidos auto» / lo que la Routine leyó):
 *   pedido = { nombre, whatsapp, telefono?, direccion_o_agencia, direccion?, distrito?, coordenadas?, ubicacion? (pin "lat|lng|..."),
 *              kits, empaque, pago, nota, fecha_entrega?, cobrar?, tipo_pago?, revisar_paquete?, estado?, destino? }
 *   ctx    = { fecha_objetivo, ahora? }
 * Devuelve { campos, alertas, bloqueos, listo, distrito_fuentes, zona, telefono_crm }.
 * `bloqueos` = lo que una persona tiene que resolver antes de registrar (dirección y distrito, sobre todo: es lo que más falla).
 */
export function armarPedido(pedido, ctx = {}) {
  const p = pedido || {};
  const alertas = [], bloqueos = [];
  const telefono = telefonoValido(p.telefono, p.whatsapp);
  if (!telefono) bloqueos.push(`TELÉFONO: «${p.telefono || p.whatsapp || ""}» no es un celular de 9 dígitos que empiece en 9`);

  const nombre = SIN_EMOJI(p.nombre).replace(/\((perfil|chat)[^)]*\)/gi, "").replace(/\s+/g, " ").trim() || "CLIENTE";
  if (nombre === "CLIENTE" || /^\(/.test(String(p.nombre || ""))) alertas.push("NOMBRE: el chat no trae nombre; va «CLIENTE» (o el que puso la asesora)");

  // Coordenadas: lo que diga el pedido, el pin de WhatsApp o un link dentro de la dirección.
  const textoDir = String(p.direccion || p.direccion_o_agencia || "");
  let coords = p.coordenadas ? limpiarCoordenadas(p.coordenadas) : null;
  if (!coords && p.ubicacion) coords = coordenadasDeUbicacion(p.ubicacion) || limpiarCoordenadas(p.ubicacion);
  if (!coords && textoDir) coords = limpiarCoordenadas(textoDir);
  if (coords?.aviso) alertas.push(`COORDENADAS: ${coords.aviso}`);
  if (!coords && /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(textoDir)) alertas.push("COORDENADAS: el link de Maps es corto y no trae lat,lng; va sin coordenadas (la dirección alcanza)");

  // Dirección en texto (obligatoria en Dinsides). Solo pin → lo escribe una persona.
  let direccion = limpiarDireccion(textoDir);
  // «(mandó su ubicación)», «solo pin», «ubicación»: el reporte lo anota así cuando no hubo dirección en texto. No es una dirección.
  if (direccion && !/\d/.test(direccion) && /ubicaci|\bpin\b|localizaci|coordenad/i.test(direccion)) direccion = "";
  if (!direccion && coords?.direccion) { direccion = limpiarDireccion(coords.direccion); alertas.push("DIRECCIÓN: tomada del pin de WhatsApp; verificar"); }
  if (!direccion) bloqueos.push(coords
    ? `DIRECCIÓN: el cliente solo mandó su ubicación (${coords.lat_lng}); escribir la dirección en texto: https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
    : "DIRECCIÓN: no hay dirección en texto ni ubicación");
  else if (direccion.length < 12 || !/\d/.test(direccion)) alertas.push("DIRECCIÓN: corta o sin número; revisar que el motorizado pueda ubicarla");

  // Distrito: (1) el que dijo la persona o la Routine, (2) el que nombra la dirección, (3) el polígono donde cae el pin.
  const fuentes = {};
  const dicho = p.distrito ? buscarDistrito(p.distrito) : null;
  if (p.distrito && !dicho) bloqueos.push(`DISTRITO: «${p.distrito}» no está en el desplegable de Dinsides`);
  if (dicho) fuentes.dicho = dicho.clave;
  const enTexto = distritosEnTexto(textoDir);
  if (enTexto.distritos.length) fuentes.texto = enTexto.distritos;
  const zona = coords ? zonaDe(coords.lat, coords.lng) : null;
  if (zona?.distrito) fuentes.pin = zona.distrito;
  let distrito = null;
  if (dicho) {
    distrito = dicho;
    if (zona?.distrito && zona.distrito !== dicho.clave) alertas.push(`DISTRITO: se puso «${dicho.clave}» pero el pin cae en «${zona.distrito}» según el mapa de Dinsides`);
  } else if (zona?.distrito && zona.clase === "entrega") {
    // Regla del dueño (2026-11-08): el distrito que vale es el del MAPA DE COBERTURA de Dinsides (donde cae el pin); si el
    // texto dice otro, Dinsides rechaza el pedido. Se usa el del mapa y se avisa la diferencia.
    distrito = buscarDistrito(zona.distrito);
    if (enTexto.distritos.length && !enTexto.distritos.includes(zona.distrito)) {
      alertas.push(`DISTRITO: la dirección dice «${enTexto.distritos.join("/")}» pero el pin cae en «${zona.distrito}» en el mapa de Dinsides: va el del mapa`);
    } else if (!enTexto.distritos.length) alertas.push(`DISTRITO: deducido del pin (${zona.nombre}); la dirección no lo nombra`);
  } else if (enTexto.distritos.length === 1) {
    distrito = buscarDistrito(enTexto.distritos[0]);
  } else if (enTexto.distritos.length > 1) {
    bloqueos.push(`DISTRITO: la dirección nombra varios (${enTexto.distritos.join(", ")}); elegir uno`);
  } else if (zona?.distrito) {
    distrito = buscarDistrito(zona.distrito);
    alertas.push(`DISTRITO: deducido del pin (${zona.nombre}); la dirección no lo nombra`);
  } else if (enTexto.ambiguos.length) {
    bloqueos.push(`DISTRITO: «${enTexto.ambiguos.join(", ")}» no alcanza para elegir el distrito; preguntar o mirar la cobertura`);
  } else if (direccion) {
    bloqueos.push("DISTRITO: no se deduce de la dirección (y no hay pin); confirmarlo");
  }
  if (zona && zona.clase === "no_entrega") {
    bloqueos.push(`ZONA ROJA: el pin cae en «${zona.nombre}»${zona.nota ? ` (${zona.nota})` : ""}: Dinsides no reparte ahí; coordinar punto de encuentro o confirmar`
      + (zona.puntos_cerca ? `. Puntos de encuentro cerca: ${zona.puntos_cerca.join("; ")}` : ""));
  } else if (zona && zona.clase === "punto_encuentro") {
    bloqueos.push(`PUNTO DE ENCUENTRO: el pin cae en «${zona.nombre}»${zona.nota ? ` (${zona.nota})` : ""}: la entrega es en el punto, avisar al cliente`);
  } else if (zona && zona.clase === "fuera") {
    alertas.push("PIN fuera del mapa de cobertura de Dinsides (o mapa desactualizado); verificar el distrito");
  }
  if (zona?.nota && zona.clase === "entrega") alertas.push(`MAPA: ${zona.nota}`);

  // Producto, kits y extras (regla del dueño: todo extra va con «+ Extra»; el que empaca solo mira el PDF).
  const kits = Math.max(0, parseInt(p.kits ?? 1, 10) || 0);
  let empaque = SIN_EMOJI(p.empaque);
  // «VERIFICAR, en el chat se le prometió: «…»» lo agrega enviar.py cuando ve una promesa sin confirmar: no es un extra decidido.
  // Se avisa (corto) y no se mete en el producto; si de verdad hay extra, la Routine lo pone en `empaque` con sus palabras.
  if (/^VERIFICAR|en el chat se le prometi/i.test(empaque)) { alertas.push(`EMPAQUE por verificar (enviar.py): ${empaque.slice(0, 160)}…`); empaque = ""; }
  let producto = kits > 1 ? `${PRODUCTO} x${kits}` : PRODUCTO;
  if (kits === 0) producto = empaque || "Reposición / cambio";
  if (empaque) { if (kits !== 0) producto += ` + Extra: ${empaque}`; alertas.push(`EMPAQUE: ${empaque}`); }
  if (kits > 1) alertas.push(`${kits} kits`);

  // Cobro y método de pago.
  const nota = SIN_EMOJI(p.nota);
  const notaL = normalizar(`${p.pago || ""} ${nota}`);
  let tipoPago = TIPOS_PAGO.includes(String(p.tipo_pago || "").toUpperCase()) ? String(p.tipo_pago).toUpperCase() : null;
  if (!tipoPago) {
    // «Ya pagó … NO cobrar» → NO COBRAR. Pero «pagará por Yape; si no, cobrar al recibir» NO es pagado: se cobra.
    const dicePagado = /ya pago\b|ya pagado|pago completo|pago todo|pago el total|pago los \d+|no se cobra|no cobrar(?! al)/.test(notaL);
    const diceQuePagara = /pagara\b|pagaria|va a pagar|al recibir|contraentrega|cuando reciba|si no,? cobrar/.test(notaL);
    if (dicePagado && !diceQuePagara) tipoPago = "NO COBRAR";
    else if (/tarjeta|\bpos\b/.test(notaL)) tipoPago = "POS";
    else if (/efectivo|cash|billete/.test(notaL)) tipoPago = "EFECTIVO";
    else if (/\bplin\b/.test(notaL) && !/\byape\b/.test(notaL)) tipoPago = "PLIN";
    else tipoPago = "YAPE";
  }
  let cobrar = p.cobrar !== undefined && p.cobrar !== null && p.cobrar !== "" ? Number(String(p.cobrar).replace(/[^\d.]/g, "")) : null;
  if (cobrar === null) {
    if (p.tipo === "CAMBIO" || p.tipo === "REPOSICION" || kits === 0) cobrar = 0;
    else cobrar = PRECIO_KITS[kits] || kits * PRECIO_KITS[1];
  }
  if (tipoPago === "NO COBRAR") { if (cobrar) alertas.push(`NO COBRAR: la nota dice que ya pagó; S/${cobrar} pasa a 0`); cobrar = 0; }
  if (cobrar === 0 && tipoPago !== "NO COBRAR") tipoPago = "NO COBRAR";
  if (/descuento|rebaja|precio especial|promo/.test(notaL) && cobrar === (PRECIO_KITS[kits] || 0)) alertas.push("MONTO: la nota habla de descuento/promo y va el precio normal; confirmar cuánto se cobra");
  if (tipoPago !== "YAPE" && tipoPago !== "NO COBRAR") alertas.push(`PAGO: ${tipoPago}`);
  if (cobrar && cobrar !== (PRECIO_KITS[kits] || 0)) alertas.push(`MONTO distinto al de lista: S/${cobrar}`);
  const tipoPedido = tipoPago === "NO COBRAR" ? "SOLO-ENTREGA-NO-COBRAR" : "CONTRAENTREGA";

  const fe = fechaEntrega({ ahora: ctx.ahora, fecha_pedida: p.fecha_entrega, fecha_objetivo: ctx.fecha_objetivo });
  if (fe.aviso) alertas.push(`FECHA: ${fe.aviso}`);
  if (/^(POR_VERIFICAR|POR_CONFIRMAR|INTENCION|DESCARTADO)$/.test(String(p.estado || ""))) bloqueos.push(`ESTADO ${p.estado}: el reporte no lo da por confirmado${p.nota ? ` («${nota.slice(0, 90)}»)` : ""}`);
  if (String(p.destino || "").toUpperCase() === "PROVINCIA") bloqueos.push("DESTINO PROVINCIA: no va por Dinsides");
  if (/^\s*🚨/.test(String(p.nota || "")) || /urgente|reclamo/.test(notaL)) alertas.push("NOTA con 🚨: leerla antes de registrar");

  const obs = [nota, kits > 1 || empaque ? `Paquete: ${producto}` : ""].filter(Boolean).join(". ").slice(0, 480);
  const campos = {
    tipo_pedido: tipoPedido, nombre, telefono: telefono || "", fecha_entrega: fe.fecha,
    id_distrito: distrito?.codigo || "", distrito: distrito?.clave || "", direccion, coordenadas: coords?.lat_lng || "",
    tpaquete: "1", medidas: MEDIDAS_ESTANDAR, producto, revisar_paquete: String(p.revisar_paquete ?? "1") === "0" ? "0" : "1",
    cobrar: String(cobrar), monto_service: String(distrito?.tarifa ?? ""), tipo_pago: tipoPago, obs
  };
  return { campos, alertas, bloqueos, listo: bloqueos.length === 0, distrito_fuentes: fuentes, zona, whatsapp: String(p.whatsapp || "") };
}

/** Texto corto de una ficha (para Telegram y la respuesta de la Routine). */
export function resumenFicha(f) {
  const c = f.campos;
  const l1 = `${c.nombre} · ${c.telefono || "sin tel"} · ${c.distrito || "SIN DISTRITO"} · ${c.fecha_entrega}`;
  const l2 = `${c.direccion || "(sin dirección)"}${c.coordenadas ? ` · ${c.coordenadas}` : ""}`;
  const l3 = `${c.producto} · S/${c.cobrar} ${c.tipo_pago}${c.obs ? ` · ${c.obs.slice(0, 120)}` : ""}`;
  const extra = [...f.bloqueos.map((b) => `⛔ ${b}`), ...f.alertas.map((a) => `· ${a}`)];
  return [l1, l2, l3, ...extra].join("\n");
}

const js = (v) => JSON.stringify(String(v ?? ""));

/**
 * Script para la consola del navegador (F12) en https://dinsidescourier.com/pedido/nuevo: llena el formulario con cada
 * ficha y la agrega al listado (botón «Agregar pedido al listado»), de a una, y se detiene antes de «Guardar»: la persona
 * elige cómo traslada los pedidos, acepta los términos y guarda. Es el mismo camino que usaba el Project de Claude.
 */
export function scriptConsola(fichas) {
  const filas = fichas.map((f) => f.campos);
  return [
    "(async()=>{const F=" + JSON.stringify(filas) + ";",
    "const d=(ms)=>new Promise(r=>setTimeout(r,ms));const set=(s,v)=>$(s).val(v).trigger('input').trigger('change');",
    "for(const [i,c] of F.entries()){",
    "$('#tipo_pedido').val(c.tipo_pedido).trigger('change');await d(150);",
    "set('#nombreD',c.nombre);set('#tlfD',c.telefono);set('#direccionD',c.direccion);set('#coordenadasD',c.coordenadas);",
    "set('#productoD',c.producto);$('#fechaD').val(c.fecha_entrega).trigger('change');$('#id_distrito').val(c.id_distrito).trigger('change');await d(250);",
    "$(\"input[name='tpaquete'][value='1']\").prop('checked',true).trigger('click').trigger('change');$('#calculadora_client1').prop('checked',true).trigger('click');await d(150);",
    "$(\"input[name='revisar_paquete'][value='\"+c.revisar_paquete+\"']\").prop('checked',true).trigger('change');",
    "set('#cobrarD',c.cobrar);$('#tipo_pago').val(c.tipo_pago).trigger('change');set('#obsD',c.obs);await d(150);",
    "if($('#id_distrito').val()!==c.id_distrito){console.error('Fila '+(i+1)+' ('+c.nombre+'): el distrito no se aplicó, elígelo a mano y agrega al listado');break;}",
    "if(!$('#monto_service').val()){$('#monto_service').val(c.monto_service);}",
    "$('.add-row').trigger('click');await d(400);console.log('Fila '+(i+1)+' agregada: '+c.nombre+' · '+c.distrito+' · '+c.fecha_entrega);}",
    "console.log('Listo: revisa el listado, elige el traslado (recojo en domicilio), acepta los términos y pulsa Guardar.');})();"
  ].join("");
}

/**
 * Los arreglos que la página manda a POST pedido/registro al pulsar «Guardar» (mismo orden y nombres que pedido.js):
 * `formulario` = lo que el Worker leyó de la página con la sesión iniciada: { negocio, id_recojo, recojo, turno }.
 */
export function payloadRegistro(fichas, formulario = {}) {
  const f = fichas.map((x) => x.campos);
  const campo = (k) => f.map((c) => c[k]);
  return {
    id_recojo: formulario.id_recojo ?? "", recojo: formulario.recojo ?? "", negocio: formulario.negocio ?? "",
    nombres: campo("nombre"), tlfs: campo("telefono"), direcciones: campo("direccion"), productos: campo("producto"),
    id_distritos: campo("id_distrito"), cobrars: campo("cobrar"), monto_services: campo("monto_service"), observs: campo("obs"),
    tipo_paquetes: campo("tpaquete"), fechas_entrega: campo("fecha_entrega"), coordenadas: campo("coordenadas"),
    tipo_pedidos: campo("tipo_pedido"), cobro_env: [], metodo_pago: campo("tipo_pago"), revisar: campo("revisar_paquete"),
    medidas: campo("medidas"), medidavs: campo("medidas"), direccionesJson: [], turnos: f.map(() => formulario.turno ?? "")
  };
}

/** application/x-www-form-urlencoded como lo hace jQuery (`nombres[]=a&nombres[]=b`). */
export function codificarFormulario(obj) {
  const partes = [];
  const add = (k, v) => partes.push(`${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`);
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => add(`${k}[]`, x));
    else add(k, v);
  }
  return partes.join("&");
}
