/**
 * Prueba la lógica pura del Apps Script sin subirlo a Google: `npm run check:gs`
 *
 * Apps Script no se puede ejecutar aquí, pero las funciones de cálculo son
 * JavaScript normal. Se evalúan en un sandbox con las APIs de Google apagadas,
 * que es justo lo que no usan.
 */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "OK " : "FALLA"} ${name}${cond || !detail ? "" : ` -- ${detail}`}`);
};

// Las funciones con guion bajo final tocan Google; las de abajo son puras.
const contexto = createContext({ console });
runInContext(readFileSync(join(root, "apps-script/CRM.gs"), "utf8"), contexto);
const { parsearFecha, filtrarPorRango, sumarTotales, agruparPorDia,
        normalizarTelefono, construirEvento, debeReportarse } = contexto;
// Las const del script no se cuelgan del contexto; se leen evaluando dentro.
const { COL } = runInContext("({ COL })", contexto);
// Las fechas tienen que nacer dentro del sandbox: un Date de Node no pasa el
// instanceof de otro realm, igual que no fallaría en Apps Script.
const Fecha = runInContext("Date", contexto);

const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const dia = (d, h = 12) => new Fecha(2026, 7, d, h, 30);
const pedido = (d, estado, total, extra = {}) => Object.assign({
  fila: d, fecha: dia(d), nombre: "Ana Lucía Rojas", telefono: "987654321",
  producto: "1 Kit de Tarot Completo", total, estado, fbp: "", fbc: "",
  eventId: "TK-AAA111", userAgent: "Mozilla/5.0", ip: "190.0.0.1", capi: ""
}, extra);

/* Fechas */
check("lee dd/mm/aaaa", parsearFecha("05/09/2026")?.getMonth() === 8);
check("lee aaaa-mm-dd", parsearFecha("2026-09-05")?.getDate() === 5);
check("rechaza basura", parsearFecha("mañana") === null);

/* Rango inclusivo en ambos extremos */
const datos = [pedido(15, "Pagado", 79), pedido(16, "Pendiente", 139),
               pedido(17, "Pagado", 169), pedido(18, "Enviado", 79)];
check("el rango incluye el primer día", filtrarPorRango(datos, dia(15, 0), dia(17, 0)).length === 3);
check("el rango incluye el último día aunque el pedido sea de la tarde",
  filtrarPorRango(datos, dia(17, 0), dia(17, 0)).length === 1);
check("deja fuera lo anterior al rango", filtrarPorRango(datos, dia(16, 0), dia(18, 0)).length === 3);

/* Totales */
const t = sumarTotales(datos);
check("cuenta los leads", t.leads === 4);
check("cerrados = enviados + pagados", t.cerrados === 3, String(t.cerrados));
check("solo cobra lo pagado", t.cobrado === 79 + 169, String(t.cobrado));
check("el potencial suma todo", t.potencial === 79 + 139 + 169 + 79);
check("ticket promedio sobre lo pagado", t.ticket === (79 + 169) / 2);
check("tasa de cierre", t.cierre === 2 / 4);
check("sin pedidos no divide por cero", sumarTotales([]).ticket === 0 && sumarTotales([]).cierre === 0);

/* Agrupación por día, del más reciente al más antiguo */
const dias = agruparPorDia(datos);
check("un renglón por día", dias.length === 4);
check("ordenado del más reciente al más antiguo",
  dias[0].dia.getDate() === 18 && dias[3].dia.getDate() === 15);
check("dos pedidos del mismo día se juntan",
  agruparPorDia([pedido(15, "Pagado", 79), pedido(15, "Pagado", 30)])[0].cobrado === 109);

/* Teléfono en el formato que Meta espera */
check("añade el código de país", normalizarTelefono("987654321") === "51987654321");
check("respeta el número que ya lo trae", normalizarTelefono("+51 987 654 321") === "51987654321");
check("sin teléfono devuelve vacío", normalizarTelefono("") === "");

/* Evento de la Conversions API */
const ahora = Math.floor(dia(18).getTime() / 1000);
const ev = construirEvento(pedido(17, "Pagado", 169), ahora, 6, sha);
check("es un Purchase", ev.event_name === "Purchase");
check("manda el total real", ev.custom_data.value === 169 && ev.custom_data.currency === "PEN");
check("usa el Event ID de la hoja para deduplicar", ev.event_id === "TK-AAA111");
check("el teléfono va hasheado", ev.user_data.ph[0] === sha("51987654321"));
check("el nombre va hasheado y separado",
  ev.user_data.fn[0] === sha("ana") && ev.user_data.ln[0] === sha("rojas"));
check("no manda datos personales en claro",
  !JSON.stringify(ev).includes("987654321") && !JSON.stringify(ev).toLowerCase().includes("ana l"));
check("incluye IP y user agent", ev.user_data.client_ip_address === "190.0.0.1");
check("omite fbp y fbc cuando no hay", ev.user_data.fbp === undefined && ev.user_data.fbc === undefined);

const conCookies = construirEvento(pedido(17, "Pagado", 79, { fbp: "fb.1.9.1", fbc: "fb.1.9.abc" }), ahora, 6, sha);
check("manda fbp y fbc sin hashear cuando existen",
  conCookies.user_data.fbp === "fb.1.9.1" && conCookies.user_data.fbc === "fb.1.9.abc");

/* La ventana de 7 días de Meta */
const viejo = construirEvento(pedido(1, "Pagado", 79), ahora, 6, sha);
check("un pedido viejo se reporta con la fecha de cobro", viejo.event_time === ahora);
check("un pedido reciente conserva su fecha", ev.event_time === Math.floor(dia(17).getTime() / 1000));
check("nunca manda un evento en el futuro",
  construirEvento(pedido(20, "Pagado", 79), ahora, 6, sha).event_time <= ahora);

/* La columna CAPI no pisa las del Worker */
check("CAPI es la columna P, después de las 15 del Worker", COL.CAPI === 16);


/* La regla del envío automático: cuándo toca reportar una fila */
check("una venta pagada sin marca se reporta", debeReportarse("Pagado", "") === true);
check("un pedido pendiente no se reporta", debeReportarse("Pendiente", "") === false);
check("una venta ya enviada no se vuelve a cobrar",
  debeReportarse("Pagado", "✅ CAPI enviado 20/08/2026 10:00") === false);
check("un intento fallido sí se reintenta",
  debeReportarse("Pagado", "❌ Invalid access token") === true);
check("aguanta espacios y celdas vacías",
  debeReportarse("  Pagado ", "   ") === true && debeReportarse("", "") === false);

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
