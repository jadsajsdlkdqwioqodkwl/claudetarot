/**
 * GET /api/seguimiento?c=TS-K3M582R
 *
 * Lo que alimenta la página de seguimiento del cliente de provincia. Sin
 * login: el código es toda la autenticación, por eso es aleatorio y por eso
 * esta respuesta lleva SOLO lo que el cliente puede ver de su propio envío.
 *
 * Fuera de la respuesta, deliberadamente:
 *   · WhatsApp — el código puede reenviarse; el teléfono no viaja con él.
 *   · Notas    — son notas internas del vendedor sobre el cliente.
 *   · Drive ID — la foto se sirve por /v/<código>, nunca por el id de Drive.
 */
import { buscarVenta } from "../lib/ventas-hoja.js";
import {
  ESTADOS_ENVIO,
  ESTADO_ESPERANDO,
  CANAL_AGENCIA,
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

  const enDestinoDesde = fechaSuelta(venta["En destino desde"]);
  const dias = estado === ESTADO_ESPERANDO ? diasEsperando(enDestinoDesde, ahora) : null;

  const precio = aNumero(venta["Precio"]);
  const adelanto = aNumero(venta["Adelanto"]);

  return {
    codigo: venta["Código"],
    cliente: venta["Cliente"],
    estado,
    canal: venta["Canal"],
    // Solo un envío por agencia obliga a llevar clave y DNI al mostrador.
    enAgencia: venta["Canal"] === CANAL_AGENCIA,
    producto: venta["Producto"],
    cantidad: venta["Cantidad"],
    ciudad: venta["Ciudad"],
    agencia: venta["Agencia / Dirección"],
    // La clave solo aparece cuando ya sirve de algo: antes de que el paquete
    // llegue, enseñarla solo invita a que el cliente vaya a la agencia de balde.
    clave: estado === ESTADO_ESPERANDO ? venta["Clave Shalom"] : "",
    precio,
    adelanto,
    // El saldo se recalcula acá y no se lee de la hoja: esa celda es una
    // fórmula y llega ya formateada como "S/ 45.00".
    saldo: Math.max(0, precio - adelanto),
    fecha: venta["Fecha"],
    diasEsperando: dias,
    // Al cliente no le mostramos el escalón de alerta (es para el vendedor),
    // pero sí si ya conviene que se apure.
    apurar: Boolean(alertaDe(dias)),
    voucher: venta["Drive ID"] ? `/v/${venta["Código"]}` : null,
    actualizado: venta["Actualizado"]
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
