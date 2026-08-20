/**
 * Chequeos rápidos sin dependencias ni red: `npm run check`
 *
 * Cubren lo que se rompe en silencio: precios desincronizados entre la página
 * y el servidor, la fila que se desalinea de los encabezados, el pixel que
 * deja de disparar, y datos personales que se escapen por la URL.
 */
import { readFileSync, existsSync } from "node:fs";
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

const { VARIANTES, toE164Peru, makeEventId } = await import(join(root, "src/lib/pedido.js"));
const { COLUMNAS, ESTADOS, indiceDe, letraDe } = await import(join(root, "src/lib/hoja.js"));
const { validate, filaDePedido, numeroDeFila, fechaLima } = await import(join(root, "src/api/order.js"));

/* 1. Enganches del formulario */
for (const id of ["fName", "fPhone", "fDir", "fSucursal", "fWebsite", "shipCasa", "btnPedido"]) {
  check(`index.html tiene #${id}`, html.includes(`id="${id}"`));
}
check('las variantes llevan data-var="1kit" y "2kit"',
  html.includes('data-var="1kit"') && html.includes('data-var="2kit"'));
check("el formulario llama a /api/order", html.includes("'/api/order'"));

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

check("el péndulo desapareció de la página", !/pendulo|Péndulo/i.test(html));
check("el order bump quedó fuera de main: sin modal, sin carrusel, sin endpoint",
  !html.includes("upsellOverlay") && !html.includes("bumpCar") && !existsSync(join(root, "src/api/upsell.js")));

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
for (const [id, { precio }] of Object.entries(VARIANTES)) {
  check(`el pixel cobra S/ ${precio} por ${id}`,
    new RegExp(`'${id}':\\s*${precio}\\b`).test(catalogo), catalogo.trim());
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
  ["src/api/diag.js", diag]
]) {
  check(`${archivo} no menciona Evolution API`, !/EVO_|evolution/i.test(texto));
}

check("el código de pedido ya no se genera como tal", typeof makeEventId === "function");

/* 10. Galería de fotos y peso de la página */
const { statSync, readdirSync } = await import("node:fs");
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
check("el video va en silencio, en bucle y sin pantalla completa",
  ["muted", "playsinline", "loop"].every((a) => new RegExp(`<video[^>]*${a}`).test(html)));
check("lo arranca el JS al acercarse, no el atributo autoplay",
  !/<video[^>]*autoplay/.test(html) && html.includes("video.play()"));
check("el video reserva su espacio, para que no salte el layout",
  /\.videobox video\s*\{[^}]*aspect-ratio:\s*720\s*\/\s*1280/.test(html));
check("si el autoplay se bloquea aparecen los controles", html.includes("video.controls = true"));
const fuentesVideo = [...html.matchAll(/<video[^>]*data-src="(kittarotcod\/[^"]+)"/g)].map((m) => m[1]);
check("el archivo de video que pide la página existe",
  fuentesVideo.length === 1 && existsSync(img(fuentesVideo[0])), fuentesVideo.join(", "));
check("la tira de fotos va debajo del video",
  html.indexOf('class="videobox"') < html.indexOf('id="gal"'));

/* Fotos en las tarjetas de variante y sello de vendedor */
check("las variantes muestran la foto del kit",
  (html.match(/kit-variante\.webp/g) || []).length === 2 && existsSync(img("kittarotcod/kit-variante.webp")));
check("la tarjeta de 2 kits se distingue", html.includes('class="foto dos"'));
check("el modal luce el sello de vendedor calificado", html.includes("Vendedor calificado"));
check("los sellos ocupan el ancho del modal", /\.seals img\s*\{[^}]*width:\s*100%/.test(html));

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


/* 13. Reseñas: foto, flechas dentro y "me gusta" */
check("las tarjetas del carrusel llevan foto",
  (html.match(/class="rfoto"/g) || []).length === 3);
check("las flechas van dentro de la tarjeta, no debajo",
  /\.rev-nav\s*\{[^}]*position:\s*absolute/.test(html));
check("los puntos del carrusel no ocupan alto", /\.rev-dots\s*\{\s*display:\s*none/.test(html));
check("el carrusel sigue teniendo flechas que funcionan",
  html.includes("revMove(-1)") && html.includes("revMove(1)"));
check("las reseñas verificadas llevan me gusta y ya no piden foto",
  (html.match(/class="megusta"/g) || []).length === 4 && !html.includes('class="rimg"'));
check("el me gusta es interactivo", html.includes("window.alternarLike"));
check("votar lo contrario apaga el otro pulgar", /alternarLike[\s\S]{0,600}pareja\[i\]/.test(html));
check("una foto de reseña que falte no deja el icono roto", html.includes("sinFotoResena"));

/* Todas las fotos que subirá el cliente van con WebP primero y respaldo */
const conRespaldo = [...html.matchAll(/<picture><source srcset="([^"]+\.webp)" type="image\/webp"><img src="([^"]+\.jpg)"/g)];
check("cada foto del carrusel ofrece WebP y respaldo JPG", conRespaldo.length === 3, String(conRespaldo.length));
check("las tres fotos del carrusel de reseñas ya están subidas",
  ["r1", "r2", "r3"].every((r) => existsSync(img(`kittarotcod/resenas/${r}.webp`))));
// El WebM exportado pesaba mas que el MP4, asi que se sirve el MP4.
check("se sirve el MP4, que es el mas ligero de los dos",
  fuentesVideo[0] === "kittarotcod/2.mp4", fuentesVideo.join(", "));

/* 14. Tarjetas de variante en 4:5 */
check("la foto de la variante es una banda horizontal",
  /\.vcard \.foto\s*\{[^}]*height:\s*86px/.test(html));
check("la imagen del kit se sirve apaisada", html.includes('width="500" height="300"'));


/* 15. Carga diferida: lo pesado no viaja hasta que hace falta */
check("el video no trae src: lo pone el JS al acercarse",
  /<video[^>]*data-src="kittarotcod\/2\.mp4"/.test(html) && !/<video[^>]*\ssrc=/.test(html));
check("el video no precarga nada", /<video[^>]*preload="none"/.test(html));
check("hay observador de cercanía y red de seguridad por scroll",
  html.includes("IntersectionObserver") && html.includes("addEventListener('scroll', alMoverse"));
check("el limitador no depende de requestAnimationFrame",
  /alMoverse = function[\s\S]{0,260}Date\.now\(\)/.test(html));
check("el video se pausa al alejarse", /distancia\(MARGEN_PLAY\)[\s\S]{0,120}video\.pause\(\)/.test(html));
check("las fotos de los modales esperan a que el modal se abra",
  (html.match(/data-src="kittarotcod\/(logo|badges|kit-variante)/g) || []).length === 4);
check("al abrir el modal del pedido se activan sus fotos",
  /function openCOD\(\)[\s\S]{0,600}activarImagenes\(document\.getElementById\('codOverlay'\)\)/.test(html));
check("el favicon usa el logo real de la tienda", html.includes('rel="icon" href="kittarotcod/favicon-32.png"'));
check("se conecta por adelantado con Meta", html.includes('rel="preconnect" href="https://connect.facebook.net"'));

const cacheado = readFileSync(join(root, "public/_headers"), "utf8");
check("las imágenes y el video se cachean un año",
  /\/kittarotcod\/\*[\s\S]{0,120}max-age=31536000/.test(cacheado));
check("el HTML se revalida siempre, para que los precios no se queden viejos",
  /\/index\.html[\s\S]{0,120}must-revalidate/.test(cacheado));


/* 12. Archivos que aún no están: no rompen la página, pero cuestan un 404 */
const pendientes = [
  ...fuentesVideo,
  ...[...html.matchAll(/(?:srcset|src)="(kittarotcod\/resenas\/[^"]+)"/g)].map((m) => m[1])
].filter((f) => {
  if (existsSync(img(f))) return false;
  // Un .jpg cuyo .webp ya existe no falta: es el respaldo para navegadores
  // viejos y no lo llega a pedir nadie.
  return !(f.endsWith(".jpg") && existsSync(img(f.replace(/\.jpg$/, ".webp"))));
});
if (pendientes.length) {
  console.log(`     aviso: faltan ${pendientes.length} archivo(s) que la página pide; hasta que los subas se ocultan solos:`);
  pendientes.forEach((f) => console.log(`       public/${f}`));
}


console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
