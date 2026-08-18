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
check("compara el token en tiempo constante",
  readFileSync(join(root, "src/lib/token.js"), "utf8").includes("diff |= a.charCodeAt(i)"));

/* 11b. Preparar la hoja desde el Worker, sin llevar la clave a ninguna máquina */
const setup = readFileSync(join(root, "src/api/setup.js"), "utf8");
check("/api/setup existe y es POST", router.includes('"/api/setup": { POST: setup }'));
check("/api/setup exige DIAG_TOKEN", setup.includes("if (!env.DIAG_TOKEN)"));
check("/api/setup no acepta GET", !setup.includes("onRequestGet"));
check("el setup de la hoja es un módulo compartido",
  setup.includes('from "../lib/crm-setup.js"') &&
  readFileSync(join(root, "scripts/setup-sheet.mjs"), "utf8").includes('from "../src/lib/crm-setup.js"'));
check("crm-setup no usa process ni console",
  !/process\.|console\./.test(readFileSync(join(root, "src/lib/crm-setup.js"), "utf8")));
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

/* 10. Galería de fotos y peso de la página */
const { existsSync, statSync, readdirSync } = await import("node:fs");
const img = (ruta) => join(root, "public", ruta);

// Se compara contra el marcado, no contra la regla CSS del mismo nombre.
const posGaleria = html.indexOf('id="gal"');
const posValoracion = html.indexOf('<div class="rating-row">');
const posBanner = html.indexOf('kittarotcod/1.webp');
check("la tira va después del banner principal", posBanner < posGaleria,
  `banner ${posBanner}, tira ${posGaleria}, reseñas ${posValoracion}`);
check("el visor existe con carrusel, puntos y contador",
  ["visorTrack", "visorDots", "visorPos", "visorPrev", "visorNext"].every((id) => html.includes(`id="${id}"`)));

const fotos = [...html.matchAll(/archivo:\s*'(g\d)'/g)].map((m) => m[1]);
check("la galería declara 6 fotos", fotos.length === 6, fotos.join(", "));
const mosaicos = Number((html.match(/var MOSAICOS = (\d+)/) || [])[1]);
check("la tira muestra menos mosaicos que fotos, para que haya contador",
  mosaicos > 0 && mosaicos < fotos.length, `mosaicos ${mosaicos}, fotos ${fotos.length}`);
check("el contador es un +N y ya no dice Ver todas",
  /mas">\+' \+ restantes/.test(html) && !html.includes("Ver todas"));
for (const foto of fotos) {
  check(`existe ${foto}.webp y su miniatura`,
    existsSync(img(`kittarotcod/galeria/${foto}.webp`)) &&
    existsSync(img(`kittarotcod/galeria/${foto}-mini.webp`)));
}
check("las fotos grandes se cargan solo al abrir el visor", html.includes("data-src=\"kittarotcod/galeria/"));
// El atributo height del <img> gana sobre aspect-ratio: sin height:auto la
// foto se renderiza a 1000px de alto y desborda el visor.
check("el visor lleva height:auto en la foto", /\.visor-track img\s*\{[^}]*height:\s*auto/.test(html));
check("el visor se cierra con Escape", html.includes('e.key === \'Escape\''));

check("el logo del modal apunta al archivo que existe",
  html.includes("kittarotcod/logo.webp") && existsSync(img("kittarotcod/logo.webp")));
check("los sellos apuntan al archivo que existe",
  html.includes("kittarotcod/badges.webp") && existsSync(img("kittarotcod/badges.webp")));
for (const viejo of ["logo.svg", "garantia.webp", "tienda-segura.webp", "compra-segura.webp"]) {
  check(`ya no se pide ${viejo}, que no existe`, !html.includes(viejo));
}

check("el banner principal tiene prioridad alta", /1\.webp"[^>]*fetchpriority="high"/.test(html));
check("el banner principal declara medidas",
  /1\.webp"[^>]*width="\d+" height="\d+"/.test(html));

/* El video sustituye a los banners 2 y 3 */
check("los banners 2 y 3 ya no estan en el cuerpo",
  !html.includes("kittarotcod/2.webp") && !html.includes("kittarotcod/3.webp"));
check("el video esta en la pagina", html.includes('id="vidKit"'));
check("el video arranca solo, en silencio y sin salir a pantalla completa",
  ["autoplay", "muted", "playsinline", "loop"].every((a) => new RegExp(`<video[^>]*${a}`).test(html)));
check("el video reserva su espacio, para que no salte el layout",
  /\.videobox video\s*\{[^}]*aspect-ratio:\s*720\s*\/\s*1280/.test(html));
check("si el autoplay se bloquea aparecen los controles", html.includes("video.controls = true"));
check("cada <source> del video existe en disco",
  [...html.matchAll(/<source src="(kittarotcod\/[^"]+)"/g)].every((m) => existsSync(img(m[1]))));
check("la tira de fotos va debajo del video",
  html.indexOf('class="videobox"') < html.indexOf('id="gal"'));

/* Fotos en las tarjetas de variante y sello de vendedor */
check("las variantes muestran la foto del kit",
  (html.match(/kit-variante\.webp/g) || []).length === 2 && existsSync(img("kittarotcod/kit-variante.webp")));
check("la tarjeta de 2 kits se distingue", html.includes('class="foto dos"'));
check("el modal luce el sello de vendedor calificado", html.includes("Vendedor calificado"));
check("los sellos ocupan el ancho del modal", /\.seals img\s*\{[^}]*width:\s*100%/.test(html));

/* El carrusel del order bump no puede mostrar huecos */
check("si faltan las fotos del bump se retira el carrusel", html.includes("sinFotoBump"));

const pesados = [];
const recorrer = (dir) => readdirSync(join(root, "public", dir), { withFileTypes: true }).forEach((e) => {
  const rel = dir ? `${dir}/${e.name}` : e.name;
  if (e.isDirectory()) recorrer(rel);
  else {
    // Un video pesa por naturaleza; lo que no puede pesar es una imagen.
    const limite = /\.(mp4|webm|mov)$/i.test(rel) ? 6 * 1024 * 1024 : 1024 * 1024;
    const tam = statSync(img(rel)).size;
    if (tam > limite) pesados.push(`${rel} (${Math.round(tam / 1024)} KB)`);
  }
});
recorrer("");
check("ninguna imagen pasa de 1 MB ni el video de 6 MB", pesados.length === 0, pesados.join(", "));

const video = statSync(img("kittarotcod/2.mp4")).size / 1024 / 1024;
if (video > 2.5) console.log(`     aviso: el video pesa ${video.toFixed(1)} MB; por debajo de 2.5 MB carga bastante antes en datos móviles`);


/* 11. Que un fallo de red no cueste un lead */
check("el pedido se reintenta antes de rendirse", html.includes("function enviarPedido(cuerpo, intento)"));
check("no se reintenta un error de datos, solo uno del servidor", html.includes("r.status >= 500"));
check("si aun asi falla, el lead sale por WhatsApp con todo escrito",
  html.includes("function enlaceRescate") && html.includes("wa.me/"));
check("el rescate lleva nombre, telefono, producto y total",
  /enlaceRescate[\s\S]{0,700}Total a pagar/.test(html));


console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
