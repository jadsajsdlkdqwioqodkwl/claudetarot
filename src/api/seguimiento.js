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
export function vistaPublica(venta, ahora = new Date()) {
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
    clave: enAgencia && estado === ESTADO_ESPERANDO
      ? claveDe(venta["Clave Shalom / Notas"])
      : "",
    saldo: Math.max(0, aNumero(venta["Saldo"])),
    fecha: venta["Fecha"],
    diasEsperando: dias,
    // Al cliente no le mostramos el escalón de alerta (es para el vendedor),
    // pero sí si ya conviene que se apure.
    apurar: Boolean(alertaDe(dias)),
    voucher: venta["Drive ID"] ? `/v/${venta["Código"]}` : null
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const codigo = new URL(request.url).searchParams.get("c") || "";

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

  return json({ ok: true, envio: vistaPublica(venta) }, 200, 15);
}
