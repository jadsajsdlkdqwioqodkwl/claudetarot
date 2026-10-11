/**
 * Seguimiento de una plantilla: "después de mandar ESTA plantilla, programa estas otras a los N días".
 * Lo configura el admin con el lápiz de cada plantilla (CRM → botón de plantillas) y al mandarla desde un
 * chat quedan programadas solas. Ejemplo de fábrica: el «aviso de envío» de Shalom deja listos los 3
 * recordatorios de recojo (4, 7 y 21 días). El admin puede cambiarlo o quitarlo (ajuste `plantillas_seguimiento`).
 *
 * Cada paso es una plantilla ya aprobada en Meta (el cron la manda recién cuando lo esté) y sus días se
 * cuentan desde el paso anterior (el primero, desde que se manda la plantilla), así se pueden reordenar.
 * Un paso apagado (activo: false) se queda guardado pero no se programa. Sin "seguir aunque responda", si el cliente escribe
 * lo que falta se cancela, como cualquier seguimiento. El recojo en Shalom no se cancela: se vuelve a contar
 * desde su mensaje (rearmarPlanShalom).
 */

import { obtenerAjuste, guardarAjuste, siempreGlobal } from "./crm-db.js";
import { PREFIJO_PLAN, IDIOMA_PLAN, leerDias } from "./planes-plantilla.js";

const CLAVE = "plantillas_seguimiento";
export const PREFIJO_SEGUIMIENTO_PLANTILLA = "Seguimiento con plantilla";
const RE_RECOJO = /recojo_shalom_\d$/;

async function leerAjustado(db) {
  try {
    return JSON.parse((await obtenerAjuste(db, CLAVE)) || "{}") || {};
  } catch {
    return {};
  }
}

/** Lo de fábrica: cada «aviso de envío» arrastra su recojo en Shalom (4, 7 y 21 días desde el aviso = 4, 3 y 14 entre pasos). */
async function deFabrica(db) {
  const dias = leerDias(await obtenerAjuste(db, "plan_dias").catch(() => null));
  const recojo = (prefijo) => [1, 2, 3].map((n, i) => ({ plantilla: `${prefijo}recojo_shalom_${n}`, dias: dias[i] - (dias[i - 1] || 0), activo: true }));
  return {
    aviso_envio_shalom: { pasos: recojo(""), siempre: false, relativo: true, defecto: true },
    uro_aviso_envio_shalom: { pasos: recojo("uro_"), siempre: false, relativo: true, defecto: true }
  };
}

/** Lo guardado antes de que los días fueran "desde el paso anterior" (contaban desde el envío): se convierte. */
function comoRelativo(cfg) {
  if (cfg.relativo) return cfg;
  let previo = 0;
  const pasos = [...(cfg.pasos || [])].sort((a, b) => a.dias - b.dias).map((p) => { const d = Math.max(0.25, p.dias - previo); previo = p.dias; return { ...p, dias: d, activo: true }; });
  return { ...cfg, pasos, relativo: true };
}

/** { [plantilla]: { pasos: [{ plantilla, dias, activo }], siempre, defecto? } } — lo de fábrica con lo que el admin cambió encima. */
export async function seguimientosDePlantillas(db) {
  const guardado = await leerAjustado(db);
  return { ...(await deFabrica(db)), ...Object.fromEntries(Object.entries(guardado).map(([k, v]) => [k, comoRelativo(v)])) };
}

export async function guardarSeguimientoDePlantilla(db, nombre, { pasos, siempre, restablecer }) {
  const todo = await leerAjustado(db);
  if (restablecer) {
    delete todo[nombre];
  } else {
    const limpios = (Array.isArray(pasos) ? pasos : []).slice(0, 5).map((p) => ({ plantilla: String(p?.plantilla || "").trim().slice(0, 100), dias: Number(p?.dias), activo: p?.activo !== false }));
    if (limpios.some((p) => !/^[a-z0-9_]+$/.test(p.plantilla) || !(p.dias >= 0.25 && p.dias <= 60))) throw new Error("Cada paso: una plantilla y de 1/4 de día a 60 días.");
    todo[nombre] = { pasos: limpios.map((p) => ({ ...p, dias: Math.round(p.dias * 4) / 4 })), siempre: Boolean(siempre), relativo: true };
  }
  await guardarAjuste(db, CLAVE, JSON.stringify(todo));
}

/**
 * Se acaba de mandar `nombre` a este chat: programa su seguimiento (si tiene). Reemplaza al que ya
 * estuviera pendiente de esa misma plantilla. Devuelve cuántos pasos quedaron.
 */
export async function programarSeguimientoDePlantilla(env, conversationId, nombre, quien) {
  const db = env.CRM_DB;
  const cfg = (await seguimientosDePlantillas(db))[nombre];
  const activos = (cfg?.pasos || []).filter((p) => p.activo !== false);
  if (!activos.length) return 0;
  const recojo = activos.every((p) => RE_RECOJO.test(p.plantilla));
  const origen = recojo ? `${PREFIJO_PLAN} · Recojo en Shalom · ${quien || "CRM"}` : `${PREFIJO_SEGUIMIENTO_PLANTILLA} · ${nombre} · ${quien || "CRM"}`;
  const siempre = cfg.siempre || (await siempreGlobal(db)) ? 1 : 0; // el recojo también: «sí o sí» manda todo
  const ahora = Date.now();
  let previo = 0;
  let acumulado = 0;
  const filas = activos.map((p, i) => {
    acumulado += p.dias * 86400000;
    const cuando = Math.max(ahora + acumulado, ahora + 10 * 60000 + i * 60000, previo + 60000);
    previo = cuando;
    return db.prepare(
      `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, template_name, template_language, mandar_siempre, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`
    ).bind(conversationId, `Plantilla: ${p.plantilla}`, new Date(cuando).toISOString(), origen, p.plantilla, IDIOMA_PLAN, siempre);
  });
  await db.batch([
    // Reemplaza lo que esa misma plantilla ya había programado (también el recojo de fábrica del aviso de envío).
    // instr en vez de LIKE: D1 rechaza patrones LIKE de más de 50 bytes.
    db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND (instr(created_by, ?) = 1 OR instr(created_by, ?) = 1)")
      .bind(conversationId, `${PREFIJO_SEGUIMIENTO_PLANTILLA} · ${nombre} · `, nombre.includes("aviso_envio_shalom") ? `${PREFIJO_PLAN} · Recojo en Shalom` : "\u0000no-aplica"),
    ...filas
  ]);
  return filas.length;
}
