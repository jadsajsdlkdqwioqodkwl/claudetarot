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
check("texto dice Lince y el pin cae en Miraflores → manda el MAPA de Dinsides (miraflores) y avisa", p.listo && p.campos.distrito === "miraflores" && p.alertas.some((a) => /lince.*miraflores/i.test(a)), JSON.stringify(p));

p = D.armarPedido({ nombre: "Zona roja", whatsapp: "51999999996", direccion_o_agencia: "Av Néstor Gambetta km 5, Callao", coordenadas: "-12.0443,-77.1269", estado: "CONFIRMADO" }, ctx);
check("pin en zona sin entregas → BLOQUEO ZONA ROJA", !p.listo && p.bloqueos.some((b) => /^ZONA ROJA/.test(b)), JSON.stringify(p.bloqueos));

p = D.armarPedido({ nombre: "Dos kits", whatsapp: "51999999995", direccion_o_agencia: "Jr Puno 500, Cercado de Lima", kits: 2, empaque: "collar amuleto extra prometido", estado: "CONFIRMADO" }, ctx);
check("2 kits + extra → producto con x2 y «+ Extra», S/149, alertas", p.listo && p.campos.producto === "2 Kits Tarot de aprendizaje + Extra: collar amuleto extra prometido"
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

// Montos que vienen en texto desde el reporte (casos reales de la hoja «Pedidos auto», 2026-11)
p = D.armarPedido({ nombre: "Pagado", whatsapp: "51999195063", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "Pagado S/89", estado: "CONFIRMADO" }, ctx);
check("«Pagado S/89» → NO COBRAR, S/0 (antes se cobraba de nuevo)", p.campos.tipo_pago === "NO COBRAR" && p.campos.cobrar === "0" && p.campos.tipo_pedido === "SOLO-ENTREGA-NO-COBRAR", JSON.stringify(p.campos));
p = D.armarPedido({ nombre: "Solo mazo", whatsapp: "51922792281", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", kits: 0, pago: "Yape contraentrega S/69", empaque: "NO es kit: solo mazo Tarot Rider Waite de aprendizaje S/69", estado: "CONFIRMADO" }, ctx);
check("kits 0 con «contraentrega S/69» → se cobra S/69 YAPE y el producto es «Tarot de aprendizaje» (nombre del equipo)", p.listo && p.campos.cobrar === "69" && p.campos.tipo_pago === "YAPE" && p.campos.producto === "Tarot de aprendizaje" && /solo mazo/.test(p.campos.obs), JSON.stringify(p.campos));
p = D.armarPedido({ nombre: "Solo mazo sin monto", whatsapp: "51922792282", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", kits: 0, empaque: "NO lleva kit: solo mazo", estado: "CONFIRMADO" }, ctx);
check("kits 0 sin monto en ningún lado → BLOQUEO MONTO (no se inventa S/0)", !p.listo && p.bloqueos.some((b) => /^MONTO: no es un kit normal/.test(b)), JSON.stringify(p.bloqueos));
p = D.armarPedido({ nombre: "Saldo", whatsapp: "51940435388", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "Adelanto S/10; saldo S/79 contraentrega", estado: "CONFIRMADO" }, ctx);
check("«Adelanto S/10; saldo S/79» → se cobra el saldo S/79 y el pago NO va en la nota del motorizado (dueño 2026-11-11)", p.campos.cobrar === "79" && p.campos.tipo_pago === "YAPE" && !/adelanto|saldo|S\//i.test(p.campos.obs), JSON.stringify(p.campos));
// La nota del motorizado (dueño 2026-11-11): cómo contactar y dónde dejarlo; sin pagos, pines ni apuntes internos. Casos reales del 11/11.
const nm = (t, tel) => D.notaParaMotorizado(t, tel).nota;
check("nota: «ya pagó … NO cobrar» no va; el DNI de quien recibe sí", nm("Ya pagó S/89 por Yape (17:23, op 22639565, «Tarot Luciana»): NO cobrar. DNI de quien recibe 76163841. Pago: Pagado S/89", "982824025") === "DNI de quien recibe 76163841");
check("nota: «paga con Yape» fuera, el teléfono de contacto queda", nm("Tel de contacto 978319291; paga con Yape", "976373863") === "Tel de contacto 978319291");
check("nota: pin y coordenadas fuera (la etiqueta va pegada a la caja)", nm("Paga en efectivo. Pin del cliente (12°13'43.3\"S 76°55'01.0\"W), Villa El Salvador 4.ª etapa. Pago: Efectivo contraentrega S/89", "986421918") === "");
check("nota: apuntes internos fuera («confirmar, escribió dos versiones», «sin número en el CRM», el mismo teléfono de la etiqueta)",
  !/confirmar|versiones/.test(nm("Paga en efectivo; tel 921374691 (confirmar, escribió dos versiones)", "921374791")) && nm("Cliente sin número en el CRM (usa nombre de usuario de WhatsApp); cel 987213507", "987213507") === "" && nm("Dio su teléfono 935484310", "935484310") === "");
check("nota: lo que sirve para entregar queda", nm("Dejar en recepción y avisar al Dpto 102. Llamar antes de llegar", "9") === "Dejar en recepción y avisar al Dpto 102. Llamar antes de llegar" && nm("Contacto «El Papi» +51 991204483", "991204483") === "Contacto «El Papi» +51 991204483");
p = D.armarPedido({ nombre: "Cristofer", whatsapp: "51913097200", direccion_o_agencia: "Boulevard de Magdalena, Galería Malena, oficina 223, Magdalena del Mar", kits: 0, pago: "Efectivo contraentrega S/141 (cuenco S/72 + mazo S/69)",
  empaque: "NO es kit: Cuenco tibetano de sanación sonora 13 cm (S/72) + mazo Tarot Rider Waite de aprendizaje (S/69) · VERIFICAR, en el chat se le prometió: «11-10 08:32 V(Jennifer): Claro»", nota: "Pide la entrega el miércoles en la tarde; paga en efectivo", estado: "CONFIRMADO" }, ctx);
check("otro artículo con «VERIFICAR…» pegado: el producto es el NOMBRE de lo que va (no «Reposición / cambio»), S/141 EFECTIVO", p.campos.producto === "Cuenco tibetano de sanación sonora 13 cm + mazo Tarot Rider Waite de aprendizaje" && p.campos.cobrar === "141" && p.campos.tipo_pago === "EFECTIVO" && !/paga|S\//.test(p.campos.obs.split("Paquete:")[0]), JSON.stringify(p.campos));
p = D.armarPedido({ nombre: "Adelanto sin saldo", whatsapp: "51958345337", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", kits: 3, pago: "Adelanto S/100 Yape 11-01 22:47 (op. 346)", empaque: "3 kits (S/199) + cuencos tibetanos", estado: "CONFIRMADO" }, ctx);
check("3 kits con adelanto S/100 y sin saldo escrito → lista − adelanto = S/99 con aviso", p.campos.cobrar === "99" && p.alertas.some((a) => /adelanto S\/100/.test(a)), JSON.stringify(p));
p = D.armarPedido({ nombre: "Gold", whatsapp: "51997213231", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "Pagado S/129 por Yape", empaque: "NO es kit normal: lleva Tarot Gold Rider Waite S/129", estado: "CONFIRMADO" }, ctx);
check("otro artículo ya pagado → NO COBRAR y el extra va en el producto", p.campos.cobrar === "0" && p.campos.tipo_pago === "NO COBRAR" && /Tarot Gold/.test(p.campos.producto), JSON.stringify(p.campos));
p = D.armarPedido({ nombre: "Web 2 kits", whatsapp: "51958696861", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", kits: 2, pago: "Yape contraentrega S/149", empaque: "2 KITS (pedido web S/149)", estado: "CONFIRMADO" }, ctx);
check("empaque que solo repite «2 kits» no es extra: producto «2 Kits Tarot de aprendizaje», S/149", p.campos.producto === "2 Kits Tarot de aprendizaje" && p.campos.cobrar === "149" && !p.alertas.some((a) => /^EMPAQUE/.test(a)), JSON.stringify(p.campos));
p = D.armarPedido({ nombre: "Kit normal", whatsapp: "51959037748", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", empaque: "Kit normal (regalos del kit, sin extras)", estado: "CONFIRMADO" }, ctx);
check("«Kit normal (sin extras)» no es extra", p.campos.producto === "Kit Tarot de aprendizaje" && !/Paquete/.test(p.campos.obs), JSON.stringify(p.campos));
p = D.armarPedido({ nombre: "Efectivo exacto", whatsapp: "51935760271", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "Efectivo exacto S/89", estado: "CONFIRMADO" }, ctx);
check("«Efectivo exacto S/89» → EFECTIVO S/89", p.campos.cobrar === "89" && p.campos.tipo_pago === "EFECTIVO", JSON.stringify(p.campos));
p = D.armarPedido({ nombre: "Descuento", whatsapp: "51935760272", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "Contraentrega S/79 con descuento", estado: "CONFIRMADO" }, ctx);
check("monto negociado S/79 → se cobra S/79 y avisa que no es el de lista", p.campos.cobrar === "79" && p.alertas.some((a) => /distinto al de lista/.test(a)), JSON.stringify(p));
p = D.armarPedido({ nombre: "Explícito", whatsapp: "51935760273", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "Pagado S/89", cobrar: 20, estado: "CONFIRMADO" }, ctx);
check("`cobrar` explícito manda sobre el texto", p.campos.cobrar === "20" && p.campos.tipo_pago === "YAPE", JSON.stringify(p.campos));

p = D.armarPedido({ nombre: "Pin y texto", whatsapp: "51993455129", direccion_o_agencia: "Jr Los Cisnes Mz C Lt 16 Urb San Pedro, Surco (pin -12.1651891,-76.9978476)", estado: "CONFIRMADO" }, ctx);
check("al quitar el pin del texto no queda «(pin )» en la dirección", p.campos.direccion === "Jr Los Cisnes Mz C Lt 16 Urb San Pedro, Surco" && p.campos.coordenadas === "-12.1651891,-76.9978476", JSON.stringify(p.campos));

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

// Hora específica (dueño 2026-11-09): Dinsides reparte 12–5 pm; otra hora se pregunta (Dinsides o motorizado de confianza)
p = D.armarPedido({ nombre: "Hora", whatsapp: "51999999980", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", nota: "Pide que le lleguen a las 5 pm en punto, sale del trabajo", estado: "CONFIRMADO" }, ctx);
check("«a las 5 pm» → alerta HORA ESPECÍFICA (no bloquea)", p.listo && p.alertas.some((a) => /^HORA ESPECÍFICA/.test(a)), JSON.stringify(p.alertas));
p = D.armarPedido({ nombre: "Ventana", whatsapp: "51999999981", direccion_o_agencia: "Av Brasil 100, Pueblo Libre", pago: "Contraentrega S/89, 12-5 pm", nota: "la recibe ella", estado: "CONFIRMADO" }, ctx);
check("«12-5 pm» es la ventana normal: sin alerta de hora", !p.alertas.some((a) => /^HORA ESPECÍFICA/.test(a)), JSON.stringify(p.alertas));

// La observación de Dinsides es solo operativa; lo de la asesora (reprogramar, confirmar) sale como alerta (dueño 2026-11-09)
p = D.armarPedido({ nombre: "Mavel", whatsapp: "51999195063", direccion_o_agencia: "Calle Ramón Ribeyro 509, Miraflores", pago: "Pagado S/89", estado: "CONFIRMADO",
  nota: "🚨 Ya pagó S/89 por Yape (20:22, op 30121691): NO cobrar. Ella no está hasta las 5:30 pm; pide que le dejen el paquete por la ventana lateral abierta. También pidió reprogramar al miércoles 11-11: confirmar la fecha con ella." }, ctx);
check("«pidió reprogramar… confirmar la fecha» NO va en la observación de Dinsides; va como PARA LA ASESORA", !/reprogramar|confirmar la fecha/.test(p.campos.obs) && /ventana lateral/.test(p.campos.obs) && p.alertas.some((a) => /^NOTA PARA LA ASESORA.*reprogramar/.test(a)), JSON.stringify([p.campos.obs, p.alertas]));

p = D.armarPedido({ nombre: "Agendado", whatsapp: "51935760271", direccion_o_agencia: "Jr Granada 464, Dpto 104, Pueblo Libre", pago: "Efectivo exacto S/89", estado: "CONFIRMADO",
  nota: "Pidió que se la entreguen el LUNES 09-11, no mañana. Recibe Dante 935760271. Efectivo exacto S/89 · agendado desde el reporte del 2026-11-06" }, ctx);
check("la observación no lleva «agendado desde el reporte…» ni «, no mañana»", !/agendado desde el reporte|no mañana/.test(p.campos.obs) && /LUNES 09-11\. Recibe Dante/.test(p.campos.obs), p.campos.obs);
