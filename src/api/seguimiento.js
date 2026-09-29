/**
 * GET /api/seguimiento?c=TS-K3M582R
 *
 * Lo que alimenta la página de seguimiento del cliente. Sin login: el código es
 * toda la autenticación, por eso es aleatorio y por eso esta respuesta lleva
 * SOLO lo que el cliente puede ver de su propio envío.
 *
 * Fuera de la respuesta, deliberadamente:
 *   · DNI y WhatsApp — viven en la misma celda que la página nunca manda. El
 *     cliente ya sabe los suyos; están en la hoja porque los pide Shalom al
 *     registrar el envío, no para enseñárselos a quien tenga el link.
 *   · Notas    — son notas internas del vendedor sobre el cliente. Comparten
 *     celda con la clave, y de esa celda solo sale la clave (ver claveDe).
 *   · Drive ID — la foto se sirve por /v/<código>, nunca por el id de Drive.
 */
import { buscarVenta } from "../lib/ventas-hoja.js";
import { contarFotos } from "./crm/shalom.js";
import {
  ESTADOS_ENVIO,
  ESTADO_ESPERANDO,
  ENVIO_AGENCIA,
  pasosDe,
  claveDe,
  aNumero,
  diasEsperando,
  alertaDe,
  fechaSuelta
} from "../lib/ventas.js";

const json = (data, status = 200, segundos = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": segundos ? `public, max-age=${segundos}` : "no-store",
      // El seguimiento de un cliente no tiene por qué aparecer en Google.
      "X-Robots-Tag": "noindex, nofollow"
    }
  });

/**
 * Tope por IP. Usa su propio limitador y no el de /api/order: aquel deja pasar
 * 5 por minuto, y recargar la página de seguimiento tres veces seguidas no
 * tiene nada de sospechoso. Si el binding no existe, deja pasar.
 */
async function dentroDelLimite(env, ip) {
  if (!env.TRACK_LIMIT || !ip) return true;
  try {
    const { success } = await env.TRACK_LIMIT.limit({ key: ip });
    return success;
  } catch (err) {
    console.error("Rate limit seguimiento:", err.message);
    return true;
  }
}

/**
 * Traduce la fila de la hoja a lo que la página necesita.
 * Exportada para poder probarla sin red en `npm run check`.
 */
export function vistaPublica(venta, ahora = new Date(), fotos = 1) {
  const estado = ESTADOS_ENVIO.includes(venta["Estado"])
    ? venta["Estado"]
    : ESTADOS_ENVIO[0];

  const enAgencia = venta["Envío"] === ENVIO_AGENCIA;
  const enDestinoDesde = fechaSuelta(venta["En destino desde"]);

  // Los días esperando solo cuentan cuando hay una agencia donde esperar. Un
  // pedido que se entrega en casa no tiene reloj corriendo en contra, y
  // apurar a ese cliente sería inventarle una urgencia que no existe.
  const dias = enAgencia && estado === ESTADO_ESPERANDO
    ? diasEsperando(enDestinoDesde, ahora)
    : null;

  return {
    codigo: venta["Código"],
    estado,
    enAgencia,
    // Los pasos viajan desde el servidor porque dependen del tipo de envío:
    // a Lima no se le puede enseñar un "llegó a la agencia" que nunca ocurrirá.
    pasos: pasosDe(venta["Envío"], estado),
    // La clave solo aparece cuando ya sirve de algo: antes de que el paquete
    // llegue, enseñarla solo invita a que el cliente vaya a la agencia de balde.
    // Y solo con el saldo pagado: la clave es la garantía del cobro. Mientras
    // haya saldo, la página le dice cómo pagarlo y que ahí mismo le aparecerá.
    clave: enAgencia && estado === ESTADO_ESPERANDO && aNumero(venta["Saldo"]) <= 0
      ? claveDe(venta["Clave Shalom / Notas"])
      : "",
    claveTrasPago: enAgencia && estado === ESTADO_ESPERANDO && aNumero(venta["Saldo"]) > 0,
    saldo: Math.max(0, aNumero(venta["Saldo"])),
    fecha: venta["Fecha"],
    diasEsperando: dias,
    // Al cliente no le mostramos el escalón de alerta (es para el vendedor),
    // pero sí si ya conviene que se apure.
    apurar: Boolean(alertaDe(dias)),
    voucher: venta["Drive ID"] ? `/v/${venta["Código"]}` : null,
    // La boleta y las fotos del envío (subidas desde CRM → Links de Shalom).
    fotos: venta["Drive ID"]
      ? Array.from({ length: Math.max(1, fotos) }, (_, i) => `/v/${venta["Código"]}${i ? `?n=${i + 1}` : ""}`)
      : []
  };
}

/**
 * Pedidos de mentira para ver cómo se ve la página en cada etapa, sin tocar
 * la hoja ni datos de clientes: /TS-DEMO-PENDIENTE, -CAMINO, -DESTINO
 * (saldo por pagar), -CLAVE (saldo pagado: muestra la clave), -PAGADO,
 * -CANCELADO y -LIMA (entrega a domicilio). La foto es una del producto.
 */
const DEMOS = {
  "TS-DEMO-PENDIENTE": { Estado: "Pendiente", "Envío": "Shalom", Saldo: 69 },
  "TS-DEMO-CAMINO": { Estado: "En camino", "Envío": "Shalom", Saldo: 69, foto: true },
  "TS-DEMO-DESTINO": { Estado: "En destino", "Envío": "Shalom", Saldo: 69, foto: true, diasAtras: 1 },
  "TS-DEMO-CLAVE": { Estado: "En destino", "Envío": "Shalom", Saldo: 0, foto: true, diasAtras: 2 },
  "TS-DEMO-PAGADO": { Estado: "Pagado", "Envío": "Shalom", Saldo: 0, foto: true },
  "TS-DEMO-CANCELADO": { Estado: "Cancelado", "Envío": "Shalom", Saldo: 69 },
  "TS-DEMO-LIMA": { Estado: "En camino", "Envío": "Lima", Saldo: 0 }
};

export function ventaDemo(codigo, ahora = new Date()) {
  const d = DEMOS[String(codigo || "").toUpperCase()];
  if (!d) return null;
  const dia = (n) => new Date(ahora.getTime() - n * 86400000 - 5 * 3600000).toISOString().slice(0, 10);
  const venta = {
    "Código": String(codigo).toUpperCase(),
    Fecha: dia(3),
    Estado: d.Estado,
    "Envío": d["Envío"],
    Saldo: d.Saldo,
    "Clave Shalom / Notas": "3114",
    "En destino desde": d.diasAtras ? dia(d.diasAtras) : "",
    "Drive ID": d.foto ? "demo" : ""
  };
  const vista = vistaPublica(venta, ahora, 1);
  if (d.foto) {
    vista.voucher = "/kittarotcod/galeria/g1.webp";
    vista.fotos = [vista.voucher];
  }
  return vista;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const codigo = new URL(request.url).searchParams.get("c") || "";
  const demo = ventaDemo(codigo);
  if (demo) return json({ ok: true, envio: demo, demo: true }, 200, 60);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await dentroDelLimite(env, ip))) {
    return json({ error: "Demasiadas consultas. Espera un minuto." }, 429);
  }

  let venta;
  try {
    venta = await buscarVenta(env, codigo);
  } catch (err) {
    console.error("Sheets seguimiento:", err.message);
    return json({ error: "No pudimos consultar tu envío en este momento." }, 502);
  }

  // Mismo 404 para un código mal escrito que para uno que no existe: cualquier
  // diferencia entre los dos le diría a un curioso cuándo va por buen camino.
  if (!venta) {
    return json({ error: "No encontramos ningún envío con ese código." }, 404);
  }

  let fotos = 1;
  if (String(venta["Drive ID"] || "").startsWith("r2:")) {
    try {
      fotos = await contarFotos(env, venta["Código"]);
    } catch (err) {
      console.error("Fotos seguimiento:", err.message);
    }
  }
  return json({ ok: true, envio: vistaPublica(venta, new Date(), fotos) }, 200, 15);
}
