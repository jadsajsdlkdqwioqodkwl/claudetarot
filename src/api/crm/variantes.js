/**
 * Pruebas de mensajes: versiones del texto de una respuesta rápida o de un
 * paso de la bienvenida. Ver crm-variantes.js.
 *
 * Ver, agregar y editar: todo el equipo (las vendedoras son las que mejor
 * saben cómo decirlo). Ordenarlas y elegir la predeterminada: todo el equipo. Cerrar la prueba y
 * quitar versiones: solo el admin.
 *
 * GET    /api/crm/variantes?tipo=rapida|bienvenida&ref_id=N
 *        → { original, versiones: [{ id (0 = original), texto, usos,
 *            respondieron, avanzaron, cerraron, editadas, peso, origen, motivo }] }
 *        Sin ref_id: todas las pruebas en curso de ese tipo.
 * POST   { tipo, ref_id, texto, motivo?, unico?, media_key?, media_type?, media_mime?, catalogo?, catalogo_nombre? }
 *        → agrega una versión. `catalogo` (solo respuesta rápida): con qué
 *        sale esa versión — null = igual que la respuesta, "-" = sus
 *        fotos/videos, "*" = catálogo completo, o el retailer_id de un
 *        producto. Para probar fotos contra catálogo el texto puede ir vacío:
 *        se usa el de la respuesta. `unico` (solo el primer paso de la bienvenida):
 *        esa versión reemplaza toda la secuencia, con una foto/video opcional.
 * PATCH  { id, texto, catalogo?, catalogo_nombre? } → edita una versión: la vieja se retira (con sus
 *        números) y entra la nueva, que empieza de 0 — es otro mensaje.
 * PATCH  { tipo, ref_id, ganadora } → (admin) cierra la prueba: `ganadora`
 *        (id, 0 = la original) queda como el texto de siempre
 * PATCH  { tipo, ref_id, orden: [ids] | null } → (todo el equipo) ordena las
 *        versiones sin cerrar la prueba: la primera es la predeterminada (sale
 *        al tocar el mensaje, sin sorteo) y los botones 1·2·3·4 siguen ese
 *        orden. null = volver a que el CRM sortee.
 * DELETE { id } → (admin) retira una sola versión
 */

import { conAuth } from "../../lib/crm-auth.js";
import { versionesEnPrueba, estadisticas, cerrarPrueba, guardarOrden, reemplazarEnOrden } from "../../lib/crm-variantes.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const TABLAS = { rapida: "quick_replies", bienvenida: "welcome_steps" };
const quien = (agent) => agent?.displayName || agent?.username || "admin";
const esAdmin = (agent) => !agent || agent.role === "admin";
/** Con qué sale una versión de respuesta rápida (ver POST). undefined = no vino. */
function leerEnvio(p) {
  if (!p || !("catalogo" in p)) return undefined;
  const catalogo = p.catalogo ? String(p.catalogo).slice(0, 100) : null;
  const nombre = catalogo && catalogo !== "*" && catalogo !== "-" && p.catalogo_nombre ? String(p.catalogo_nombre).slice(0, 120) : null;
  return { catalogo, nombre };
}
const soloAdmin = () => json({ error: "Solo el admin cierra pruebas o quita versiones." }, 403);

async function get({ request, env }) {
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  if (!TABLAS[tipo]) return json({ error: "tipo inválido." }, 400);
  const refId = Number(url.searchParams.get("ref_id")) || null;
  const pruebas = await versionesEnPrueba(env.CRM_DB, tipo, refId ? [refId] : null);
  if (!refId) return json({ pruebas });

  const actual = await env.CRM_DB.prepare(`SELECT body FROM ${TABLAS[tipo]} WHERE id = ?`).bind(refId).first();
  if (!actual) return json({ error: "No encontrado." }, 404);
  let versiones = pruebas[refId];
  if (!versiones) {
    // Sin prueba en curso: igual se muestran los números de la original.
    const [n] = await estadisticas(env.CRM_DB, tipo, [refId]);
    versiones = [{ id: 0, texto: null, usos: n?.usos || 0, respondieron: n?.respondieron || 0, avanzaron: n?.avanzaron || 0, cerraron: n?.cerraron || 0, editadas: n?.editadas || 0, peso: 1 }];
  }
  return json({ original: actual.body || "", versiones });
}

async function post({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  const refId = Number(p?.ref_id);
  let texto = String(p?.texto || "").trim().slice(0, 4096);
  const envio = p?.tipo === "rapida" ? leerEnvio(p) : undefined;
  if (!TABLAS[p?.tipo] || !refId || (!texto && !envio?.catalogo)) return json({ error: "Falta tipo, ref_id o texto." }, 400);
  const existe = await env.CRM_DB.prepare(`SELECT body FROM ${TABLAS[p.tipo]} WHERE id = ?`).bind(refId).first();
  if (!existe) return json({ error: "No encontrado." }, 404);
  // Misma frase, otro envío (fotos vs catálogo): va el texto de la respuesta.
  if (!texto) texto = existe.body || "";
  const { n } = await env.CRM_DB.prepare("SELECT COUNT(*) AS n FROM variantes WHERE tipo = ? AND ref_id = ? AND estado = 'activa'").bind(p.tipo, refId).first();
  if (n >= 3) return json({ error: "Ya hay 3 versiones en prueba: cierra o quita una antes (con más, ninguna junta datos suficientes)." }, 409);
  let unico = 0;
  if (p.unico) {
    const primero = await env.CRM_DB.prepare("SELECT id FROM welcome_steps ORDER BY step_order ASC LIMIT 1").first();
    if (p.tipo !== "bienvenida" || primero?.id !== refId) return json({ error: "La versión en un solo mensaje va en el primer paso de la bienvenida." }, 400);
    unico = 1;
  }
  const media = unico && p.media_key ? {
    key: String(p.media_key).slice(0, 200),
    type: ["image", "video", "document"].includes(p.media_type) ? p.media_type : "image",
    mime: p.media_mime ? String(p.media_mime).slice(0, 100) : null
  } : null;
  await env.CRM_DB.prepare("INSERT INTO variantes (tipo, ref_id, texto, origen, motivo, unico, media_key, media_type, media_mime, catalogo, catalogo_nombre) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(p.tipo, refId, texto, quien(agent), String(p.motivo || "").slice(0, 300) || null, unico, media?.key || null, media?.type || null, media?.mime || null, envio?.catalogo || null, envio?.nombre || null)
    .run();
  return json({ ok: true });
}

/** Editar = retirar la versión y agregar la corregida (sus números empiezan de 0). */
async function editar(env, agent, id, texto, envio) {
  const v = await env.CRM_DB.prepare("SELECT * FROM variantes WHERE id = ? AND estado = 'activa'").bind(id).first();
  if (!v) return json({ error: "Esa versión ya no está en prueba." }, 404);
  const { catalogo, nombre } = envio && v.tipo === "rapida" ? envio : { catalogo: v.catalogo, nombre: v.catalogo_nombre };
  if (v.texto === texto && (v.catalogo || null) === (catalogo || null)) return json({ ok: true });
  const [, nueva] = await env.CRM_DB.batch([
    env.CRM_DB.prepare("UPDATE variantes SET estado = 'retirada', cerrada_at = datetime('now'), cerrada_por = ? WHERE id = ?").bind(quien(agent), id),
    env.CRM_DB.prepare("INSERT INTO variantes (tipo, ref_id, texto, origen, motivo, unico, media_key, media_type, media_mime, catalogo, catalogo_nombre) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(v.tipo, v.ref_id, texto, `${v.origen || "?"} · editada por ${quien(agent)}`, v.motivo, v.unico, v.media_key, v.media_type, v.media_mime, catalogo || null, nombre || null)
  ]);
  const nuevoId = nueva?.results?.[0]?.id;
  if (nuevoId) await reemplazarEnOrden(env.CRM_DB, v.tipo, v.ref_id, id, nuevoId);
  return json({ ok: true });
}

async function patch({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  if (p?.id && p?.texto !== undefined) {
    const texto = String(p.texto || "").trim().slice(0, 4096);
    const envio = leerEnvio(p);
    if (!texto && !envio?.catalogo) return json({ error: "La versión quedó vacía." }, 400);
    return editar(env, agent, Number(p.id), texto, envio);
  }
  const refId = Number(p?.ref_id);
  if (!TABLAS[p?.tipo] || !refId) return json({ error: "Falta tipo o ref_id." }, 400);
  if (p.orden !== undefined) {
    if (p.orden !== null && !Array.isArray(p.orden)) return json({ error: "orden inválido." }, 400);
    await guardarOrden(env.CRM_DB, p.tipo, refId, p.orden);
    return json({ ok: true });
  }
  if (!esAdmin(agent)) return soloAdmin();
  try {
    await cerrarPrueba(env.CRM_DB, p.tipo, refId, Number(p.ganadora) || 0, quien(agent));
  } catch (err) {
    return json({ error: err.message }, 409);
  }
  return json({ ok: true });
}

async function del({ request, env, agent }) {
  if (!esAdmin(agent)) return soloAdmin();
  const p = await request.json().catch(() => null);
  const id = Number(p?.id);
  if (!id) return json({ error: "Falta id." }, 400);
  await env.CRM_DB.prepare("UPDATE variantes SET estado = 'retirada', cerrada_at = datetime('now'), cerrada_por = ? WHERE id = ? AND estado = 'activa'")
    .bind(quien(agent), id)
    .run();
  return json({ ok: true });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);
export const onRequestPatch = conAuth(patch);
export const onRequestDelete = conAuth(del);
