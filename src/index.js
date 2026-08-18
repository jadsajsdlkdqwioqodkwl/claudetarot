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

const ROUTES = {
  "/api/order": { POST: order },
  "/api/upsell": { POST: upsell },
  "/api/diag": { GET: diag },
  "/api/setup": { POST: setup }
};

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
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
