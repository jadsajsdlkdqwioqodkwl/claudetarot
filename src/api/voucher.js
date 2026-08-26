/**
 * GET /v/TS-K3M582R — la foto del voucher de envío.
 *
 * La foto vive en TU Drive, no en un bucket ni en la hoja. La sube el Apps
 * Script, que corre con tu cuenta de Google y por lo tanto con tus 15 GB. La
 * service account NO puede ser la dueña del archivo: las cuentas de servicio
 * tienen 0 bytes de cuota en Drive y cualquier subida suya muere con
 * "storageQuotaExceeded". Es el error clásico de este montaje.
 *
 * El Worker hace de intermediario en vez de mandar al cliente a Drive:
 *   · La URL queda en tu dominio y no delata dónde guardas nada.
 *   · La CSP de public/_headers sigue con img-src 'self', sin abrirle la
 *     puerta a googleusercontent.
 *   · El id de Drive nunca sale al navegador, así que nadie puede recorrer
 *     tu carpeta a partir de una foto.
 */
import { buscarVenta } from "../lib/ventas-hoja.js";
import { esCodigo } from "../lib/ventas.js";

/** Minutos que el borde guarda la foto. Corto porque puedes reemplazarla. */
const CACHE_SEGUNDOS = 300;

/** Ancho al que pedimos la foto: suficiente para leer un voucher en pantalla. */
const ANCHO = 1400;

/**
 * Un id de Drive y nada más. La celda la escribe una macro, pero esto sale a
 * internet con lo que diga esa celda: sin este filtro, pegar una URL entera
 * en la columna convertiría el endpoint en un proxy hacia donde sea.
 */
const RE_DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

/**
 * Tres formas de pedirle la misma imagen a Google, de mejor a peor.
 *
 * La primera es el CDN de fotos y es la que responde bien casi siempre. Las
 * otras dos existen porque Drive a veces contesta la primera con un HTML de
 * "no se puede previsualizar" en vez de la imagen, y en ese caso el cliente
 * vería un cuadro roto sin que nadie se entere.
 */
const FUENTES = [
  (id) => `https://lh3.googleusercontent.com/d/${id}=w${ANCHO}`,
  (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w${ANCHO}`,
  (id) => `https://drive.google.com/uc?export=download&id=${id}`
];

const error = (mensaje, status) =>
  new Response(mensaje, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });

/** Baja la imagen de la primera fuente que devuelva de verdad una imagen. */
async function traerImagen(driveId) {
  for (const construir of FUENTES) {
    let res;
    try {
      res = await fetch(construir(driveId), { redirect: "follow" });
    } catch (err) {
      console.error("Voucher, fuente caída:", err.message);
      continue;
    }

    const tipo = res.headers.get("Content-Type") || "";
    // Un 200 con text/html es la pantalla de error de Drive, no la foto.
    if (res.ok && tipo.startsWith("image/")) return { cuerpo: res.body, tipo };
  }
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // "/v/TS-K3M582R" y también "/v/TS-K3M582R.jpg", por si se pega con extensión.
  const codigo = decodeURIComponent(new URL(request.url).pathname.slice(3))
    .replace(/\.(jpe?g|png|webp)$/i, "")
    .trim()
    .toUpperCase();

  if (!esCodigo(codigo)) return error("Código inválido.", 404);

  let venta;
  try {
    venta = await buscarVenta(env, codigo);
  } catch (err) {
    console.error("Sheets voucher:", err.message);
    return error("No pudimos leer el envío.", 502);
  }

  const driveId = venta?.["Drive ID"] || "";
  if (!RE_DRIVE_ID.test(driveId)) return error("Este envío todavía no tiene voucher.", 404);

  const imagen = await traerImagen(driveId);
  if (!imagen) return error("No pudimos cargar la foto del voucher.", 502);

  return new Response(imagen.cuerpo, {
    headers: {
      "Content-Type": imagen.tipo,
      "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}`,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
