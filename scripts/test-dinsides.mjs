/**
 * Pedidos de Lima → Dinsides (2026-11-08): distritos y alias del desplegable, coordenadas de links y pines, zona del mapa de
 * cobertura (polígonos), la regla de la fecha de entrega (lo de esta noche sale mañana, aunque sea la 1 de la mañana) y el
 * armado de la ficha con sus bloqueos (dirección y distrito dudosos, zona roja, teléfono) y alertas (extras, pago, monto).
 * `node --no-warnings scripts/test-dinsides.mjs` (también la corre `npm run check`).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D = await import(join(root, "src/lib/dinsides.js"));
let fallas = 0;
const check = (n, ok, d = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${n}${ok || !d ? "" : ` — ${d}`}`); };

// Distritos y alias
check("Surco → santiago de surco 150140", D.buscarDistrito("Surco")?.codigo === "150140");
check("SJL → san juan de lurigancho", D.buscarDistrito("SJL")?.clave === "san juan de lurigancho");
check("«Santiago De Surco» con mayúsculas y acentos", D.buscarDistrito("SANTIAGO DE SÚRCO")?.codigo === "150140");
check("Vitarte → ate (tarifa 12)", D.buscarDistrito("vitarte")?.tarifa === 12);
check("distrito inexistente → null", D.buscarDistrito("Narnia") === null);
check("distritoPorCodigo", D.distritoPorCodigo("150122")?.clave === "miraflores");

let t = D.distritosEnTexto("Av. Los Héroes 123, San Juan de Miraflores");
check("la dirección nombra un distrito", t.distritos.length === 1 && t.distritos[0] === "san juan de miraflores" && !t.ambiguos.length, JSON.stringify(t));
t = D.distritosEnTexto("Jr Lima 456, San Juan");
check("«San Juan» y «Lima» a secas son ambiguos, no deciden", !t.distritos.length && t.ambiguos.includes("san juan"), JSON.stringify(t));
t = D.distritosEnTexto("Calle X 123 Vitarte");
check("alias dentro de la dirección (Vitarte → ate)", t.distritos[0] === "ate");
t = D.distritosEnTexto("Mz B Lt 4, Villa El Salvador, cerca a Villa María");
check("dos distritos en el texto → los dos", t.distritos.length === 2, JSON.stringify(t));
t = D.distritosEnTexto("Jr. Huallaga 300, El Agustino");
check("«El Agustino» no se cuenta dos veces", t.distritos.length === 1 && t.distritos[0] === "el agustino", JSON.stringify(t));

// Coordenadas
let c = D.limpiarCoordenadas("https://maps.google.com/?q=-12.0931,-77.0465");
check("?q= de WhatsApp", c && c.lat === -12.0931 && c.lng === -77.0465 && !c.aviso, JSON.stringify(c));
c = D.limpiarCoordenadas("https://www.google.com/maps/place/x/@-12.1,-77.0,17z/data=!3m1!4b1!4m5!3m4!1s0x0!8m2!3d-12.12113!4d-77.02969");
check("!3d/!4d manda sobre @", c && c.lat === -12.12113 && c.lng === -77.02969, JSON.stringify(c));
c = D.limpiarCoordenadas("https://www.google.com/maps?ll=-12.0464%2C-77.0428&z=17");
check("ll= con %2C", c && c.lng === -77.0428, JSON.stringify(c));
check("link corto no se resuelve", D.limpiarCoordenadas("https://maps.app.goo.gl/AbC123") === null);
c = D.limpiarCoordenadas("12.0464, 77.0428");
check("signo positivo se corrige y avisa", c && c.lat === -12.0464 && /positivo/.test(c.aviso), JSON.stringify(c));
c = D.limpiarCoordenadas("-16.4090,-71.5375");
check("fuera de Lima avisa", c && /fuera/.test(c.aviso), JSON.stringify(c));
c = D.coordenadasDeUbicacion("-12.0464|-77.0428|Plaza Mayor|Jr. de la Unión 100");
check("pin de WhatsApp (lat|lng|nombre|dirección)", c && c.lat === -12.0464 && c.direccion === "Jr. de la Unión 100", JSON.stringify(c));

// Zona del mapa de cobertura
let z = D.zonaDe(-12.1211, -77.0297);
check("Parque Kennedy cae en MIRAFLORES", z.clase === "entrega" && z.distrito === "miraflores" && z.codigo === "150122", JSON.stringify(z));
z = D.zonaDe(-12.0443, -77.1269);
check("un punto de «ZONA SIN ENTREGAS CALLAO» es no_entrega", z.clase === "no_entrega", JSON.stringify(z));
z = D.zonaDe(-11.5, -76.0);
check("fuera del mapa", z.clase === "fuera");

// Fecha de entrega (hora de Lima)
const lima = (iso) => new Date(iso + "-05:00").getTime();
check("a las 22:00 del 8 sale el 9", D.fechaEntrega({ ahora: lima("2026-11-08T22:00:00") }).fecha === "2026-11-09");
check("a la 01:00 del 9 sigue siendo la noche del 8 → sale el 9", D.fechaEntrega({ ahora: lima("2026-11-09T01:00:00") }).fecha === "2026-11-09");
check("a las 10:00 del 9 → sale el 10", D.fechaEntrega({ ahora: lima("2026-11-09T10:00:00") }).fecha === "2026-11-10");
check("fecha_objetivo del reporte manda", D.fechaEntrega({ ahora: lima("2026-11-08T22:00:00"), fecha_objetivo: "2026-11-09" }).fecha === "2026-11-09");
let f = D.fechaEntrega({ ahora: lima("2026-11-08T22:00:00"), fecha_pedida: "2026-11-12" });
check("el cliente pidió otro día: esa fecha y aviso", f.fecha === "2026-11-12" && /otro día/.test(f.aviso), JSON.stringify(f));
f = D.fechaEntrega({ ahora: lima("2026-11-08T22:00:00"), fecha_pedida: "2026-11-01" });
check("fecha pedida ya pasada: mañana + aviso", f.fecha === "2026-11-09" && /ya pasó/.test(f.aviso), JSON.stringify(f));

// Armado de la ficha
const ctx = { ahora: lima("2026-11-08T22:00:00"), fecha_objetivo: "2026-11-09" };
let p = D.armarPedido({ nombre: "Gladys Falcón", whatsapp: "51957845104", direccion_o_agencia: "Av. Tomás Marsano 2500 Dpto. 301, Surco. Ref: frente al parque",
  kits: 1, pago: "Yape", nota: "La recibe ella; pagará con Yape al recibir", estado: "CONFIRMADO", destino: "LIMA" }, ctx);
check("pedido limpio: listo, Surco, 9 dígitos, S/89 YAPE, mañana", p.listo && p.campos.id_distrito === "150140" && p.campos.telefono === "957845104"
  && p.campos.cobrar === "89" && p.campos.tipo_pago === "YAPE" && p.campos.fecha_entrega === "2026-11-09" && p.campos.tipo_pedido === "CONTRAENTREGA", JSON.stringify(p));
check("dirección normalizada (Av, Dpto) y tarifa del distrito", /^Av Tomás Marsano 2500 Dpto 301/.test(p.campos.direccion) && p.campos.monto_service === "10", p.campos.direccion);

p = D.armarPedido({ nombre: "Ketty", whatsapp: "51962749614", direccion_o_agencia: "Calle Las Begonias 450, San Isidro",
  nota: "🚨 DISCRECIÓN: ya pagó S/89 por Plin (21:19, op 01217786), NO cobrar. Dejar con el portero", estado: "CONFIRMADO" }, ctx);
check("«ya pagó, NO cobrar» → SOLO-ENTREGA-NO-COBRAR, S/0, NO COBRAR", p.campos.tipo_pedido === "SOLO-ENTREGA-NO-COBRAR" && p.campos.cobrar === "0" && p.campos.tipo_pago === "NO COBRAR", JSON.stringify(p.campos));
check("la nota con 🚨 se avisa y va limpia en obs", p.alertas.some((a) => /🚨/.test(a)) && /DISCRECIÓN/.test(p.campos.obs) && !/🚨/.test(p.campos.obs), JSON.stringify(p));

p = D.armarPedido({ nombre: "Pin", whatsapp: "51999999999", direccion_o_agencia: "", ubicacion: "-12.1211|-77.0297||", estado: "CONFIRMADO" }, ctx);
check("solo pin → BLOQUEO de dirección con link de Maps, distrito del pin", !p.listo && p.bloqueos.some((b) => /DIRECCIÓN.*solo mandó su ubicación.*maps\.google|google\.com\/maps/.test(b))
  && p.campos.distrito === "miraflores" && p.campos.coordenadas === "-12.1211,-77.0297", JSON.stringify(p));

p = D.armarPedido({ nombre: "Sin distrito", whatsapp: "51999999998", direccion_o_agencia: "Mz C Lt 12 Urb Los Jardines, ref. parque", estado: "CONFIRMADO" }, ctx);
check("sin distrito ni pin → BLOQUEO de distrito", !p.listo && p.bloqueos.some((b) => /^DISTRITO: no se deduce/.test(b)), JSON.stringify(p.bloqueos));

p = D.armarPedido({ nombre: "Choque", whatsapp: "51999999997", direccion_o_agencia: "Av Arequipa 1200, Lince", coordenadas: "-12.1211,-77.0297", estado: "CONFIRMADO" }, ctx);
check("texto dice Lince y el pin cae en Miraflores → BLOQUEO", !p.listo && p.bloqueos.some((b) => /Lince.*miraflores|lince.*miraflores/i.test(b)), JSON.stringify(p.bloqueos));

p = D.armarPedido({ nombre: "Zona roja", whatsapp: "51999999996", direccion_o_agencia: "Av Néstor Gambetta km 5, Callao", coordenadas: "-12.0443,-77.1269", estado: "CONFIRMADO" }, ctx);
check("pin en zona sin entregas → BLOQUEO ZONA ROJA", !p.listo && p.bloqueos.some((b) => /^ZONA ROJA/.test(b)), JSON.stringify(p.bloqueos));

p = D.armarPedido({ nombre: "Dos kits", whatsapp: "51999999995", direccion_o_agencia: "Jr Puno 500, Cercado de Lima", kits: 2, empaque: "collar amuleto extra prometido", estado: "CONFIRMADO" }, ctx);
check("2 kits + extra → producto con x2 y «+ Extra», S/149, alertas", p.listo && p.campos.producto === "Kit Tarot de aprendizaje x2 + Extra: collar amuleto extra prometido"
  && p.campos.cobrar === "149" && p.alertas.some((a) => /^EMPAQUE/.test(a)), JSON.stringify(p));

p = D.armarPedido({ nombre: "Dudoso", whatsapp: "51999999994", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", estado: "POR_VERIFICAR", nota: "dijo que yapeó sin captura" }, ctx);
check("POR_VERIFICAR no se registra solo", !p.listo && p.bloqueos.some((b) => /^ESTADO POR_VERIFICAR/.test(b)));
p = D.armarPedido({ nombre: "Tel malo", whatsapp: "51812345678", telefono: "", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", estado: "CONFIRMADO" }, ctx);
check("teléfono que no empieza en 9 → BLOQUEO", p.bloqueos.some((b) => /^TELÉFONO/.test(b)));
p = D.armarPedido({ nombre: "Efectivo", whatsapp: "51999999993", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "efectivo", estado: "CONFIRMADO", fecha_entrega: "2026-11-12" }, ctx);
check("pago en efectivo y otro día → alertas, no bloqueos", p.listo && p.campos.tipo_pago === "EFECTIVO" && p.campos.fecha_entrega === "2026-11-12" && p.alertas.some((a) => /^FECHA/.test(a)), JSON.stringify(p));
p = D.armarPedido({ nombre: "Provincia", whatsapp: "51999999992", direccion_o_agencia: "Shalom Arequipa", destino: "PROVINCIA", estado: "CONFIRMADO" }, ctx);
check("provincia no va por Dinsides", p.bloqueos.some((b) => /PROVINCIA/.test(b)));

p = D.armarPedido({ nombre: "Cecilia", whatsapp: "51996941086", direccion_o_agencia: "Av Antúnez de Mayolo Mz F2 Lt 14, San Martín de Porres", estado: "CONFIRMADO",
  nota: "Dijo que pagaría S/89 por Yape (sin captura vista); si no, cobrar al recibir", empaque: "VERIFICAR, en el chat se le prometió: «11-07 13:26 V(margiory): Claro bell@ está en *S/89 todo el kit*…»" }, ctx);
check("«pagaría…; si no, cobrar al recibir» NO es pagado: se cobra S/89 YAPE", p.campos.tipo_pago === "YAPE" && p.campos.cobrar === "89" && p.campos.tipo_pedido === "CONTRAENTREGA", JSON.stringify(p.campos));
check("el «VERIFICAR…» de enviar.py no entra al producto ni a la observación; solo avisa", p.campos.producto === "Kit Tarot de aprendizaje" && !/VERIFICAR/.test(p.campos.obs) && p.alertas.some((a) => /^EMPAQUE por verificar/.test(a)), JSON.stringify(p));

// Script de consola y payload
const fichas = [D.armarPedido({ nombre: "A", whatsapp: "51957845104", direccion_o_agencia: "Av X 1, Surco", estado: "CONFIRMADO" }, ctx)];
const sc = D.scriptConsola(fichas);
check("script de consola llena el formulario y agrega al listado sin guardar", /#id_distrito/.test(sc) && /add-row/.test(sc) && /150140/.test(sc) && !/addPedidos|registro/.test(sc));
const pl = D.payloadRegistro(fichas, { negocio: "7", id_recojo: "2", recojo: "1", turno: "" });
check("payload con los arreglos de pedido/registro", pl.nombres[0] === "A" && pl.id_distritos[0] === "150140" && pl.negocio === "7" && pl.metodo_pago[0] === "YAPE");
check("codificado como jQuery (nombres[]=)", /nombres%5B%5D=A/.test(D.codificarFormulario(pl)) && /negocio=7/.test(D.codificarFormulario(pl)));
check("resumenFicha es texto corto", /A · 957845104 · santiago de surco/.test(D.resumenFicha(fichas[0])));

if (fallas) { console.error(`\n${fallas} prueba(s) de Dinsides fallaron`); process.exit(1); }
console.log("\nDinsides: todo OK");
