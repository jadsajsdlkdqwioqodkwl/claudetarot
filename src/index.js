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

const ROUTES = {
  "/api/order": order,
  "/api/upsell": upsell
};

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const handler = ROUTES[pathname];

    if (!handler) return env.ASSETS.fetch(request);
    if (request.method !== "POST") {
      return json({ error: "Método no permitido." }, 405);
    }

    // Mismo contexto que recibían las Pages Functions, así los handlers
    // siguen siendo idénticos a como estaban en `functions/api/`.
    return handler({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
  }
};
