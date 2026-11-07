/**
 * Banco de recursos (dueño, 2026-11-07): pestaña «Recursos» del CRM. Fotos, videos y PDF (guardados en R2), links y
 * textos listos que el equipo descarga, copia o manda al chat, y que el asesor conoce por su título para recomendarlos
 * en `adjuntar` (GET /api/asesor/contexto → recursos).
 *
 * GET    /api/crm/recursos → { recursos: [{ id, tipo, titulo, descripcion, categoria, media_key, media_mime, url, texto, orden, created_by }] }
 * POST   /api/crm/recursos { tipo, titulo, descripcion?, categoria?, media_key? | url? | texto?, orden? }
 *        cualquier cuenta del equipo agrega (lo que la vendedora encuentra útil, o lo que el asesor pidió que se suba).
 * PATCH  /api/crm/recursos (admin) { id, titulo?, descripcion?, categoria?, url?, texto?, orden? }
 * DELETE /api/crm/recursos (admin) { id } → lo deja inactivo (el archivo sigue en R2; ningún recurso se pierde).
 */
import { conAuth, conAdmin } from "../../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export const TIPOS_RECURSO = ["foto", "video", "pdf", "link", "texto"];
const corto = (v, n) => String(v ?? "").trim().slice(0, n) || null;

async function get({ env }) {
  const { results } = await env.CRM_DB.prepare(
    "SELECT id, tipo, titulo, descripcion, categoria, media_key, media_mime, url, texto, orden, created_by, created_at FROM recursos WHERE activo = 1 ORDER BY categoria, orden, id"
  ).all().catch(() => ({ results: [] }));
  return json({ recursos: results || [] });
}

/** Valida y normaliza un recurso nuevo; devuelve { error } o los campos. */
export function validarRecurso(p) {
  const tipo = String(p?.tipo || "");
  if (!TIPOS_RECURSO.includes(tipo)) return { error: "Tipo inválido (foto, video, pdf, link o texto)." };
  const titulo = corto(p?.titulo, 120);
  if (!titulo) return { error: "Ponle un título (así lo nombra el asesor)." };
  const r = { tipo, titulo, descripcion: corto(p?.descripcion, 500), categoria: corto(p?.categoria, 60), media_key: null, media_mime: null, url: null, texto: null, orden: Number(p?.orden) || 0 };
  if (tipo === "link") {
    r.url = corto(p?.url, 1000);
    if (!r.url || !/^https?:\/\//i.test(r.url)) return { error: "El link tiene que empezar con http:// o https://." };
  } else if (tipo === "texto") {
    r.texto = corto(p?.texto, 4000);
    if (!r.texto) return { error: "Falta el texto." };
  } else {
    r.media_key = corto(p?.media_key, 300);
    if (!r.media_key) return { error: "Falta el archivo." };
    r.media_mime = corto(p?.media_mime, 100);
  }
  return r;
}

async function post({ request, env, agent }) {
  const r = validarRecurso(await request.json().catch(() => null));
  if (r.error) return json(r, 400);
  const { meta } = await env.CRM_DB.prepare(
    "INSERT INTO recursos (tipo, titulo, descripcion, categoria, media_key, media_mime, url, texto, orden, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(r.tipo, r.titulo, r.descripcion, r.categoria, r.media_key, r.media_mime, r.url, r.texto, r.orden, agent?.displayName || agent?.username || null).run();
  return json({ ok: true, id: meta?.last_row_id });
}

async function patch({ request, env }) {
  const p = await request.json().catch(() => null);
  const id = Number(p?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  const campos = [];
  const valores = [];
  for (const [k, n] of [["titulo", 120], ["descripcion", 500], ["categoria", 60], ["url", 1000], ["texto", 4000]]) {
    if (p[k] === undefined) continue;
    if (k === "titulo" && !corto(p[k], n)) return json({ error: "El título no puede quedar vacío." }, 400);
    campos.push(`${k} = ?`);
    valores.push(corto(p[k], n));
  }
  if (p.orden !== undefined) { campos.push("orden = ?"); valores.push(Number(p.orden) || 0); }
  if (!campos.length) return json({ error: "Nada que cambiar." }, 400);
  await env.CRM_DB.prepare(`UPDATE recursos SET ${campos.join(", ")} WHERE id = ?`).bind(...valores, id).run();
  return json({ ok: true });
}

async function del({ request, env }) {
  const id = Number((await request.json().catch(() => null))?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  await env.CRM_DB.prepare("UPDATE recursos SET activo = 0 WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAdmin(patch);
export const onRequestDelete = conAdmin(del);
