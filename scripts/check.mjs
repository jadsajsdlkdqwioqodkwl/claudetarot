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
check("solo queda el order bump del Rider Waite",
  Object.keys(UPSELLS).join() === "riderwaite", Object.keys(UPSELLS).join());
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
check("el video va en silencio, en bucle y sin pantalla completa",
  ["muted", "playsinline", "loop"].every((a) => new RegExp(`<video[^>]*${a}`).test(html)));
check("lo arranca el JS al acercarse, no el atributo autoplay",
  !/<video[^>]*autoplay/.test(html) && html.includes("video.play()"));
check("el video reserva su espacio, para que no salte el layout",
  /\.videobox video\s*\{[^}]*aspect-ratio:\s*720\s*\/\s*1280/.test(html));
check("si el autoplay se bloquea aparecen los controles", html.includes("video.controls = true"));
const fuentesVideo = [...html.matchAll(/<video[^>]*data-src="(kittarotcod\/[^"]+)"/g)].map((m) => m[1]);
check("los videos que pide la página existen (el del producto y el del bump)",
  fuentesVideo.length === 2 && fuentesVideo.every((f) => existsSync(img(f))), fuentesVideo.join(", "));
check("la tira de fotos va debajo del video",
  html.indexOf('class="videobox"') < html.indexOf('id="gal"'));

/* Fotos en las tarjetas de variante y sello de vendedor */
check("las variantes muestran la foto del kit",
  (html.match(/kit-variante\.webp/g) || []).length === 2 && existsSync(img("kittarotcod/kit-variante.webp")));
check("la tarjeta de 2 kits se distingue", html.includes('class="foto dos"'));
check("el modal luce el sello de vendedor calificado", html.includes("Vendedor calificado"));
check("los sellos ocupan el ancho del modal", /\.seals img\s*\{[^}]*width:\s*100%/.test(html));

/* El carrusel del order bump: video primero, fotos después, y una foto rota
   solo se esconde a si misma (el video siempre le da contenido a la pantalla) */
check("una foto rota del bump no se cae el carrusel entero", html.includes("sinFotoBump"));
check("el video del bump va primero en el carrusel",
  html.indexOf('data-src="kittarotcod/orderbumpvideo1.mp4"') < html.indexOf('data-src="kittarotcod/foto2orderbumb.webp"'));
check("el video del bump es mudo, en bucle y sin pantalla completa",
  ["muted", "playsinline", "loop"].every((a) => new RegExp(`<video[^>]*${a}`).test(html.slice(html.indexOf('id="bumpCar"')))));

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
check("las fotos y el video de los modales esperan a que el modal se abra",
  (html.match(/data-src="kittarotcod\/(logo|badges|kit-variante|orderbumpvideo1\.mp4|foto2orderbumb|fotobump3)/g) || []).length === 7);
check("al abrir el modal del pedido se activan sus fotos",
  /function openCOD\(\)[\s\S]{0,600}activarImagenes\(document\.getElementById\('codOverlay'\)\)/.test(html));
check("al abrir el order bump se activan las suyas",
  html.includes("activarImagenes(document.getElementById('upsellOverlay'))"));
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
  ...[...html.matchAll(/(?:srcset|src)="(kittarotcod\/resenas\/[^"]+)"/g)].map((m) => m[1]),
  ...["kittarotcod/orderbumpvideo1.mp4", "kittarotcod/foto2orderbumb.webp", "kittarotcod/fotobump3.png"]
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


/* 16. Aviso de pedidos nuevos por Telegram */
const orderSrc = readFileSync(join(root, "src/api/order.js"), "utf8");
const telegramSrc = readFileSync(join(root, "src/lib/telegram.js"), "utf8");
check("el pedido avisa por Telegram sin bloquear la respuesta",
  /waitUntil\(notificarTelegram/.test(orderSrc));
check("el aviso sale después de guardar en Sheets, no antes",
  orderSrc.indexOf("await appendRow") < orderSrc.indexOf("waitUntil(notificarTelegram"));
check("sin credenciales de Telegram no truena, solo no avisa",
  telegramSrc.includes("if (!token || !chatId) return"));
check("un error de Telegram se registra pero no se lanza",
  /catch \(err\) \{\s*console\.error\("Telegram/.test(telegramSrc));
check("el token de Telegram no se imprime en los logs",
  !/console\.(log|error)\([^)]*token/i.test(telegramSrc));


/* 17. CRM de ventas manuales y página de seguimiento */
const ventasGs = readFileSync(join(root, "apps-script/VENTAS.gs"), "utf8");
const crmGs = readFileSync(join(root, "apps-script/CRM.gs"), "utf8");
const seguimientoHtml = readFileSync(join(root, "public/seguimiento.html"), "utf8");
const seguimientoApi = readFileSync(join(root, "src/api/seguimiento.js"), "utf8");
const voucherApi = readFileSync(join(root, "src/api/voucher.js"), "utf8");
const indexSrc = readFileSync(join(root, "src/index.js"), "utf8");
const panelHtml = readFileSync(join(root, "apps-script/PANEL.html"), "utf8");

const {
  COLUMNAS_VENTA, COLUMNAS_QUE_SE_ESCRIBEN, ESTADOS_ENVIO, ENVIOS, ENVIO_AGENCIA,
  ESTADO_FINAL, ALERTAS_RECOJO, RE_CODIGO, pasosDe, esCodigo, nuevoCodigo,
  telefonoDe, claveDe, aNumero, diasEsperando, alertaDe, fechaSuelta, letraVenta
} = await import(join(root, "src/lib/ventas.js"));
const { vistaPublica } = await import(join(root, "src/api/seguimiento.js"));

/** Lee un array de literales de texto de un .gs: `const X = ["a", "b"];` */
function listaDeGs(fuente, nombre) {
  const bloque = new RegExp(`const ${nombre} = \\[([^\\]]*)\\]`, "s").exec(fuente);
  return bloque ? [...bloque[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : null;
}

/* El esquema vive en dos runtimes que no pueden importarse entre sí: el Worker
   y Apps Script. Si se desalinean, el Worker lee la clave de Shalom en la
   columna del saldo y nadie se entera hasta que un cliente lo reclama. */
const encabezadosGs = listaDeGs(ventasGs, "ENCABEZADOS_V");
check("VENTAS.gs y ventas.js declaran las mismas columnas",
  encabezadosGs && encabezadosGs.join("|") === COLUMNAS_VENTA.join("|"),
  encabezadosGs ? encabezadosGs.join(" | ") : "no se pudo leer ENCABEZADOS_V");

check("VENTAS.gs cuenta el mismo número de columnas",
  new RegExp(`const TOTAL_COLUMNAS_V = ${COLUMNAS_VENTA.length};`).test(ventasGs));

const colV = {};
const bloqueCol = /const COL_V = \{([^}]*)\}/s.exec(ventasGs);
if (bloqueCol) {
  for (const [, clave, valor] of bloqueCol[1].matchAll(/([A-Z_]+):\s*(\d+)/g)) {
    colV[clave] = Number(valor);
  }
}
check("COL_V apunta a las columnas correctas (1-indexado)",
  Object.keys(colV).length === COLUMNAS_VENTA.length &&
  colV.FECHA === COLUMNAS_VENTA.indexOf("Fecha") + 1 &&
  colV.CONTACTO === COLUMNAS_VENTA.indexOf("DNI / WSP") + 1 &&
  colV.CLAVE === COLUMNAS_VENTA.indexOf("Clave Shalom / Notas") + 1 &&
  colV.ESTADO === COLUMNAS_VENTA.indexOf("Estado") + 1 &&
  colV.CODIGO === COLUMNAS_VENTA.indexOf("Código") + 1 &&
  colV.DRIVE_ID === COLUMNAS_VENTA.indexOf("Drive ID") + 1 &&
  colV.EN_DESTINO === COLUMNAS_VENTA.indexOf("En destino desde") + 1,
  JSON.stringify(colV));

check("los estados del envío coinciden en el Worker y en el script",
  (listaDeGs(ventasGs, "ESTADOS_V") || []).join("|") === ESTADOS_ENVIO.join("|"));
check("los tipos de envío coinciden en el Worker y en el script",
  (listaDeGs(ventasGs, "ENVIOS_V") || []).join("|") === ENVIOS.join("|"));

/* La hoja tiene que seguir siendo corta: es la queja que la hizo nacer así.
   Si alguna vez hace falta otra columna, que sea una decisión y no un descuido. */
check("la hoja no pasa de 13 columnas",
  COLUMNAS_VENTA.length <= 13, `son ${COLUMNAS_VENTA.length}`);
check("el vendedor solo escribe en 6 columnas o menos",
  COLUMNAS_QUE_SE_ESCRIBEN.length <= 6, `son ${COLUMNAS_QUE_SE_ESCRIBEN.length}`);
check("todas las columnas que se escriben existen en la hoja",
  COLUMNAS_QUE_SE_ESCRIBEN.every((c) => COLUMNAS_VENTA.includes(c)));
check("las columnas que se rellenan solas no están en la lista de escribir",
  ["Fecha", "Código", "Alerta", "Avisar", "Voucher", "Drive ID", "En destino desde"]
    .every((c) => !COLUMNAS_QUE_SE_ESCRIBEN.includes(c)));

/* El orden importa: es lo que el vendedor pidió, y una columna que se cuela en
   medio le rompe el recorrido de izquierda a derecha con el que trabaja. */
check("el orden de las columnas es el acordado",
  COLUMNAS_VENTA.join("|") === [
    "Fecha", "DNI / WSP", "Envío", "Adelanto", "Saldo", "Clave Shalom / Notas",
    "Alerta", "Avisar", "Voucher", "Estado",
    "Código", "En destino desde", "Drive ID"
  ].join("|"), COLUMNAS_VENTA.join(" · "));
check("la plomería queda al final y oculta",
  ventasGs.includes("hideColumns(PRIMERA_OCULTA_V") &&
  COLUMNAS_VENTA.slice(-3).join("|") === "Código|En destino desde|Drive ID");

/* La fecha con calendario: el formato de fecha por sí solo no lo saca. */
check("la fecha tiene calendario",
  /datos\(COL_V\.FECHA\)\.setDataValidation\(/.test(ventasGs) &&
  ventasGs.includes("requireDate()"));

/* Los botones viven EN la fila, como fórmulas. Es lo que evita el diálogo. */
for (const [columna, marca] of [["ALERTA", "ARRAYFORMULA"], ["AVISAR", "HYPERLINK"],
                                ["VOUCHER", "HYPERLINK"]]) {
  check(`la columna ${columna} se rellena sola`,
    new RegExp(`getRange\\(2, COL_V\\.${columna}\\)[\\s\\S]{0,80}?setFormula`).test(ventasGs) &&
    new RegExp(`COL_V\\.${columna}\\)[\\s\\S]{0,1400}?${marca}`).test(ventasGs));
}
check("el botón de avisar abre WhatsApp con el mensaje ya escrito",
  ventasGs.includes('"https://wa.me/51"') && ventasGs.includes('"💬 Avisar"'));
check("el botón del voucher lleva al panel centrado en esa venta",
  ventasGs.includes("?c=") && ventasGs.includes("urlDelPanel_()"));

/* El link del voucher no aparecía porque getUrl() devuelve vacío mientras el
   panel no esté desplegado, y no había forma de arreglarlo desde la hoja. */
check("la URL del panel se puede pegar a mano si getUrl() no la da",
  ventasGs.includes("conectarPanelMovil") && ventasGs.includes("PROP_PANEL_V"));
check("conectar el panel reescribe las fórmulas en el momento",
  /function conectarPanelMovil[\s\S]*?escribirFormulasVentas_\(hojaVentas_\(\)\)/.test(ventasGs));
check("sin panel conectado la columna Voucher lo dice, no queda muda",
  ventasGs.includes("⚠️ conecta el panel"));

/* ENCODEURL no funciona dentro de ARRAYFORMULA; el espacio se codifica a mano.
   Se busca la llamada con paréntesis, no la palabra: el comentario que explica
   por qué no se usa la menciona, y no es un fallo. */
check("el mensaje de WhatsApp codifica los espacios sin ENCODEURL",
  ventasGs.includes("SUBSTITUTE(") && ventasGs.includes('" ","%20"') &&
  !ventasGs.includes("ENCODEURL("));

/* El menú es para configurar, no para el día a día. */
const opcionesMenu = (ventasGs.match(/\.addItem\(/g) || []).length;
check("el menú no se usa para el trabajo diario", opcionesMenu <= 7, `${opcionesMenu} opciones`);
check("no quedó ningún diálogo de subir voucher",
  !existsSync(join(root, "apps-script/SUBIR.html")) &&
  !ventasGs.includes('createTemplateFromFile("SUBIR")'));

/* La línea de tiempo: los textos en la página, qué pasos se dibujan en el Worker. */
const copiaPagina = [...seguimientoHtml.matchAll(/^\s*"([^"]+)":\s*\{ titulo:/gm)].map((m) => m[1]);
check("la página tiene texto para cada paso del recorrido",
  copiaPagina.join("|") === ESTADOS_ENVIO.filter((e) => e !== "Cancelado").join("|"),
  copiaPagina.join(" → "));
check("un envío a domicilio no ve el paso de la agencia",
  !pasosDe("Lima").includes("En destino") && pasosDe(ENVIO_AGENCIA).includes("En destino"));
/* Salvo que ya esté ahí: si no, el estado no aparecía en la lista, la página no
   encontraba dónde estaba y resaltaba el primer paso — le decía al cliente que
   su pedido seguía sin salir. */
check("un envío a domicilio ya en destino sí ve ese paso",
  pasosDe("Lima", "En destino").includes("En destino"));
check("el estado siempre está entre los pasos que se le dibujan al cliente",
  ENVIOS.every((envio) => ESTADOS_ENVIO
    .filter((e) => e !== "Cancelado")
    .every((estado) => pasosDe(envio, estado).includes(estado))));
check("los pasos siempre son un subconjunto del recorrido, en orden",
  ENVIOS.every((e) => pasosDe(e).every((p) => ESTADOS_ENVIO.includes(p))) &&
  ENVIOS.every((e) => {
    const orden = pasosDe(e).map((p) => ESTADOS_ENVIO.indexOf(p));
    return orden.every((n, i) => i === 0 || n > orden[i - 1]);
  }));
check("la página tiene texto para todo paso que el Worker pueda mandar",
  ENVIOS.every((envio) => ESTADOS_ENVIO.every((estado) =>
    pasosDe(envio, estado).every((p) => copiaPagina.includes(p)))));
check("el recorrido termina en Pagado: recoger y cobrar son el mismo momento",
  ESTADO_FINAL === "Pagado" && !ESTADOS_ENVIO.includes("Entregado") &&
  pasosDe(ENVIO_AGENCIA).slice(-1)[0] === ESTADO_FINAL);

const diasGs = [...ventasGs.matchAll(/\{ dias: (\d+), icono/g)].map((m) => Number(m[1]));
check("los avisos de recojo son los mismos en los dos lados",
  diasGs.join(",") === ALERTAS_RECOJO.map((a) => a.dias).join(","), diasGs.join(", "));
check("los avisos de recojo van de menos a más días",
  ALERTAS_RECOJO.every((a, i) => i === 0 || a.dias > ALERTAS_RECOJO[i - 1].dias));

/* Códigos */
let codigosOk = true;
for (let i = 0; i < 500; i++) codigosOk = codigosOk && esCodigo(nuevoCodigo());
check("todo código generado pasa su propia validación", codigosOk);
check("el código no usa caracteres que se confunden al dictarlo",
  !/[IO01]/.test(nuevoCodigo()) && !RE_CODIGO.source.includes("A-Z]"));
check("el código de VENTAS.gs usa el mismo alfabeto",
  ventasGs.includes('"ABCDEFGHJKLMNPQRSTUVWXYZ"') && ventasGs.includes('"23456789"'));
check("un código mal formado se rechaza",
  !esCodigo("TS-I3M582R") && !esCodigo("TS-K3M58R") && !esCodigo("otra-cosa"));
check("un código en minúsculas o con espacios sigue valiendo", esCodigo(" ts-k3m582r "));
check("un código repetido al copiar una fila se detecta y se cambia",
  ventasGs.includes("usados[codigo]") && ventasGs.includes("parte.repetidas"));

/* "DNI / WSP" es una sola celda: hay que sacar el celular de ahí sin pedirle a
   nadie que respete un formato. Un DNI son 8 dígitos y un celular 9 que
   empiezan en 9, así que no se pueden confundir. */
check("el celular sale de la celda de DNI / WSP",
  telefonoDe("45781234 / 987654321") === "987654321" &&
  telefonoDe("987654321") === "987654321" &&
  telefonoDe("+51 987 654 321") === "987654321",
  telefonoDe("45781234 / 987654321"));
check("un DNI solo no se confunde con un celular",
  telefonoDe("45781234") === "" && telefonoDe("91234567") === "");
check("sin contacto no hay teléfono", telefonoDe("") === "" && telefonoDe(null) === "");
/* Los tres sitios que sacan el celular de esa celda —esta librería, la función
   del panel y la fórmula de la columna «Avisar»— tienen que darse el mismo
   número. Si divergen, el botón de la hoja escribe a uno y el panel a otro, y
   el cliente recibe el aviso en un teléfono que no es el suyo.

   No se comparan como texto sino ejecutándolos: la fórmula vive dentro de una
   cadena con las barras dobladas, y comparar cadenas escapadas es justo el
   tipo de chequeo que pasa mientras el comportamiento ya cambió. */
function patronDeGs(fuente, marca) {
  const trozo = fuente.slice(fuente.indexOf(marca));
  const limpia = /replace\(\/\[([^\]]+)\]\/g/.exec(trozo);
  const busca = /\/\(\?:\^\|\\D\)([^/]+)\/\s*\n?\s*\.exec/.exec(trozo);
  return limpia && busca
    ? { adornos: new RegExp(`[${limpia[1]}]`, "g"), celular: new RegExp(`(?:^|\\D)${busca[1]}`) }
    : null;
}
const patronGs = patronDeGs(ventasGs, "function celularDe_");
check("celularDe_ de VENTAS.gs se pudo leer para compararlo", Boolean(patronGs));

/* Y la fórmula de la hoja, que es la tercera copia del mismo patrón. */
const formulaLimpia = /REGEXREPLACE\(TO_TEXT\(' \+ rContacto \+ '\),"\[([^"]+)\]",""\)/.exec(ventasGs);
const formulaCelular = /REGEXEXTRACT\(' \+ limpio \+\s*\n?\s*',"([^"]+)"\)/.exec(ventasGs);
check("la fórmula de «Avisar» se pudo leer para compararla",
  Boolean(formulaLimpia && formulaCelular));

if (patronGs && formulaLimpia && formulaCelular) {
  const desdeGs = (t) => {
    const m = patronGs.celular.exec(String(t).replace(patronGs.adornos, ""));
    return m ? m[1] : "";
  };
  const desdeFormula = (t) => {
    const adornos = new RegExp(`[${formulaLimpia[1].replace(/\\\\/g, "\\")}]`, "g");
    const celular = new RegExp(formulaCelular[1].replace(/\\\\/g, "\\"));
    const m = celular.exec(String(t).replace(adornos, ""));
    return m ? m[1] : "";
  };
  const casos = ["987654321", "45781234 / 987654321", "+51 987 654 321",
                 "45781234", "10293847987654321", ""];
  check("el panel de Apps Script saca el mismo celular que el Worker",
    casos.every((c) => desdeGs(c) === telefonoDe(c)),
    casos.map((c) => `${c}→${desdeGs(c)}|${telefonoDe(c)}`).join("  "));
  check("la fórmula de la hoja saca el mismo celular que el Worker",
    casos.every((c) => desdeFormula(c) === telefonoDe(c)),
    casos.map((c) => `${c}→${desdeFormula(c)}|${telefonoDe(c)}`).join("  "));
}

/* "Clave Shalom / Notas" también es una sola celda, y de ahí solo puede salir
   la clave: la página no tiene login, así que publicar por error una nota
   interna sería filtrar lo que escribes de tus clientes. */
check("la clave sale de la celda compartida con las notas",
  claveDe("4821 / pidió factura") === "4821" && claveDe("AB-1234") === "AB-1234");
check("una celda con puras notas no publica nada como clave",
  claveDe("cliente pidió factura") === "" &&
  claveDe("llamar antes de enviar / urgente") === "" &&
  claveDe("") === "");
check("VENTAS.gs parte la celda con la misma regla",
  ventasGs.includes("claveDe_") && ventasGs.includes("{3,14}"));

/* Importes: Sheets no devuelve el número crudo sino lo que se ve. */
check('"S/ 1,234.50" se lee como mil doscientos, no como uno',
  aNumero("S/ 1,234.50") === 1234.5, String(aNumero("S/ 1,234.50")));
check("una celda vacía vale cero", aNumero("") === 0 && aNumero(null) === 0);

/* Fechas: "05/09/2026" es 5 de setiembre en Perú, no 9 de mayo. */
check("la fecha de la hoja se lee en formato peruano",
  fechaSuelta("05/09/2026").getUTCMonth() === 8);
/* Por día calendario de Lima y no por horas: si lo dejaste ayer a las 6 pm y
   hoy son las 8 am, para el cliente es "1 día", no "0". Y las 04:00 UTC son
   todavía la noche anterior en Lima (UTC-5), que es donde esto se equivoca. */
check("los días de espera se cuentan por día calendario de Lima",
  diasEsperando(fechaSuelta("01/09/2026"), new Date("2026-09-08T15:00:00Z")) === 7 &&
  diasEsperando(fechaSuelta("01/09/2026"), new Date("2026-09-08T04:00:00Z")) === 6);
check("el escalón que gana es el más alto cumplido",
  alertaDe(30).dias === ALERTAS_RECOJO[ALERTAS_RECOJO.length - 1].dias && alertaDe(1) === null);

/* Lo que la página pública puede y no puede ver */
const ventaDePrueba = {};
COLUMNAS_VENTA.forEach((c) => { ventaDePrueba[c] = "dato-" + c; });
Object.assign(ventaDePrueba, {
  "Código": "TS-K3M582R", "Estado": "En destino", "Envío": ENVIO_AGENCIA,
  "DNI / WSP": "45781234 / 987654321", "Adelanto": "S/ 50.00", "Saldo": "S/ 89.00",
  "Clave Shalom / Notas": "4821 / cliente moroso, cobrar antes",
  "Drive ID": "1AbCdEfGhIjKlMnOpQrS", "En destino desde": "01/09/2026", "Fecha": "01/09/2026"
});
const publica = vistaPublica(ventaDePrueba, new Date("2026-09-08T15:00:00Z"));
const serializada = JSON.stringify(publica);

check("el seguimiento no expone el WhatsApp del cliente", !serializada.includes("987654321"));
check("el seguimiento no expone el DNI", !serializada.includes("45781234"));
check("el seguimiento no expone las notas que comparten celda con la clave",
  !serializada.includes("moroso"));
check("el seguimiento no expone el id de Drive", !serializada.includes("1AbCdEfGhIjKlMnOpQrS"));
check("de la celda compartida solo sale la clave", publica.clave === "4821");
check("el saldo sale de la hoja tal cual", publica.saldo === 89, String(publica.saldo));
check("la foto se ofrece por código, no por Drive", publica.voucher === "/v/TS-K3M582R");
check("a los 7 días esperando se le pide al cliente que se apure",
  publica.diasEsperando === 7 && publica.apurar === true);

/* Cobrado es el final del recorrido, así que ya no queda saldo que enseñar. */
check("una venta ya cobrada no le pide plata al cliente",
  vistaPublica({ ...ventaDePrueba, "Estado": ESTADO_FINAL, "Saldo": "" }).saldo === 0);

/* Antes de llegar, la clave no sirve para nada y solo invita a ir de balde. */
const enCamino = vistaPublica({ ...ventaDePrueba, "Estado": "En camino" });
check("antes de llegar la clave no se muestra", enCamino.clave === "");
check("un envío que aún no llegó no cuenta días de espera",
  enCamino.diasEsperando === null && enCamino.apurar === false);
check("un estado desconocido cae al primero del recorrido",
  vistaPublica({ ...ventaDePrueba, "Estado": "inventado" }).estado === ESTADOS_ENVIO[0]);

/* A quien recibe en casa no se le pide clave, ni DNI, ni se le mete prisa. */
const enCasa = vistaPublica({ ...ventaDePrueba, "Envío": "Lima" });
check("una entrega a domicilio no pide clave ni mete prisa",
  enCasa.clave === "" && enCasa.apurar === false && enCasa.enAgencia === false);
const enCasaEnCamino = vistaPublica({ ...ventaDePrueba, "Envío": "Lima", "Estado": "En camino" });
check("los pasos del envío viajan al navegador, no los adivina la página",
  Array.isArray(publica.pasos) && publica.pasos.length > enCasaEnCamino.pasos.length,
  publica.pasos.join(" → ") + "  vs  " + enCasaEnCamino.pasos.join(" → "));

/* El aviso del flete y el mensaje que manda el cliente al ir a recoger. */
check("la página avisa de escribir antes de ir a la agencia",
  /Escríbenos el mismo día o un día antes/.test(seguimientoHtml) &&
  seguimientoHtml.includes("48 horas antes"));
check("ese aviso solo sale cuando hay agencia y el paquete ya llegó",
  /function pintarFlete[\s\S]{0,220}?estado !== "En destino" \|\| !e\.enAgencia\) return/
    .test(seguimientoHtml));
check("el botón de WhatsApp pide cubrir el flete al ir a recoger",
  seguimientoHtml.includes("cubrir mi garantía de envío gratis") &&
  seguimientoHtml.includes("Avisar que voy a recoger"));

/* La hoja ya no guarda el nombre del cliente: la página no puede pedirlo. */
check("la página no espera un nombre que la hoja ya no guarda",
  !/e\.cliente/.test(seguimientoHtml) && !/e\.destino/.test(seguimientoHtml));
check("el panel tampoco", !/e\.cliente|e\.destino\b/.test(panelHtml));

/* Privacidad de la página: la URL ES la llave del envío. */
check("la página de seguimiento no lleva el pixel de Meta",
  !/fbq\(|connect\.facebook\.net/.test(seguimientoHtml));
check("la página de seguimiento pide no ser indexada",
  /<meta name="robots" content="noindex/.test(seguimientoHtml));
check("la API del seguimiento también responde noindex",
  seguimientoApi.includes('"X-Robots-Tag"') && voucherApi.includes('"X-Robots-Tag"'));
check("el mismo 404 para un código falso que para uno que no existe",
  /No encontramos ning[uú]n env[ií]o con ese c[oó]digo/.test(seguimientoApi));

/* El voucher sale de la hoja, así que el endpoint no puede fiarse de la celda. */
check("el proxy del voucher solo acepta un id de Drive, no una URL",
  voucherApi.includes("RE_DRIVE_ID") && /\^\[A-Za-z0-9_-\]\{10,100\}\$/.test(voucherApi));
check("un HTML de error de Drive no se sirve como si fuera la foto",
  voucherApi.includes('tipo.startsWith("image/")'));

/* Rutas */
check("el Worker enruta /api/seguimiento", indexSrc.includes('"/api/seguimiento"'));
check("el Worker sirve la foto en /v/", indexSrc.includes('pathname.startsWith("/v/")'));
check("la página de seguimiento cuelga de la raíz, con el código como ruta",
  indexSrc.includes("RE_RUTA_SEGUIMIENTO") && indexSrc.includes("paginaDeSeguimiento"));
check("el seguimiento tiene su propio tope por IP, aparte del de pedidos",
  seguimientoApi.includes("env.TRACK_LIMIT") && wrangler.includes('"TRACK_LIMIT"'));
check("la pestaña de ventas está declarada como variable del Worker",
  wrangler.includes('"GOOGLE_VENTAS_NAME"'));

/* El Worker solo lee la pestaña Ventas: quien escribe es el vendedor. */
const ventasHoja = readFileSync(join(root, "src/lib/ventas-hoja.js"), "utf8");
check("el Worker no escribe en la pestaña Ventas",
  !/updateValues|appendRow|batchUpdate/.test(ventasHoja + seguimientoApi + voucherApi));

/* Apps Script: un solo onOpen por proyecto, o un menú desaparece sin avisar. */
check("VENTAS.gs no define su propio onOpen", !/^function onOpen/m.test(ventasGs));
check("CRM.gs cuelga el menú de Ventas y aguanta que no esté instalado",
  crmGs.includes("menuVentas_") && crmGs.includes('typeof menuVentas_ === "function"'));
check("los dos scripts no comparten ningún nombre global",
  [...ventasGs.matchAll(/^(?:function|const) ([A-Za-z0-9_]+)/gm)]
    .map((m) => m[1])
    .every((n) => !new RegExp(`^(?:function|const) ${n}\\b`, "m").test(crmGs)));

/* Lo que hace que el montaje del voucher funcione y no cueste nada. */
check("el voucher lo sube tu cuenta de Google, no la service account",
  ventasGs.includes("carpetaVouchers_") && ventasGs.includes("DriveApp.createFolder"));
check("el archivo del voucher queda accesible por link",
  ventasGs.includes("DriveApp.Access.ANYONE_WITH_LINK"));
check("la foto se encoge antes de subirla", panelHtml.includes("MAX_LADO"));
check("el panel se puede abrir centrado en una sola venta",
  ventasGs.includes("e.parameter.c") && panelHtml.includes("FOCO"));

/* El dominio del seguimiento tiene que ser el mismo en los dos sitios. */
const sitio = /const SITIO = "([^"]+)"/.exec(ventasGs)?.[1] || "";
check("el dominio del seguimiento va sin barra final y por HTTPS",
  sitio.startsWith("https://") && !sitio.endsWith("/"), sitio);
check("las letras de columna llegan hasta la última de la hoja",
  letraVenta(COLUMNAS_VENTA.length - 1) === "M");

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
