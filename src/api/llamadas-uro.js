/**
 * Lista de llamadas de URO (migración 0058). Sin Claude ni artifacts: la
 * asesora la abre en /llamadas-uro/ con su cuenta del CRM.
 *
 * POST /api/asesor/llamadas-uro      (x-asesor-clave, la Routine)
 *      { writes: [{ doc_id, data }] }  — el lote que arma scripts/asesor/uro_llamadas.py.
 *      Inserta o actualiza los datos del chat. NUNCA toca el check (llamada,
 *      llamada_fecha, llamada_por): esas columnas no están en el upsert.
 * GET  /api/asesor/llamadas-uro?ya=1 (x-asesor-clave, la Routine)
 *      { documentos: [{ id, data: { ultimo_cliente } }] } — lo que ya está, para no repetir.
 * GET  /api/crm/llamadas-uro         (cuenta del CRM)
 *      { filas: [...] } — la lista para la página.
 * PATCH /api/crm/llamadas-uro/check  (cuenta del CRM)
 *      { wa, llamada: true|false } — marca o desmarca la llamada hecha.
 */

import { autorizadoAsesor } from "./asesor.js";
import { conAuth } from "../lib/crm-auth.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const RE_WA = /^\d{8,15}$/;
const TEXTO = (v, max) => (v === undefined || v === null ? "" : String(v).slice(0, max));

/** Campos del chat que la Routine puede escribir. Ningún campo del check. */
function datosDelChat(wa, data) {
  return {
    wa,
    nombre: TEXTO(data.nombre, 120),
    telefono: TEXTO(data.telefono, 30),
    interes: TEXTO(data.interes, 10),
    primer_contacto: TEXTO(data.primer_contacto, 20),
    ultimo_cliente: TEXTO(data.ultimo_cliente, 20),
    anuncio: TEXTO(data.anuncio, 200),
    asesora: TEXTO(data.asesora, 60),
    pedido_mencionado: data.pedido_mencionado ? 1 : 0,
    resumen: TEXTO(data.resumen, 1200),
    speech: TEXTO(data.speech, 2400),
    actualizado: TEXTO(data.actualizado, 20)
  };
}

const UPSERT = `INSERT INTO llamadas_uro (wa, nombre, telefono, interes, primer_contacto, ultimo_cliente, anuncio,
    asesora, pedido_mencionado, resumen, speech, actualizado)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  ON CONFLICT(wa) DO UPDATE SET nombre = excluded.nombre, telefono = excluded.telefono,
    interes = excluded.interes, primer_contacto = excluded.primer_contacto,
    ultimo_cliente = excluded.ultimo_cliente, anuncio = excluded.anuncio, asesora = excluded.asesora,
    pedido_mencionado = excluded.pedido_mencionado, resumen = excluded.resumen, speech = excluded.speech,
    actualizado = excluded.actualizado`;

export async function onRequestPostAsesor({ request, env }) {
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const cuerpo = await request.json().catch(() => null);
  const writes = Array.isArray(cuerpo?.writes) ? cuerpo.writes : null;
  if (!writes) return json({ error: "Falta writes." }, 400);
  if (writes.length > 200) return json({ error: "Máximo 200 por lote." }, 400);

  let guardados = 0;
  const rechazados = [];
  const sentencias = [];
  for (const w of writes) {
    const wa = String(w?.doc_id || "");
    if (!RE_WA.test(wa) || !w.data || typeof w.data !== "object") {
      rechazados.push(wa || "(sin doc_id)");
      continue;
    }
    const d = datosDelChat(wa, w.data);
    sentencias.push(env.CRM_DB.prepare(UPSERT).bind(
      d.wa, d.nombre, d.telefono, d.interes, d.primer_contacto, d.ultimo_cliente, d.anuncio,
      d.asesora, d.pedido_mencionado, d.resumen, d.speech, d.actualizado
    ));
    guardados++;
  }
  if (sentencias.length) await env.CRM_DB.batch(sentencias);
  return json({ guardados, rechazados });
}

export async function onRequestGetAsesor({ request, env }) {
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const { results } = await env.CRM_DB.prepare("SELECT wa, ultimo_cliente FROM llamadas_uro").all();
  return json({ documentos: results.map((r) => ({ id: r.wa, data: { ultimo_cliente: r.ultimo_cliente || "" } })) });
}

const get = async ({ env }) => {
  const { results } = await env.CRM_DB.prepare(
    `SELECT wa, nombre, telefono, interes, primer_contacto, ultimo_cliente, anuncio, asesora,
            pedido_mencionado, resumen, speech, actualizado, llamada, llamada_fecha, llamada_por
       FROM llamadas_uro
      ORDER BY (interes = 'Alta') DESC, ultimo_cliente DESC
      LIMIT 1000`
  ).all();
  return json({
    filas: results.map((r) => ({ ...r, pedido_mencionado: !!r.pedido_mencionado, llamada: !!r.llamada }))
  });
};

const check = async ({ request, env, agent }) => {
  const cuerpo = await request.json().catch(() => null);
  const wa = String(cuerpo?.wa || "");
  if (!RE_WA.test(wa) || typeof cuerpo?.llamada !== "boolean") return json({ error: "Faltan wa y llamada." }, 400);
  const marcada = cuerpo.llamada;
  const quien = agent?.displayName || agent?.username || "";
  const res = await env.CRM_DB.prepare(
    `UPDATE llamadas_uro SET llamada = ?1, llamada_fecha = ?2, llamada_por = ?3 WHERE wa = ?4`
  ).bind(marcada ? 1 : 0, marcada ? new Date().toISOString() : "", marcada ? quien : "", wa).run();
  if (!res.meta?.changes) return json({ error: "No existe esa llamada." }, 404);
  return json({ ok: true });
};

export const onRequestGetCrm = conAuth(get);
export const onRequestPatchCheck = conAuth(check);

// Sin la cookie del CRM, para las pruebas (scripts/pruebas/llamadas-uro.test.mjs).
export const handlersCrm = { get, check };
