/**
 * Punto de entrada del Worker.
 *
 * Cloudflare sirve primero los archivos de `public/`; solo cuando la ruta no
 * corresponde a un archivo llega aquí. Por eso el router se ocupa únicamente
 * de la API y delega todo lo demás al binding ASSETS.
 *
 * Este archivo es lo que convierte el proyecto en un Worker "de verdad".
 * Sin él Cloudflare lo trata como sitio estático y no deja definir variables.
 */

import { onRequestPost as order } from "./api/order.js";
import { onRequestPost as upsell } from "./api/upsell.js";
import { onRequestGet as diag } from "./api/diag.js";
import { onRequestPost as setup } from "./api/setup.js";
import { onRequestGet as seguimiento } from "./api/seguimiento.js";
import { onRequestGet as voucher } from "./api/voucher.js";

const ROUTES = {
  "/api/order": { POST: order },
  "/api/upsell": { POST: upsell },
  "/api/diag": { GET: diag },
  "/api/setup": { POST: setup },
  "/api/seguimiento": { GET: seguimiento }
};

/**
 * La página de seguimiento cuelga de la raíz: /TS-K3M582R, no /seguimiento/…
 * Es un link que se manda por WhatsApp y cuanto más corto, mejor. Nada más en
 * el sitio empieza por "TS-", así que no puede chocar con un archivo de public/.
 *
 * A propósito es más flojo que RE_CODIGO (lib/ventas.js), la forma real del
 * código: quien escriba mal una letra al copiar el link merece la página
 * diciéndole que ese envío no existe, no el 404 pelado de Cloudflare. Quien
 * valida de verdad es /api/seguimiento, y de ahí sale el mensaje.
 */
const RE_RUTA_SEGUIMIENTO = /^\/TS-[A-Za-z0-9-]{3,24}$/i;

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

/**
 * Sirve public/seguimiento.html bajo la URL con el código. La página lee el
 * código de su propia URL y le pide los datos a /api/seguimiento.
 *
 * Se sirve el mismo archivo para todos los códigos a propósito: así el HTML se
 * cachea una vez y solo viaja el JSON, que es lo que cambia. La cabecera
 * noindex va acá y no en _headers porque _headers casa rutas de archivos, y
 * esta ruta no existe como archivo.
 */
async function paginaDeSeguimiento(request, env) {
  const url = new URL("/seguimiento.html", request.url);
  const res = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // /v/TS-… es la foto del voucher: lleva el código en la ruta, así que no
    // puede resolverse por la tabla de arriba.
    if (pathname.startsWith("/v/")) {
      return request.method === "GET"
        ? voucher({ request, env, waitUntil: ctx.waitUntil.bind(ctx) })
        : json({ error: "Método no permitido." }, 405);
    }

    if (RE_RUTA_SEGUIMIENTO.test(pathname)) {
      return paginaDeSeguimiento(request, env);
    }

    const metodos = ROUTES[pathname];
    if (!metodos) return env.ASSETS.fetch(request);

    const handler = metodos[request.method];
    if (!handler) {
      return json({ error: "Método no permitido." }, 405);
    }

    // Mismo contexto que recibían las Pages Functions, así los handlers
    // siguen siendo idénticos a como estaban en `functions/api/`.
    return handler({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
  }
};
