/**
 * Chequeos rápidos sin dependencias ni red: `npm run check`
 *
 * Cubren lo que se rompe en silencio: precios desincronizados entre la página
 * y el servidor, la fila que se desalinea de los encabezados, el pixel que
 * deja de disparar, y datos personales que se escapen por la URL.
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
const gracias = readFileSync(join(root, "public/gracias.html"), "utf8");
const headers = readFileSync(join(root, "public/_headers"), "utf8");
const wrangler = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const upsellSrc = readFileSync(join(root, "src/api/upsell.js"), "utf8");

const { VARIANTES, UPSELLS, toE164Peru, makeEventId } = await import(join(root, "src/lib/pedido.js"));
const { COLUMNAS, ESTADOS, indiceDe, letraDe } = await import(join(root, "src/lib/hoja.js"));
const { validate, filaDePedido, numeroDeFila, fechaLima } = await import(join(root, "src/api/order.js"));

/* 1. Enganches del formulario */
for (const id of ["fName", "fPhone", "fDir", "fSucursal", "fWebsite", "shipCasa", "btnPedido"]) {
  check(`index.html tiene #${id}`, html.includes(`id="${id}"`));
}
check('las variantes llevan data-var="1kit" y "2kit"',
  html.includes('data-var="1kit"') && html.includes('data-var="2kit"'));
check("el formulario llama a /api/order", html.includes("'/api/order'"));
check("el order bump llama a /api/upsell", html.includes("'/api/upsell'"));

/* 2. Precios sincronizados entre página y servidor */
check("precio de 1 kit (S/ 79) coincide", VARIANTES["1kit"].precio === 79 && html.includes("79.00"));
check("precio de 2 kits (S/ 139) coincide", VARIANTES["2kit"].precio === 139 && html.includes("139.00"));

/* 3. Validación del backend */
check("celular 9 dígitos -> E.164", toE164Peru("987 654 321") === "51987654321");
check("celular con +51 se respeta", toE164Peru("+51 987654321") === "51987654321");
check("fijo de 7 dígitos se rechaza", toE164Peru("4451234") === null);

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

/* 4. Una sola columna de destino */
check("en Lima el destino es la dirección", r1.order.destino === lima.direccion, r1.order.destino);
check("en provincia el destino es la agencia",
  validate(provincia).order.destino === provincia.agencia);

/* 5. La fila encaja con los encabezados */
const conIds = validate({ ...lima, fbp: "fb.1.9.1", fbc: "fb.1.9.abc" }).order;
check("order.js acepta fbp y fbc", conIds.fbp === "fb.1.9.1" && conIds.fbc === "fb.1.9.abc");

conIds.eventId = "TK-ABC234";
conIds.fecha = fechaLima(new Date("2026-08-18T02:30:00Z"));
const fila = filaDePedido(conIds, new Headers({
  "User-Agent": "Mozilla/5.0 (prueba)", "CF-Connecting-IP": "190.0.0.1"
}));
check("la fila encaja con los encabezados", fila.length === COLUMNAS.length,
  `fila ${fila.length} vs ${COLUMNAS.length} columnas`);

const dato = (col) => fila[indiceDe(col)];
check("la fecha es local de Lima y parseable por Sheets",
  dato("Fecha") === "2026-08-17 21:30:00", String(dato("Fecha")));
check("el producto ya dice la cantidad", dato("Producto") === "2 Kits de Tarot Completo");
check("el estado entra en Pendiente", dato("Estado") === ESTADOS[0]);
check("el Order bump entra vacío", dato("Order bump") === "");
check("FBP y FBC caen en su columna",
  dato("FBP") === "fb.1.9.1" && dato("FBC") === "fb.1.9.abc");
check("la IP es la del cliente", dato("IP") === "190.0.0.1");
check("numeroDeFila lee el rango que devuelve Sheets",
  numeroDeFila("Pedidos!A42:O42") === 42);

/* 6. Columnas que debían desaparecer, y las que deben quedar */
for (const fuera of ["Pedido", "Variante", "Cantidad", "Dirección", "Agencia", "Origen", "UTM", "País", "Upsells"]) {
  check(`la hoja ya no tiene la columna "${fuera}"`, !COLUMNAS.includes(fuera));
}
for (const dentro of ["Dirección / Agencia", "Producto", "Order bump", "Estado", "Event ID"]) {
  check(`la hoja tiene la columna "${dentro}"`, COLUMNAS.includes(dentro));
}
check("son 15 columnas, A-O", COLUMNAS.length === 15 && letraDe(COLUMNAS.length - 1) === "O");

/* 7. El order bump se localiza por fila, no por código */
check("/api/upsell trabaja con el número de fila", upsellSrc.includes("payload.fila"));
check("/api/upsell ya no busca por código de pedido", !upsellSrc.includes("orderId"));
check("/api/upsell rechaza la fila de encabezados", upsellSrc.includes("fila < 2"));
check("el navegador manda la fila", html.includes("fila: filaPedido"));
check("solo queda el order bump de las velas",
  Object.keys(UPSELLS).join() === "velas", Object.keys(UPSELLS).join());
check("el péndulo desapareció de la página", !/pendulo|Péndulo/i.test(html));
check("el carrusel del bump es deslizable", html.includes('id="bumpCar"') && html.includes('id="bumpDots"'));
check("los botones del bump quedan juntos y visibles", html.includes('class="upsell-cta"'));

/* 8. Meta Pixel */
check("el pixel está inicializado", html.includes("fbq('init', '1598655637922566')"));
check("PageView se dispara al cargar", html.includes("fbq('track', 'PageView')"));
for (const evento of ["ViewContent", "AddToCart", "InitiateCheckout"]) {
  check(`la product page dispara ${evento}`, html.includes(`'${evento}'`));
}
check("el Lead NO se dispara en la product page", !html.includes("'Lead'"));
check("Purchase NO se dispara en el navegador",
  !html.includes("'Purchase'") && !gracias.includes("'Purchase'"));
check("/gracias dispara Lead", gracias.includes("'Lead'"));

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

const csp = headers.match(/Content-Security-Policy:.*/)?.[0] ?? "";
check("la CSP permite el script del pixel", csp.includes("https://connect.facebook.net"));
check("la CSP permite el pixel de imagen", /img-src[^;]*https:\/\/www\.facebook\.com/.test(csp));
check("la CSP permite las llamadas del pixel", /connect-src[^;]*https:\/\/www\.facebook\.com/.test(csp));

/* 9. Página de gracias: sin código, sin datos personales en la URL */
check("el embudo termina en /gracias", html.includes("'/gracias?v='"));
check("/gracias ya no muestra código de pedido", !/c[oó]digo de pedido/i.test(gracias));
check("los datos del cliente NO viajan por la URL",
  !/gracias\?[^']*(nombre|tel|dir)/i.test(html));
check("los datos del cliente viajan por sessionStorage",
  html.includes("sessionStorage.setItem('pedido'") && gracias.includes("sessionStorage.getItem('pedido')"));
check("/gracias enlaza al WhatsApp correcto", gracias.includes("'51928529656'"));
check("el mensaje de WhatsApp lleva los datos del cliente",
  ["Nombre: ", "WhatsApp: ", "Producto: ", "Direccion: ", "Total a pagar: "]
    .every((t) => gracias.includes(t)));
check("/gracias escapa lo que pinta", gracias.includes("function escapar"));
check("/gracias no se indexa", gracias.includes('name="robots" content="noindex"'));
check("el total del bump se suma antes de ir a /gracias",
  html.includes("totalPedido += FB.bumps[item]"));

/* 10. Tope por IP */
check("el Worker declara el límite por IP", wrangler.includes('"ORDER_LIMIT"'));
check("el límite son 5 pedidos", /"limit":\s*5/.test(wrangler));
check("sin el binding no se pierde ningún lead",
  readFileSync(join(root, "src/api/order.js"), "utf8").includes("if (!env.ORDER_LIMIT || !ip) return true;"));

/* 11. Diagnóstico */
const diag = readFileSync(join(root, "src/api/diag.js"), "utf8");
const router = readFileSync(join(root, "src/index.js"), "utf8");
check("/api/diag está enrutado como GET", router.includes('"/api/diag": { GET: diag }'));
check("el diagnóstico exige DIAG_TOKEN", diag.includes("if (!env.DIAG_TOKEN)"));
check("compara el token en tiempo constante", diag.includes("function mismoToken"));
check("solo reporta la forma de la clave, no su contenido",
  diag.includes("largo: pk.length") && !/detalle:\s*pk\b/.test(diag));

/* 12. Evolution API fuera del proyecto */
for (const [archivo, texto] of [
  ["public/index.html", html], ["public/gracias.html", gracias],
  ["wrangler.jsonc", wrangler], ["src/api/order.js", readFileSync(join(root, "src/api/order.js"), "utf8")],
  ["src/api/upsell.js", upsellSrc], ["src/api/diag.js", diag]
]) {
  check(`${archivo} no menciona Evolution API`, !/EVO_|evolution/i.test(texto));
}

check("el código de pedido ya no se genera como tal", typeof makeEventId === "function");

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
