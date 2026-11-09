/**
 * Revisión interactiva de envíos (dueño 2026-11-09): la página /r/<id>.html que arma `dinsides.py presentar --pdf` deja que una persona
 * marque, por pedido, OK / corrección (texto) / no va, y lo que marcó lo lee la Routine con `dinsides.py notas <id>`.
 *
 * POST /api/asesor/revision          (x-asesor-clave) { id, token, fecha, pedidos: [{ whatsapp, nombre, tipo }] } → crea el registro.
 * GET  /api/asesor/revision?id=      (x-asesor-clave) → { id, fecha, pedidos, notas: { whatsapp: { decision, texto, cuando } } }
 * POST /api/revision/nota            (público, con el token que lleva la página) { id, token, whatsapp, decision, texto } → guarda.
 * Nada de esto escribe a clientes ni registra pedidos: solo guarda lo que la persona marcó. Memoria: R2 revision/<id>.json.
 */
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
const RE_ID = /^[a-z0-9-]{8,120}$/;
const leer = (env, id) => env.CRM_MEDIA.get(`revision/${id}.json`).then((o) => (o ? o.json() : null));
const escribir = (env, id, d) => env.CRM_MEDIA.put(`revision/${id}.json`, JSON.stringify(d), { httpMetadata: { contentType: "application/json" } });
const ahoraLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);

export async function onRequestPostRevision({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const p = await request.json().catch(() => null);
  const id = String(p?.id || "").replace(/\.html$/, "");
  if (!RE_ID.test(id) || !p?.token || !Array.isArray(p?.pedidos)) return json({ error: "Faltan id, token o pedidos." }, 400);
  const prev = (await leer(env, id).catch(() => null)) || {};
  await escribir(env, id, { id, token: String(p.token), fecha: p.fecha || "", creado: prev.creado || ahoraLima(), pedidos: p.pedidos.slice(0, 200), notas: prev.notas || {} });
  return json({ ok: true, id });
}

export async function onRequestGetRevision({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const id = String(new URL(request.url).searchParams.get("id") || "").replace(/\.html$/, "");
  if (!RE_ID.test(id)) return json({ error: "Falta id." }, 400);
  const d = await leer(env, id);
  if (!d) return json({ error: "No existe esa revisión." }, 404);
  const { token, ...resto } = d;
  return json({ ok: true, ...resto });
}

/** Público: lo llama la página. El token de la página es la única llave (como el link del PDF: imposible de adivinar). */
export async function onRequestPostNota({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST" } });
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  const p = await request.json().catch(() => null);
  const id = String(p?.id || "").replace(/\.html$/, "");
  if (!RE_ID.test(id) || !p?.token) return json({ error: "Faltan id o token." }, 400);
  const d = await leer(env, id);
  if (!d || d.token !== String(p.token)) return json({ error: "Revisión no válida." }, 403);
  const wa = String(p.whatsapp || "").replace(/\D/g, "");
  if (!wa) return json({ error: "Falta whatsapp." }, 400);
  const decision = ["ok", "correccion", "no_va", "ya_enviado", "pendiente", ""].includes(String(p.decision || "")) ? String(p.decision || "") : "";
  d.notas[wa] = { decision, texto: String(p.texto || "").slice(0, 600), cuando: ahoraLima() };
  await escribir(env, id, d);
  return json({ ok: true, guardadas: Object.keys(d.notas).length });
}
