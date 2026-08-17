/**
 * Chequeos rápidos sin dependencias ni red: `npm run check`
 *  1. La página trae los ids y atributos que el JS del pedido necesita.
 *  2. La validación del backend acepta pedidos buenos y rechaza los malos.
 *  3. Los precios del HTML coinciden con los del servidor.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

const html = readFileSync(join(root, "public/index.html"), "utf8");
const { VARIANTES, toE164Peru, makeOrderId } = await import(join(root, "src/lib/pedido.js"));
const { validate } = await import(join(root, "src/api/order.js"));

/* 1. Enganches del formulario */
for (const id of ["fName", "fPhone", "fDir", "fSucursal", "fWebsite", "shipCasa", "btnPedido"]) {
  check(`index.html tiene #${id}`, html.includes(`id="${id}"`));
}
check('las variantes llevan data-var="1kit" y "2kit"',
  html.includes('data-var="1kit"') && html.includes('data-var="2kit"'));
check("el formulario llama a /api/order", html.includes("'/api/order'"));
check("los upsells llaman a /api/upsell", html.includes("'/api/upsell'"));

/* 2. Precios sincronizados entre página y servidor */
check("precio de 1 kit (S/ 79) coincide", VARIANTES["1kit"].precio === 79 && html.includes("79.00"));
check("precio de 2 kits (S/ 139) coincide", VARIANTES["2kit"].precio === 139 && html.includes("139.00"));

/* 3. Validación del backend */
check("celular 9 dígitos → E.164", toE164Peru("987 654 321") === "51987654321");
check("celular con +51 se respeta", toE164Peru("+51 987654321") === "51987654321");
check("fijo de 7 dígitos se rechaza", toE164Peru("4451234") === null);
check("código de pedido con formato TK-XXXXXX", /^TK-[A-Z2-9]{6}$/.test(makeOrderId()));

const lima = {
  nombre: "María Fernández", telefono: "987654321",
  envio: "casa", direccion: "Av. Larco 1234, dpto. 502", variante: "2kit"
};
const r1 = validate(lima);
check("pedido de Lima válido pasa", r1.errors.length === 0, r1.errors.join(", "));
check("total de 2 kits = 139", r1.order.total === 139, String(r1.order.total));

const provincia = {
  nombre: "Diego Salas", telefono: "912345678",
  envio: "agencia", agencia: "Shalom - Sede Centro", variante: "1kit"
};
check("pedido de provincia válido pasa", validate(provincia).errors.length === 0);
check("Lima sin dirección se rechaza",
  validate({ ...lima, direccion: "" }).errors.includes("direccion"));
check("provincia sin agencia se rechaza",
  validate({ ...provincia, agencia: "" }).errors.includes("agencia"));
check("variante desconocida cae a 1 kit",
  validate({ ...lima, variante: "99kits" }).order.total === 79);
check("el precio del formulario se ignora",
  validate({ ...lima, precio: 1, total: 1 }).order.total === 139);

/* 4. Meta Pixel: instalado, con todos los eventos y con precios sincronizados */
const { UPSELLS } = await import(join(root, "src/lib/pedido.js"));
const headers = readFileSync(join(root, "public/_headers"), "utf8");

check("el pixel está inicializado", html.includes("fbq('init', '1598655637922566')"));
check("PageView se dispara al cargar", html.includes("fbq('track', 'PageView')"));
for (const evento of ["ViewContent", "AddToCart", "InitiateCheckout"]) {
  check(`la product page dispara ${evento}`, html.includes(`'${evento}'`));
}

// Los precios del pixel viven en el HTML; los de verdad, en el servidor.
const catalogo = html.match(/variantes:\s*\{([^}]*)\}/)?.[1] ?? "";
const bumps = html.match(/bumps:\s*\{([^}]*)\}/)?.[1] ?? "";
for (const [id, { precio }] of Object.entries(VARIANTES)) {
  check(`el pixel cobra S/ ${precio} por ${id}`,
    new RegExp(`'${id}':\\s*${precio}\\b`).test(catalogo), catalogo.trim());
}
for (const [id, { precio }] of Object.entries(UPSELLS)) {
  check(`el pixel cobra S/ ${precio} por el bump ${id}`,
    new RegExp(`${id}:\\s*${precio}\\b`).test(bumps), bumps.trim());
}

// Sin estos orígenes en la CSP el navegador bloquea el pixel entero.
const csp = headers.match(/Content-Security-Policy:.*/)?.[0] ?? "";
check("la CSP permite el script del pixel", csp.includes("https://connect.facebook.net"));
check("la CSP permite el pixel de imagen", /img-src[^;]*https:\/\/www\.facebook\.com/.test(csp));
check("la CSP permite las llamadas del pixel", /connect-src[^;]*https:\/\/www\.facebook\.com/.test(csp));

/* 5. Página de gracias y captura de identificadores para la Conversions API */
const gracias = readFileSync(join(root, "public/gracias.html"), "utf8");
const { COLUMNAS } = await import(join(root, "src/lib/hoja.js"));
const { filaDePedido } = await import(join(root, "src/api/order.js"));

check("el embudo termina en /gracias", html.includes("'/gracias?p='"));
check("el Lead ya NO se dispara en la product page", !html.includes("'Lead'"));
check("Purchase ya NO se dispara en el navegador", !html.includes("'Purchase'"));
check("/gracias dispara Lead", gracias.includes("'Lead'"));
check("/gracias usa el pedido como eventID",
  gracias.includes("eventID: pedido + '-lead'"));
check("/gracias enlaza al WhatsApp correcto", gracias.includes("wa.me/51928529656"));
check("/gracias no se indexa", gracias.includes('name="robots" content="noindex"'));

check("la página captura _fbp y _fbc", html.includes("fbCookie('_fbp')") && html.includes("fbCookie('_fbc')"));
check("construye _fbc desde fbclid", html.includes("'fb.1.' + Date.now()"));
check("el pedido envía fbp y fbc", html.includes("fbp: ident.fbp") && html.includes("fbc: ident.fbc"));

// La fila que arma order.js tiene que encajar exactamente en los encabezados.
const conIds = validate({ ...lima, fbp: "fb.1.9.1", fbc: "fb.1.9.abc" }).order;
check("order.js acepta fbp y fbc", conIds.fbp === "fb.1.9.1" && conIds.fbc === "fb.1.9.abc");

conIds.orderId = "TK-ABC234";
conIds.fecha = new Date().toISOString();
const fila = filaDePedido(conIds, new Headers({
  "User-Agent": "Mozilla/5.0 (prueba)", "CF-IPCountry": "PE", "CF-Connecting-IP": "190.0.0.1"
}));
check("la fila encaja con los encabezados", fila.length === COLUMNAS.length,
  `fila ${fila.length} vs ${COLUMNAS.length} columnas`);
for (const col of ["FBP", "FBC", "Event ID Lead", "User Agent", "IP"]) {
  check(`la hoja tiene la columna ${col}`, COLUMNAS.includes(col));
}
const dato = (col) => fila[COLUMNAS.indexOf(col)];
check("FBP cae en su columna", dato("FBP") === "fb.1.9.1", String(dato("FBP")));
check("FBC cae en su columna", dato("FBC") === "fb.1.9.abc", String(dato("FBC")));
check("el Event ID coincide con el que dispara /gracias",
  dato("Event ID Lead") === "TK-ABC234-lead", String(dato("Event ID Lead")));
check("la IP es la del cliente", dato("IP") === "190.0.0.1", String(dato("IP")));
check("Upsells sigue en K y Total en L",
  COLUMNAS[10] === "Upsells" && COLUMNAS[11] === "Total");

/* 6. Endpoint de diagnóstico: apagado por defecto y sin filtrar credenciales */
const diag = readFileSync(join(root, "src/api/diag.js"), "utf8");
const router = readFileSync(join(root, "src/index.js"), "utf8");

check("/api/diag está enrutado como GET", router.includes('"/api/diag": { GET: diag }'));
check("el diagnóstico exige DIAG_TOKEN", diag.includes("if (!env.DIAG_TOKEN)"));
check("compara el token en tiempo constante", diag.includes("function mismoToken"));
// Nunca debe devolver el valor de una credencial, solo su forma.
for (const fuga of ["env.GOOGLE_PRIVATE_KEY }", "detalle: pk", "clave: pk"]) {
  check(`el diagnóstico no filtra la clave (${fuga})`, !diag.includes(fuga));
}
check("solo reporta la forma de la clave, no su contenido",
  diag.includes("largo: pk.length") && !/detalle:\s*pk\b/.test(diag));

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
