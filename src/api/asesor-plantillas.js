/**
 * Plantillas para Meta desde una sesión o Routine de Claude Code (clave del asesor), sin pasar por el CRM.
 *
 * GET  /api/asesor/plantillas-meta            → { marcas: [{ marca, propuestas: [{ nombre, titulo, estado }] }] }
 * POST /api/asesor/plantillas-meta { marca?: "tarot", nombres: [...], reenviar?: bool } → { resultados }
 *      Manda a revisión de Meta las propuestas nombradas (las mismas que el admin ve en Herramientas → Plantillas
 *      para Meta). Solo lo que el dueño pidió por escrito: cada envío a un cliente fuera de los 7 días del anuncio se paga.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { estadoDePropuestas, mandarPropuestas } from "../lib/plantillas-propuestas.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function puerta(request, env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  return null;
}

export async function onRequestGet({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const marcas = await estadoDePropuestas(env);
  return json({ marcas: marcas.map((m) => ({ marca: m.marca, conectada: m.conectada, aviso: m.aviso || null, propuestas: m.propuestas.map((p) => ({ nombre: p.nombre, titulo: p.titulo, grupo: p.grupo, estado: p.estado })) })) });
}

export async function onRequestPost({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const p = await request.json().catch(() => null);
  const nombres = (Array.isArray(p?.nombres) ? p.nombres : []).map(String).slice(0, 30);
  if (!nombres.length) return json({ error: "Faltan nombres." }, 400);
  return json({ resultados: await mandarPropuestas(env, p.marca || "tarot", nombres, Boolean(p.reenviar)) });
}
