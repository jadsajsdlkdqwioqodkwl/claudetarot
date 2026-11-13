/**
 * Agencias de Shalom para todo el sistema (dueño 2026-11-13: «que la agencia sea la correcta EN TODOS LADOS»).
 *
 * GET  /api/asesor/shalom-agencias[?forzar=1]   (x-asesor-clave)
 *      La lista de agencias del día. El Worker la baja de la API pública que usa shalom.com.pe/agencias UNA vez al día (hora de
 *      Lima) y la guarda en R2 (`shalom/agencias.json`); si la versión de Shalom no cambió, solo anota que se revisó. Si la API
 *      falla o cambia de forma, se sigue con la última copia buena y la respuesta trae `error` (quien llama avisa por Telegram).
 *      También devuelve `confirmadas` (la agencia que una persona confirmó para cada pedido) y `aviso_plantilla` (la última versión
 *      por la que ya se avisó que la plantilla del Excel quedó vieja).
 * POST /api/asesor/shalom-agencias              (x-asesor-clave)
 *      { accion: "confirmar", whatsapp, fecha, agencia, codigo?, quien?, texto? }  → memoria de lo confirmado (R2 `shalom/confirmadas.json`)
 *      { accion: "olvidar", whatsapp }                                              → borra esa confirmación
 *      { accion: "osm", consultas: [{ q }] }                                        → OpenStreetMap (Nominatim) con caché en R2
 *                                                                                     (`shalom/osm-cache.json`), 1 consulta por segundo
 *      { accion: "aviso_plantilla", version }                                       → anota que ya se avisó por esa versión
 *      { accion: "plantilla", archivo_base64, quien? }                              → guarda la plantilla NUEVA del Excel masivo que
 *                                                                                     una persona bajó de Shalom Pro (R2 `shalom/plantilla.xlsx`)
 * GET  /api/asesor/shalom-agencias?plantilla=1  → esa plantilla (xlsx) si existe; 404 si se sigue usando la del repo
 *
 * Nada de esto escribe a clientes. Las claves de recojo no pasan por aquí.
 */
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";

const API = "https://newwebservices.shalomcontrol.com/api/v1/web/agencias";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const ahoraLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
const n9 = (v) => String(v || "").replace(/\D/g, "").slice(-9);
const leer = (env, k, def) => env.CRM_MEDIA.get(k).then((o) => (o ? o.json() : def)).catch(() => def);
const escribir = (env, k, d) => env.CRM_MEDIA.put(k, JSON.stringify(d), { httpMetadata: { contentType: "application/json" } });

async function pedirShalom(ruta) {
  const res = await fetch(`${API}/${ruta}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}", signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`la API de Shalom respondió ${res.status} en ${ruta}`);
  return res.json();
}

/** La misma forma que `data/shalom-agencias.json` (scripts/asesor/shalom.py `actualizar`). */
export function normalizarAgencias(lista) {
  return (lista || []).filter((a) => a && a.nombre).map((a) => ({
    id: a.ter_id, codigo: a.nombre, departamento: a.departamento, provincia: a.provincia, distrito: a.zona,
    agencia: a.lugar_over || String(a.nombre || "").split(" / ").pop(), direccion: a.direccion || "", horario: a.hora_atencion || "",
    lat: a.latitud, lng: a.longitud, origen: a.origen, destino: a.destino, principal: a.ter_principal, categoria: a.ter_categoria
  }));
}

/** Baja las agencias si la copia no es de hoy. Nunca reemplaza una copia buena por una respuesta rara de la API. */
export async function agenciasDelDia(env, forzar = false) {
  const guardado = await leer(env, "shalom/agencias.json", null);
  const hoy = hoyLima();
  if (guardado && guardado.revisado === hoy && !forzar) return guardado;
  try {
    const version = (await pedirShalom("version"))?.data;
    if (guardado && String(guardado.version) === String(version) && !forzar) {
      const d = { ...guardado, revisado: hoy, error: null };
      await escribir(env, "shalom/agencias.json", d);
      return d;
    }
    const agencias = normalizarAgencias((await pedirShalom("listar"))?.data);
    // La API cambió de forma o devolvió casi nada: no se pisa lo que hay.
    if (agencias.length < 300 || !agencias.every((a) => a.codigo && a.agencia)) throw new Error(`la API de Shalom devolvió ${agencias.length} agencias o campos distintos a los esperados`);
    const d = { fuente: `${API}/listar (API pública de shalom.com.pe/agencias)`, version, bajado: hoy, revisado: hoy, version_anterior: guardado?.version ?? null, error: null, agencias };
    await escribir(env, "shalom/agencias.json", d);
    return d;
  } catch (err) {
    console.error("Agencias de Shalom:", err.message);
    if (!guardado) return { error: err.message, agencias: [] };
    // Se anota el intento (para no reintentar en cada llamada del día) y se sigue con la copia que hay.
    const d = { ...guardado, revisado: hoy, error: `${ahoraLima()}: ${err.message}` };
    await escribir(env, "shalom/agencias.json", d).catch(() => {});
    return d;
  }
}

async function osm(env, consultas) {
  const cache = await leer(env, "shalom/osm-cache.json", {});
  const out = [];
  let nuevas = 0;
  for (const c of (consultas || []).slice(0, 8)) {
    const q = String(c?.q || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!q) continue;
    const k = q.toLowerCase();
    if (cache[k]) { out.push({ q, ...cache[k], cache: true }); continue; }
    if (nuevas) await new Promise((r) => setTimeout(r, 1100)); // uso responsable: como mucho una consulta por segundo
    nuevas++;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=pe&q=${encodeURIComponent(q)}`,
        { headers: { "User-Agent": "tarot-store-envios/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) { out.push({ q, error: `Nominatim respondió ${res.status}` }); continue; }
      const hits = ((await res.json()) || []).map((h) => ({ lat: parseFloat(h.lat), lng: parseFloat(h.lon), nombre: String(h.display_name || "").slice(0, 160), tipo: `${h.category || ""}/${h.type || ""}` }))
        .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng));
      cache[k] = { hits, cuando: hoyLima() };
      out.push({ q, hits, cuando: hoyLima() });
    } catch (err) { out.push({ q, error: err.message }); }
  }
  if (nuevas) await escribir(env, "shalom/osm-cache.json", cache).catch(() => {});
  return out;
}

async function puerta(request, env) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_MEDIA) return json({ error: "Falta el bucket R2." }, 503);
  return null;
}

export async function onRequestGet({ request, env }) {
  const corte = await puerta(request, env);
  if (corte) return corte;
  if (new URL(request.url).searchParams.get("plantilla") === "1") {
    const obj = await env.CRM_MEDIA.get("shalom/plantilla.xlsx");
    if (!obj) return json({ error: "No hay plantilla subida: se usa la del repo." }, 404);
    return new Response(obj.body, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Cache-Control": "no-store", "X-Plantilla-Subida": obj.customMetadata?.cuando || "" } });
  }
  const d = await agenciasDelDia(env, new URL(request.url).searchParams.get("forzar") === "1");
  const estado = await leer(env, "shalom/confirmadas.json", {});
  return json({ ok: true, ...d, confirmadas: estado.confirmadas || {}, aviso_plantilla: estado.aviso_plantilla || null, aviso_api: estado.aviso_api || null, plantilla_subida: estado.plantilla_subida || null });
}

export async function onRequestPost({ request, env }) {
  const corte = await puerta(request, env);
  if (corte) return corte;
  const p = await request.json().catch(() => null);
  if (p?.accion === "osm") return json({ ok: true, resultados: await osm(env, p.consultas) });
  const estado = await leer(env, "shalom/confirmadas.json", {});
  estado.confirmadas = estado.confirmadas || {};
  if (p?.accion === "confirmar") {
    const k = n9(p.whatsapp);
    if (!k || !String(p.agencia || "").trim()) return json({ error: "Faltan whatsapp y agencia." }, 400);
    estado.confirmadas[k] = { agencia: String(p.agencia).trim().slice(0, 120), codigo: String(p.codigo || "").slice(0, 200), fecha: String(p.fecha || hoyLima()).slice(0, 10),
      quien: String(p.quien || "").slice(0, 60), texto: String(p.texto || "").slice(0, 300), cuando: ahoraLima() };
    // Solo se guardan los últimos 60 días.
    const limite = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    for (const [w, c] of Object.entries(estado.confirmadas)) if (String(c.fecha || "") < limite) delete estado.confirmadas[w];
    await escribir(env, "shalom/confirmadas.json", estado);
    return json({ ok: true, whatsapp: k, confirmada: estado.confirmadas[k] });
  }
  if (p?.accion === "olvidar") {
    delete estado.confirmadas[n9(p.whatsapp)];
    await escribir(env, "shalom/confirmadas.json", estado);
    return json({ ok: true });
  }
  if (p?.accion === "plantilla") {
    let bytes;
    try { bytes = Uint8Array.from(atob(String(p.archivo_base64 || "")), (c) => c.charCodeAt(0)); } catch { return json({ error: "Archivo inválido." }, 400); }
    // Un xlsx es un zip («PK»); la plantilla oficial pesa unas decenas de KB.
    if (bytes.length < 5000 || bytes.length > 3 * 1024 * 1024 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return json({ error: "Eso no parece la plantilla .xlsx de Shalom." }, 400);
    await env.CRM_MEDIA.put("shalom/plantilla.xlsx", bytes, { customMetadata: { cuando: ahoraLima(), quien: String(p.quien || "").slice(0, 60) } });
    estado.plantilla_subida = { cuando: ahoraLima(), quien: String(p.quien || "").slice(0, 60), bytes: bytes.length };
    await escribir(env, "shalom/confirmadas.json", estado);
    return json({ ok: true, plantilla_subida: estado.plantilla_subida });
  }
  if (p?.accion === "aviso_plantilla" || p?.accion === "aviso_api") {
    estado[p.accion] = String(p.version || hoyLima()).slice(0, 40);
    await escribir(env, "shalom/confirmadas.json", estado);
    return json({ ok: true });
  }
  return json({ error: "Acción inválida." }, 400);
}
