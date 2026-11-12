/**
 * Revisión interactiva de envíos (dueño 2026-11-09): la página /r/<id>.html que arma `dinsides.py presentar --pdf` deja que una persona
 * marque, por pedido, OK / corrección (texto) / no va, y lo que marcó lo lee la Routine con `dinsides.py notas <id>`.
 *
 * POST /api/asesor/revision          (x-asesor-clave) { id, token, fecha, pedidos: [{ whatsapp, nombre, tipo }] } → crea el registro.
 * GET  /api/asesor/revision?id=      (x-asesor-clave) → { id, fecha, pedidos, notas: { whatsapp: { decision, texto, cuando } } }
 * POST /api/revision/nota            (público, con el token que lleva la página) { id, token, whatsapp, decision, texto } → guarda.
 *
 * LINK FIJO POR DÍA (dueño 2026-11-11: «esta revisión es fija; si la quiere actualizar pierde su progreso»):
 * POST /api/asesor/revision { dia: true, fecha, pedidos }            → crea o reutiliza la revisión `envios-FECHA` (mismo token y mismo
 *      link todo el día), conserva las notas (van por WhatsApp del pedido, no por página) y dice cuáles pedidos son NUEVOS.
 * POST /api/asesor/revision { dia: true, fecha, pagina: "<id>.html" } → apunta el link fijo a la última página generada.
 * GET  /r/envios-FECHA-<clave>   (público, clave imposible de adivinar) → sirve esa última página (reportes.js → paginaDelDia).
 * POST /api/revision/nota { …, leer: true }                           → las notas guardadas (la página las pinta al abrir).
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
  if (p?.dia) return revisionDelDia(request, env, p);
  const id = String(p?.id || "").replace(/\.html$/, "");
  if (!RE_ID.test(id) || !p?.token || !Array.isArray(p?.pedidos)) return json({ error: "Faltan id, token o pedidos." }, 400);
  const prev = (await leer(env, id).catch(() => null)) || {};
  await escribir(env, id, { id, token: String(p.token), fecha: p.fecha || "", creado: prev.creado || ahoraLima(), pedidos: p.pedidos.slice(0, 200), notas: prev.notas || {} });
  return json({ ok: true, id });
}

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const n9 = (v) => String(v || "").replace(/\D/g, "").slice(-9);

/** Revisión única del despacho de una fecha: mismo link y mismas notas aunque la página se regenere diez veces. */
async function revisionDelDia(request, env, p) {
  const fecha = String(p.fecha || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "Falta fecha AAAA-MM-DD." }, 400);
  const id = `envios-${fecha}`;
  const prev = (await leer(env, id).catch(() => null)) || null;
  const d = prev || { id, fecha, token: hex(18), clave: hex(8), creado: ahoraLima(), pedidos: [], notas: {}, vistos: {} };
  d.vistos = d.vistos || {};
  let nuevos = [];
  if (Array.isArray(p.pedidos)) {
    const ped = p.pedidos.slice(0, 200);
    // NUEVO = no estaba en ninguna versión anterior de la página de hoy (en la primera versión nada es «nuevo»).
    nuevos = prev ? ped.filter((x) => n9(x.whatsapp) && !d.vistos[n9(x.whatsapp)]).map((x) => String(x.whatsapp)) : [];
    for (const x of ped) if (n9(x.whatsapp) && !d.vistos[n9(x.whatsapp)]) d.vistos[n9(x.whatsapp)] = ahoraLima();
    d.pedidos = ped;
    d.versiones = (d.versiones || 0) + 1;
  }
  if (p.pagina && /^[a-z0-9-]{8,120}\.html$/.test(String(p.pagina))) d.pagina = String(p.pagina);
  d.actualizado = ahoraLima();
  await escribir(env, id, d);
  return json({ ok: true, id, token: d.token, notas: d.notas || {}, nuevos, versiones: d.versiones || 1, url: `${new URL(request.url).origin}/r/${id}-${d.clave}` });
}

/** GET /r/envios-FECHA-<clave>: la última página de revisión de ese despacho (la llama reportes.js). */
export async function paginaDelDia(env, ruta) {
  const m = /^(envios-\d{4}-\d{2}-\d{2})-([a-f0-9]{16})$/.exec(String(ruta || ""));
  if (!m || !env.CRM_MEDIA) return null;
  const d = await leer(env, m[1]).catch(() => null);
  if (!d || d.clave !== m[2] || !d.pagina) return null;
  const obj = await env.CRM_MEDIA.get(`reportes/${d.pagina}`);
  if (!obj) return null;
  return new Response(obj.body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
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
  if (p.leer) {
    const salida = { ok: true, notas: d.notas || {}, actualizado: d.actualizado || d.creado || "" };
    // { chats: true }: botón «Actualizar» de la página. Los últimos mensajes de CADA pedido de esta revisión (solo esos WhatsApp),
    // leídos en vivo del CRM, y queda anotado que la asesora pidió actualizar (lo ve Claude con `dinsides.py notas`).
    if (p.chats && env.CRM_DB) {
      salida.chats = {};
      for (const ped of (d.pedidos || []).slice(0, 40)) {
        const wa = String(ped.whatsapp || "").replace(/\D/g, "");
        if (wa.length < 9) continue;
        try {
          const { results } = await env.CRM_DB.prepare(
            `SELECT m.direction, m.type, m.body, m.created_at FROM messages m JOIN conversations conv ON conv.id = m.conversation_id JOIN contacts c ON c.id = conv.contact_id
             WHERE substr(c.wa_id, -9) = ? AND m.type IN ('text', 'location', 'image', 'contacts', 'audio') ORDER BY m.id DESC LIMIT 25`
          ).bind(wa.slice(-9)).all();
          salida.chats[wa] = (results || []).reverse().map((m) => ({ t: String(m.created_at || "").slice(0, 16), q: m.direction === "in" ? "C" : "V",
            b: m.type === "location" ? "[UBICACIÓN] " + String(m.body || "").split("|").slice(0, 2).join(",") : m.type === "image" ? "[imagen]" : m.type === "audio" ? "[audio]"
              : String(m.body || "").replace(/\s+/g, " ").slice(0, 260) }));
        } catch (err) { console.error("revision chats:", err.message); }
      }
      d.pidio_actualizar = ahoraLima();
      await escribir(env, id, d);
    }
    return json(salida);
  }
  const wa = String(p.whatsapp || "").replace(/\D/g, "");
  if (!wa) return json({ error: "Falta whatsapp." }, 400);
  const decision = ["ok", "correccion", "no_va", "ya_enviado", "pendiente", ""].includes(String(p.decision || "")) ? String(p.decision || "") : "";
  d.notas[wa] = { decision, texto: String(p.texto || "").slice(0, 600), cuando: ahoraLima() };
  await escribir(env, id, d);
  return json({ ok: true, guardadas: Object.keys(d.notas).length });
}
